// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { z } from "zod";
import {
  createMigratedDatabase,
  applyMigrations,
} from "./support/migratedDatabase";
import { applicationSchema, releaseSchema } from "@/lib/contracts";
import { releaseOnlyCatalogSchema as publicCatalogSchema } from "./support/legacyContracts";

const migration = "20261030232000_shiplog_release_only.sql";
const owner = "11111111-1111-4111-8111-111111111111";
const editor = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
let workspace: string;
let application: string;
let token: string;
let legacy: string;
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
async function create(version: string, app = application) {
  return releaseSchema.parse(
    await value(
      "select to_jsonb(public.shiplog_create_release($1::jsonb)) as value",
      [
        JSON.stringify({
          application_id: app,
          version,
          title: version,
          public_notes: "Public story",
        }),
      ],
    ),
  );
}
beforeAll(async () => {
  db = await createMigratedDatabase(
    [owner, editor, viewer, outsider].map((id, i) => ({
      id,
      email: `member${i}@example.com`,
    })),
    { until: migration },
  );
  await login(owner);
  workspace = await value(
    "select id as value from public.create_workspace('Releases only')",
  );
  for (const [email, app, access] of [
    ["member1@example.com", "shiplog", "editor"],
    ["member2@example.com", "shiplog", "viewer"],
    ["member3@example.com", "planner", "editor"],
  ])
    await db.query("select public.share_workspace($1,$2,$3,$4)", [
      workspace,
      email,
      app,
      access,
    ]);
  application = await value(
    "select (public.shiplog_save_application($1,'Website')).id as value",
    [workspace],
  );
  legacy = (await create("0.1.0")).id;
  await db.query("select public.shiplog_publish_release($1,true)", [legacy]);
  await db.query("select public.shiplog_decide_release($1,true)", [legacy]);
  const environment = await value<string>(
    "select id as value from public.shiplog_environments where application_id=$1 and kind='production'",
    [application],
  );
  await db.query("select public.shiplog_record_deployment($1::jsonb)", [
    JSON.stringify({
      environment_id: environment,
      release_id: legacy,
      outcome: "succeeded",
      started_at: "2026-01-01T10:00:00Z",
      completed_at: "2026-01-01T11:00:00Z",
      source: "Manual",
      notes: "ERASE-DEPLOYMENT-DETAILS",
    }),
  ]);
  await login(owner, "postgres");
  // Capture retired timestamps inside an existing before/after audit snapshot too.
  await db.query(
    "insert into public.shiplog_audit_events(workspace_id,release_id,event,details) select $1,id,'release.updated',jsonb_build_object('before',to_jsonb(r),'after',to_jsonb(r)) from public.shiplog_releases r where id=$2",
    [workspace, legacy],
  );
  await applyMigrations(db, {
    from: migration,
    until: "20261030233000_shiplog_all_applications_catalog.sql",
  });
  await login(owner);
  token = await value("select public.shiplog_portal($1,true) as value", [
    workspace,
  ]);
}, 30_000);
afterAll(async () => {
  await db?.close();
});

describe("release-only management before automatic application inclusion", () => {
  it("deletes deployment records, environment relations, publication RPCs and retired audit fields while preserving releases and decisions", async () => {
    for (const table of [
      "shiplog_deployments",
      "shiplog_environments",
      "shiplog_environment_versions",
    ])
      expect(
        await value("select to_regclass($1) as value", [`public.${table}`]),
      ).toBeNull();
    for (const signature of [
      "shiplog_record_deployment(jsonb)",
      "shiplog_publish_release(uuid,boolean)",
      "shiplog_preview_release(uuid)",
    ])
      expect(
        await value("select to_regprocedure($1) as value", [
          `public.${signature}`,
        ]),
      ).toBeNull();
    const raw = await value<Record<string, unknown>>(
      "select to_jsonb(r) as value from public.shiplog_releases r where id=$1",
      [legacy],
    );
    expect(releaseSchema.parse(raw).status).toBe("draft");
    for (const field of [
      "published_at",
      "first_published_at",
      "first_deployed_at",
    ])
      expect(raw).not.toHaveProperty(field);
    const audit = JSON.stringify(
      (
        await db.query(
          "select event,details from public.shiplog_audit_events where workspace_id=$1",
          [workspace],
        )
      ).rows,
    );
    for (const secret of [
      "ERASE-DEPLOYMENT-DETAILS",
      "first_deployed_at",
      "first_published_at",
      "published_at",
      "deployment.recorded",
      "release.published",
    ])
      expect(audit).not.toContain(secret);
    expect(
      (
        await db.query<{ approved: boolean }>(
          "select * from public.shiplog_list_release_decisions($1)",
          [legacy],
        )
      ).rows.find((row) => row.approved),
    ).toBeTruthy();
  });
  it("creates and edits applications without creating environments, retaining private-by-default application visibility", async () => {
    const raw = await value(
      "select to_jsonb(public.shiplog_save_application($1,'Private app')) as value",
      [workspace],
    );
    const app = applicationSchema
      .extend({ public_enabled: z.boolean() })
      .parse(raw);
    expect(app.public_enabled).toBe(false);
    const updated = applicationSchema.parse(
      await value(
        "select to_jsonb(public.shiplog_save_application($1,'Renamed','',null,$2)) as value",
        [workspace, app.id],
      ),
    );
    expect(updated.name).toBe("Renamed");
    await create("1.0.0", app.id);
  });
  it("exposes all three statuses by default only for included applications, using an explicit public allow-list", async () => {
    await db.query("select public.shiplog_set_application_public($1,true)", [
      application,
    ]);
    const qa = await create("1.0.0");
    const released = await create("2.0.0");
    await db.query("select public.shiplog_set_release_status($1,'qa')", [
      qa.id,
    ]);
    await db.query("select public.shiplog_set_release_status($1,'released')", [
      released.id,
    ]);
    await db.query("select public.shiplog_save_change($1,$2::jsonb)", [
      legacy,
      JSON.stringify({
        category: "feature",
        title: "Public feature",
        description: "",
        is_public: true,
      }),
    ]);
    await db.query("select public.shiplog_save_change($1,$2::jsonb)", [
      legacy,
      JSON.stringify({
        category: "technical",
        title: "SECRET private change",
        description: "",
        is_public: false,
      }),
    ]);
    await login(null, "anon");
    const raw = await value<Record<string, unknown>>(
      "select public.shiplog_public_catalog($1) as value",
      [token],
    );
    const catalog = publicCatalogSchema.parse(raw);
    expect(catalog.applications.map((app) => app.name)).toEqual(["Website"]);
    expect(catalog.releases.map((release) => release.status).sort()).toEqual([
      "draft",
      "qa",
      "released",
    ]);
    expect(
      catalog.releases.find((release) => release.id === legacy)?.changes,
    ).toHaveLength(1);
    for (const release of raw.releases as Record<string, unknown>[])
      expect(Object.keys(release).sort()).toEqual([
        "application_id",
        "changes",
        "created_at",
        "id",
        "public_notes",
        "release_type",
        "status",
        "title",
        "version",
      ]);
    for (const secret of [
      "SECRET",
      owner,
      "approved",
      "team_id",
      "workspace_id",
      "published_at",
      "deploy",
    ])
      expect(JSON.stringify(raw)).not.toContain(secret);
    await expect(
      db.query("select * from public.shiplog_releases"),
    ).rejects.toThrow(/permission denied/);
    await login(owner);
  });
  it("uses only manual status to govern draft content and keeps notes editable in every status", async () => {
    await login(editor);
    for (const status of ["qa", "released", "draft"]) {
      await db.query("select public.shiplog_set_release_status($1,$2)", [
        legacy,
        status,
      ]);
      await db.query("select public.shiplog_update_public_notes($1,$2)", [
        legacy,
        `Notes in ${status}`,
      ]);
      const update = () =>
        db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
          legacy,
          JSON.stringify({
            application_id: application,
            version: "0.1.0",
            title: "Updated",
            public_notes: `Notes in ${status}`,
          }),
        ]);
      if (status === "draft") await update();
      else await expect(update()).rejects.toThrow(/Only drafts/);
    }
    await login(null, "anon");
    const catalog = publicCatalogSchema.parse(
      await value("select public.shiplog_public_catalog($1) as value", [token]),
    );
    expect(
      catalog.releases.find((release) => release.id === legacy)?.public_notes,
    ).toBe("Notes in draft");
    await login(owner);
  });
  it("allows viewers to decide for themselves but not edit releases, and rejects other-app and anonymous mutations", async () => {
    await login(viewer);
    for (const approved of [false, true]) {
      await db.query("select public.shiplog_decide_release($1,$2)", [
        legacy,
        approved,
      ]);
      const decisions = (
        await db.query<{ user_id: string; approved: boolean }>(
          "select * from public.shiplog_list_release_decisions($1)",
          [legacy],
        )
      ).rows;
      expect(decisions.find((row) => row.user_id === viewer)?.approved).toBe(
        approved,
      );
      expect(decisions.find((row) => row.user_id === owner)?.approved).toBe(
        true,
      );
    }
    for (const account of [viewer, outsider, null]) {
      await login(account, account ? "authenticated" : "anon");
      for (const sql of [
        "select public.shiplog_set_release_status($1,'qa')",
        "select public.shiplog_update_public_notes($1,'No')",
      ])
        await expect(db.query(sql, [legacy])).rejects.toThrow(
          /access required|permission denied/,
        );
      if (account !== viewer)
        await expect(
          db.query("select public.shiplog_decide_release($1,true)", [legacy]),
        ).rejects.toThrow(/access required|permission denied/);
    }
    await login(owner);
  });
  it("retains application privacy controls and revokes the single public catalog", async () => {
    await db.query("select public.shiplog_set_application_public($1,false)", [
      application,
    ]);
    await login(null, "anon");
    expect(
      publicCatalogSchema.parse(
        await value("select public.shiplog_public_catalog($1) as value", [
          token,
        ]),
      ).releases,
    ).toEqual([]);
    await login(owner);
    await db.query("select public.shiplog_portal($1,false)", [workspace]);
    await login(null, "anon");
    await expect(
      db.query("select public.shiplog_public_catalog($1)", [token]),
    ).rejects.toThrow(/unavailable/);
    await login(owner);
  });
});
