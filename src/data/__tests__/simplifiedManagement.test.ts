// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createMigratedDatabase,
  applyMigrations,
} from "./support/migratedDatabase";
import {
  applicationSchema,
  releaseSchema,
  publicCatalogSchema,
} from "@/lib/contracts";

const migration = "20261030230000_shiplog_simplify_management.sql";
const owner = "11111111-1111-4111-8111-111111111111";
const editor = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
const accounts = [owner, editor, viewer, outsider].map((id, i) => ({
  id,
  email: `user${i}@example.com`,
}));
let db: PGlite;
let workspace: string;
let app: string;
let team: string;
let foreignTeam: string;
let legacyRelease: string;
async function login(account: string | null, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    account ?? "",
  ]);
  await db.exec(`set role ${role}`);
}
async function value<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, args)).rows[0]!.value;
}
async function create(version: string, application = app) {
  return releaseSchema.parse(
    await value(
      "select to_jsonb(public.shiplog_create_release($1::jsonb)) as value",
      [
        JSON.stringify({
          application_id: application,
          version,
          title: version,
          public_notes: "Hello",
        }),
      ],
    ),
  );
}
beforeAll(async () => {
  db = await createMigratedDatabase(accounts, { until: migration });
  await login(owner);
  workspace = await value(
    "select id as value from public.create_workspace('Simplified')",
  );
  for (const [email, appName, access] of [
    ["user1@example.com", "shiplog", "editor"],
    ["user2@example.com", "shiplog", "viewer"],
    ["user3@example.com", "planner", "editor"],
  ])
    await db.query("select public.share_workspace($1,$2,$3,$4)", [
      workspace,
      email,
      appName,
      access,
    ]);
  team = await value(
    "select id as value from public.create_team('Existing team',$1)",
    [workspace],
  );
  const otherWorkspace = await value(
    "select id as value from public.create_workspace('Other')",
  );
  foreignTeam = await value(
    "select id as value from public.create_team('Other team',$1)",
    [otherWorkspace],
  );
  app = await value(
    "select (public.shiplog_create_application($1,'Legacy','private-identifier','web')).id as value",
    [workspace],
  );
  legacyRelease = await value(
    "select (public.shiplog_create_release($1::jsonb)).id as value",
    [
      JSON.stringify({
        application_id: app,
        version: "0.1.0",
        release_type: "minor",
        title: "Legacy",
        internal_notes: "ERASE-ME",
      }),
    ],
  );
  await db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
    legacyRelease,
    JSON.stringify({
      application_id: app,
      version: "0.1.0",
      release_type: "minor",
      title: "Legacy",
      internal_notes: "ERASE-ME-AGAIN",
    }),
  ]);
  await db.query(
    "select public.shiplog_transition_readiness($1,'ready_for_qa','')",
    [legacyRelease],
  );
  await db.query("select public.shiplog_record_manual_qa($1,'passed','')", [
    legacyRelease,
  ]);
  await db.query(
    "select public.shiplog_transition_readiness($1,'approved','')",
    [legacyRelease],
  );
  await login(owner, "postgres");
  await db.query(
    "update public.shiplog_audit_events set details=$2::jsonb where application_id=$1 and event='application.created'",
    [
      app,
      JSON.stringify({
        slug: "private-identifier",
        platform: "web",
        before: { slug: "old", platform: "ios" },
        after: { slug: "new", platform: "web" },
      }),
    ],
  );
  await applyMigrations(db, { from: migration });
  await login(owner);
});
afterAll(async () => {
  await db?.close();
});

describe("simplified release management on the complete migration chain", () => {
  it("permanently removes obsolete columns and audit snapshots while preserving member approval", async () => {
    const application = await value<Record<string, unknown>>(
      "select to_jsonb(a) as value from public.shiplog_applications a where id=$1",
      [app],
    );
    expect(applicationSchema.parse(application).team_id).toBeNull();
    expect(application).not.toHaveProperty("slug");
    expect(application).not.toHaveProperty("platform");
    const release = await value<Record<string, unknown>>(
      "select to_jsonb(r) as value from public.shiplog_releases r where id=$1",
      [legacyRelease],
    );
    expect(release).not.toHaveProperty("internal_notes");
    expect(release.status).toBe("qa");
    const audit = await db.query(
      "select details from public.shiplog_audit_events where release_id=$1",
      [legacyRelease],
    );
    expect(JSON.stringify(audit.rows)).not.toContain("internal_notes");
    expect(JSON.stringify(audit.rows)).not.toContain("ERASE-ME");
    const appAudit = await db.query(
      "select details from public.shiplog_audit_events where application_id=$1 and event='application.created'",
      [app],
    );
    expect(appAudit.rows).toEqual([{ details: { before: {}, after: {} } }]);
    const decisions = await db.query<{ approved: boolean; name: string }>(
      "select * from public.shiplog_list_release_decisions($1)",
      [legacyRelease],
    );
    expect(
      decisions.rows.find((row) => row.name === accounts[0]!.email)?.approved,
    ).toBe(true);
    for (const sql of [
      "select public.shiplog_transition_readiness($1,'approved','')",
      "select public.shiplog_record_manual_qa($1,'passed','')",
    ])
      await expect(db.query(sql, [legacyRelease])).rejects.toThrow(
        /does not exist/,
      );
  });
  it("edits applications, reuses optional workspace teams across apps and rejects cross-workspace teams", async () => {
    await login(editor);
    const edited = applicationSchema.parse(
      await value(
        "select to_jsonb(public.shiplog_save_application($1,'Renamed','Description',$2,$3)) as value",
        [workspace, team, app],
      ),
    );
    expect(edited.name).toBe("Renamed");
    expect(edited.team_id).toBe(team);
    const another = applicationSchema.parse(
      await value(
        "select to_jsonb(public.shiplog_save_application($1,'Another','',$2)) as value",
        [workspace, team],
      ),
    );
    expect(another.team_id).toBe(team);
    await expect(
      db.query("select public.shiplog_save_application($1,'Wrong','',$2,$3)", [
        workspace,
        foreignTeam,
        app,
      ]),
    ).rejects.toThrow(/Team must belong/);
    const unlinked = applicationSchema.parse(
      await value(
        "select to_jsonb(public.shiplog_save_application($1,'Renamed','',null,$2)) as value",
        [workspace, app],
      ),
    );
    expect(unlinked.team_id).toBeNull();
    const teams = await db.query<{ id: string }>(
      "select * from public.shiplog_list_teams($1)",
      [workspace],
    );
    expect(teams.rows.map((row) => row.id)).toEqual([team]);
    await login(owner);
  });
  it("automatically detects types using numeric SemVer precedence including prerelease and build identifiers", async () => {
    const application = await value<string>(
      "select (public.shiplog_save_application($1,'Versions')).id as value",
      [workspace],
    );
    for (const [version, type] of [
      ["0.1.0", "minor"],
      ["0.1.1", "patch"],
      ["1.0.0-beta.2", "major"],
      ["1.0.0-beta.10", "patch"],
      ["1.0.0", "patch"],
      ["1.9.0", "minor"],
      ["1.10.0+build.2", "minor"],
      ["2.0.0", "major"],
      ["1.8.0", "patch"],
      ["2.1.0", "minor"],
    ])
      expect((await create(version!, application)).release_type).toBe(type);
    const release = await create("3.0.0", application);
    const updated = releaseSchema.parse(
      await value(
        "select to_jsonb(public.shiplog_update_draft($1,$2::jsonb)) as value",
        [
          release.id,
          JSON.stringify({
            application_id: application,
            version: "2.1.1",
            title: "Adjusted",
            public_notes: "",
          }),
        ],
      ),
    );
    expect(updated.release_type).toBe("patch");
    await login(owner, "postgres");
    for (const [a, b, result] of [
      ["1.0.0-rc.2", "1.0.0-rc.10", -1],
      ["1.0.0-rc.10", "1.0.0", -1],
      ["1.0.0+x", "1.0.0+y", 0],
      ["1.10.0", "1.9.0", 1],
      ["1.0.0-1", "1.0.0-alpha", -1],
      ["1.0.0-alpha", "1.0.0-alpha.1", -1],
      ["9007199254740993.0.0", "9007199254740992.0.0", 1],
      ["1.0.0-9007199254740993", "1.0.0-9007199254740992", 1],
    ])
      expect(
        await value("select public.shiplog_compare_versions($1,$2) as value", [
          a,
          b,
        ]),
      ).toBe(result);
    await login(owner);
  });
  it("edits published/deployed release notes immediately, audits edits and keeps other historical content locked", async () => {
    const release = await create("1.0.0");
    await db.query("select public.shiplog_publish_release($1,true)", [
      release.id,
    ]);
    await db.query("select public.shiplog_set_application_public($1,true)", [
      app,
    ]);
    const token = await value(
      "select public.shiplog_portal($1,true) as value",
      [workspace],
    );
    await login(editor);
    await db.query(
      "select public.shiplog_update_public_notes($1,'Updated public story')",
      [release.id],
    );
    await expect(
      db.query("select public.shiplog_update_public_notes($1,$2)", [
        release.id,
        "x".repeat(20001),
      ]),
    ).rejects.toThrow(/Invalid/);
    await expect(
      db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
        release.id,
        JSON.stringify({
          application_id: app,
          version: "1.0.0",
          title: "Rewrite",
        }),
      ]),
    ).rejects.toThrow(/never-published/);
    await login(null, "anon");
    const catalog = publicCatalogSchema.parse(
      await value("select public.shiplog_public_catalog($1) as value", [token]),
    );
    expect(
      catalog.releases.find((row) => row.id === release.id)?.public_notes,
    ).toBe("Updated public story");
    await login(owner);
    const audit = await value(
      "select details as value from public.shiplog_audit_events where release_id=$1 and event='release.notes_updated'",
      [release.id],
    );
    expect(audit).toEqual({ before: "Hello", after: "Updated public story" });
  });
  it("allows all workspace members to approve or disapprove only for themselves without altering status", async () => {
    const release = await create("1.1.0");
    for (const account of [owner, editor, viewer]) {
      await login(account);
      await db.query("select public.shiplog_decide_release($1,true)", [
        release.id,
      ]);
      await db.query("select public.shiplog_decide_release($1,false)", [
        release.id,
      ]);
      const decisions = await db.query<{ user_id: string; approved: boolean }>(
        "select * from public.shiplog_list_release_decisions($1)",
        [release.id],
      );
      expect(decisions.rows).toHaveLength(3);
      expect(
        decisions.rows.find((row) => row.user_id === account)?.approved,
      ).toBe(false);
    }
    await expect(
      db.query("update public.shiplog_release_decisions set approved=true"),
    ).rejects.toThrow(/permission denied/);
    await login(owner);
    expect(
      await value(
        "select status as value from public.shiplog_releases where id=$1",
        [release.id],
      ),
    ).toBe("draft");
    for (const account of [outsider, null]) {
      await login(account, account ? "authenticated" : "anon");
      await expect(
        db.query("select public.shiplog_decide_release($1,true)", [release.id]),
      ).rejects.toThrow(/access required|permission denied/);
      await expect(
        db.query("select * from public.shiplog_list_release_decisions($1)", [
          release.id,
        ]),
      ).rejects.toThrow(/access required|permission denied/);
      await expect(
        db.query("select * from public.shiplog_list_teams($1)", [workspace]),
      ).rejects.toThrow(/access required|permission denied/);
    }
    await login(owner);
  });
  it("keeps QA checks and manual status independent of decisions, deployment and publication", async () => {
    await db.query(
      "select public.shiplog_save_checklist_template($1,$2::jsonb,0)",
      [
        app,
        JSON.stringify([
          {
            title: "Test passed",
            category: "QA",
            description: "",
            mandatory: true,
          },
        ]),
      ],
    );
    const release = await create("1.2.0");
    const item = await value<string>(
      "select id as value from public.shiplog_checklist_items where release_id=$1",
      [release.id],
    );
    await login(editor);
    for (const status of ["released", "qa", "draft"]) {
      await db.query("select public.shiplog_set_release_status($1,$2)", [
        release.id,
        status,
      ]);
      expect(
        await value(
          "select status as value from public.shiplog_releases where id=$1",
          [release.id],
        ),
      ).toBe(status);
    }
    await db.query("select public.shiplog_set_release_status($1,'released')", [
      release.id,
    ]);
    await db.query(
      "select public.shiplog_complete_checklist_item($1,$2,true)",
      [release.id, item],
    );
    expect(
      await value(
        "select completed_by as value from public.shiplog_checklist_items where id=$1",
        [item],
      ),
    ).toBe(editor);
    await db.query("select public.shiplog_decide_release($1,true)", [
      release.id,
    ]);
    const env = await value<string>(
      "select id as value from public.shiplog_environments where application_id=$1 and kind='production'",
      [app],
    );
    const deployment = await value<{ readiness_warnings: string[] }>(
      "select to_jsonb(public.shiplog_record_deployment($1::jsonb)) as value",
      [
        JSON.stringify({
          environment_id: env,
          release_id: release.id,
          outcome: "succeeded",
          started_at: "2026-01-01T10:00:00Z",
          completed_at: "2026-01-01T12:00:00Z",
          source: "Manual",
        }),
      ],
    );
    expect(deployment.readiness_warnings).toEqual([]);
    await db.query("select public.shiplog_decide_release($1,false)", [
      release.id,
    ]);
    const warning = await value<{ readiness_warnings: string[] }>(
      "select to_jsonb(public.shiplog_record_deployment($1::jsonb)) as value",
      [
        JSON.stringify({
          environment_id: env,
          release_id: release.id,
          outcome: "failed",
          started_at: "2026-01-02T10:00:00Z",
          completed_at: "2026-01-02T12:00:00Z",
          source: "Manual",
        }),
      ],
    );
    expect(warning.readiness_warnings).toEqual(["release_not_approved"]);
    await login(viewer);
    for (const operation of [
      () =>
        db.query("select public.shiplog_set_release_status($1,'qa')", [
          release.id,
        ]),
      () =>
        db.query("select public.shiplog_update_public_notes($1,'No')", [
          release.id,
        ]),
      () =>
        db.query("select public.shiplog_complete_checklist_item($1,$2,false)", [
          release.id,
          item,
        ]),
      () =>
        db.query("select public.shiplog_save_application($1,'No')", [
          workspace,
        ]),
    ])
      await expect(operation()).rejects.toThrow(/edit access required/);
    await login(owner);
    const row = releaseSchema.parse(
      await value(
        "select to_jsonb(r) as value from public.shiplog_releases r where id=$1",
        [release.id],
      ),
    );
    expect(row.status).toBe("released");
    expect(row.published_at).toBeNull();
    await db.query(
      "select public.shiplog_update_public_notes($1,'Notes after deployment')",
      [release.id],
    );
    expect(
      await value(
        "select public_notes as value from public.shiplog_releases where id=$1",
        [release.id],
      ),
    ).toBe("Notes after deployment");
    await expect(
      db.query("select public.shiplog_set_release_status($1,'approved')", [
        release.id,
      ]),
    ).rejects.toThrow(/Invalid release status/);
  });
  it("snapshots QA checks per release rather than changing past checks with new templates", async () => {
    const application = await value<string>(
      "select (public.shiplog_save_application($1,'Snapshots')).id as value",
      [workspace],
    );
    const item = {
      title: "Initial check",
      category: "QA",
      description: "",
      mandatory: true,
    };
    await db.query(
      "select public.shiplog_save_checklist_template($1,$2::jsonb,0)",
      [application, JSON.stringify([item])],
    );
    const first = await create("1.0.0", application);
    await db.query(
      "select public.shiplog_save_checklist_template($1,$2::jsonb,1)",
      [application, JSON.stringify([{ ...item, title: "Later check" }])],
    );
    const second = await create("1.1.0", application);
    expect(
      await value(
        "select title as value from public.shiplog_checklist_items where release_id=$1",
        [first.id],
      ),
    ).toBe("Initial check");
    expect(
      await value(
        "select title as value from public.shiplog_checklist_items where release_id=$1",
        [second.id],
      ),
    ).toBe("Later check");
  });
  it("excludes former members' decisions from approval warnings and the member list", async () => {
    const ws = await value<string>(
      "select id as value from public.create_workspace('Membership changes')",
    );
    await db.query(
      "select public.share_workspace($1,'user2@example.com','shiplog','viewer')",
      [ws],
    );
    const application = await value<string>(
      "select (public.shiplog_save_application($1,'Membership')).id as value",
      [ws],
    );
    const release = await create("1.0.0", application);
    await db.query("select public.shiplog_decide_release($1,true)", [
      release.id,
    ]);
    await login(viewer);
    await db.query("select public.shiplog_decide_release($1,false)", [
      release.id,
    ]);
    await login(owner);
    await db.query("select public.remove_workspace_share($1,$2,'shiplog')", [
      ws,
      viewer,
    ]);
    const decisions = await db.query(
      "select * from public.shiplog_list_release_decisions($1)",
      [release.id],
    );
    expect(decisions.rows).toHaveLength(1);
    const env = await value<string>(
      "select id as value from public.shiplog_environments where application_id=$1 and kind='production'",
      [application],
    );
    const deployment = await value<{ readiness_warnings: string[] }>(
      "select to_jsonb(public.shiplog_record_deployment($1::jsonb)) as value",
      [
        JSON.stringify({
          environment_id: env,
          release_id: release.id,
          outcome: "succeeded",
          started_at: "2026-01-01T10:00:00Z",
          completed_at: "2026-01-01T12:00:00Z",
          source: "Manual",
        }),
      ],
    );
    expect(deployment.readiness_warnings).toEqual([]);
    await login(viewer);
    await expect(
      db.query("select public.shiplog_decide_release($1,true)", [release.id]),
    ).rejects.toThrow(/access required/);
    expect(
      (
        await db.query(
          "select * from public.shiplog_release_decisions where release_id=$1",
          [release.id],
        )
      ).rows,
    ).toEqual([]);
    await login(owner);
  });
  it("sets application teams to null on deletion without deleting applications or releases", async () => {
    await login(owner, "postgres");
    await db.query("delete from public.teams where id=$1", [team]);
    await login(owner);
    expect(
      await value(
        "select team_id as value from public.shiplog_applications where name='Another' and workspace_id=$1",
        [workspace],
      ),
    ).toBeNull();
    expect(
      await value(
        "select count(*)::integer as value from public.shiplog_releases where application_id=$1",
        [app],
      ),
    ).toBeGreaterThan(0);
  });
});
