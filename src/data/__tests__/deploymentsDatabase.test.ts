// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createMigratedDatabase,
  applyMigrations,
} from "./support/migratedDatabase";
import { deploymentSchema } from "@/lib/contracts";

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
let application: string;
let staging: string;
let production: string;
let first: string;
let second: string;
let counter = 0;
const time = (day: number) =>
  `2026-01-${String(day).padStart(2, "0")}T12:00:00Z`;
const input = () => ({
  environment_id: production,
  release_id: first,
  outcome: "succeeded",
  rollback_target_id: null,
  started_at: time(1),
  completed_at: time(1),
  source: "Manual",
  build_reference: "build-1",
  pipeline_url: "https://ci.example.com/run/123",
  notes: "SECRET deployment notes",
  error_details: "",
});
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
async function record(patch: Record<string, unknown> = {}) {
  return deploymentSchema.parse(
    await value(
      "select to_jsonb(public.shiplog_record_deployment($1::jsonb)) as value",
      [JSON.stringify({ ...input(), ...patch })],
    ),
  );
}
async function current(env = production) {
  return value<string>(
    "select release_id as value from public.shiplog_environment_versions where environment_id=$1",
    [env],
  );
}
async function createRelease(version: string, app = application) {
  return value<string>(
    "select (public.shiplog_create_release($1::jsonb)).id as value",
    [
      JSON.stringify({
        application_id: app,
        version,
        title: "Website",
        release_type: "minor",
        internal_notes: "",
        public_notes: "Hello public",
      }),
    ],
  );
}
beforeAll(async () => {
  db = await createMigratedDatabase(accounts);
  await login(owner);
  workspace = await value(
    "select id as value from public.create_workspace('Deployments')",
  );
  for (const [email, access] of [
    ["user1@example.com", "editor"],
    ["user2@example.com", "viewer"],
  ])
    await db.query("select public.share_workspace($1,$2,'shiplog',$3)", [
      workspace,
      email,
      access,
    ]);
});
beforeEach(async () => {
  await login(owner);
  counter++;
  application = await value(
    "select (public.shiplog_create_application($1,'Website',$2,'web')).id as value",
    [workspace, `web-${counter}`],
  );
  staging = await value(
    "select id as value from public.shiplog_environments where application_id=$1 and kind='staging'",
    [application],
  );
  production = await value(
    "select id as value from public.shiplog_environments where application_id=$1 and kind='production'",
    [application],
  );
  first = await createRelease("1.0.0");
  second = await createRelease("2.0.0");
});
afterAll(async () => {
  await db?.close();
});

describe("manual deployment history", () => {
  it("allows editors to record all environments and audits warnings without changing approval or publication", async () => {
    await db.query(
      "select public.shiplog_save_checklist_template($1,$2::jsonb,0)",
      [
        application,
        JSON.stringify([
          { category: "QA", title: "Review", description: "", mandatory: true },
        ]),
      ],
    );
    first = await createRelease("1.1.0");
    await login(editor);
    const deployment = await record();
    expect(deployment.recorded_by).toBe(editor);
    expect(deployment.readiness_warnings).toEqual([
      "release_not_approved",
      "manual_qa_not_passed",
      "mandatory_items_incomplete",
    ]);
    expect(await current()).toBe(first);
    const audit = await value<{
      recorded_by: string;
      readiness_warnings: string[];
    }>(
      "select details as value from public.shiplog_audit_events where release_id=$1 and event='deployment.recorded'",
      [first],
    );
    expect(audit.recorded_by).toBe(editor);
    expect(audit.readiness_warnings).toEqual(deployment.readiness_warnings);
    const release = await value<{
      status: string;
      first_deployed_at: string;
      published_at: null;
    }>(
      "select to_jsonb(r) as value from public.shiplog_releases r where id=$1",
      [first],
    );
    expect(release.status).toBe("draft");
    expect(release.published_at).toBeNull();
    expect(Date.parse(release.first_deployed_at)).toBe(Date.parse(time(1)));
    const staged = await record({
      environment_id: staging,
      release_id: second,
    });
    expect(staged.readiness_warnings).toEqual([]);
    expect(await current(staging)).toBe(second);
    expect(await current()).toBe(first);
  });
  it("calculates current versions by outcome time, ignoring failures and cancellations and breaking ties by recorded sequence", async () => {
    await record({ release_id: second, completed_at: time(5) });
    await record({ completed_at: time(2) });
    await record({
      outcome: "failed",
      completed_at: time(8),
      error_details: "SECRET failure",
    });
    await record({ outcome: "cancelled", completed_at: time(9) });
    expect(await current()).toBe(second);
    await record({ completed_at: time(5) });
    expect(await current()).toBe(first);
    expect(
      (
        await db.query(
          "select * from public.shiplog_deployments where application_id=$1",
          [application],
        )
      ).rows,
    ).toHaveLength(5);
  });
  it("records explicit rollbacks to previously deployed versions and validates sources and targets per environment", async () => {
    await expect(
      record({ outcome: "rollback", rollback_target_id: second }),
    ).rejects.toThrow(/target must have been deployed/);
    await record({ completed_at: time(2) });
    await record({ release_id: second, completed_at: time(3) });
    await expect(
      record({
        release_id: first,
        outcome: "rollback",
        rollback_target_id: second,
        completed_at: time(4),
      }),
    ).rejects.toThrow(/source must match/);
    await expect(
      record({
        environment_id: staging,
        release_id: second,
        outcome: "rollback",
        rollback_target_id: first,
        completed_at: time(4),
      }),
    ).rejects.toThrow(/target must have been deployed/);
    const rolledBack = await record({
      release_id: second,
      outcome: "rollback",
      rollback_target_id: first,
      completed_at: time(4),
      notes: "Regressions found",
    });
    expect(rolledBack.rollback_target_id).toBe(first);
    expect(await current()).toBe(first);
    // Historical records remain visible; a rollback does not erase the deployment.
    expect(
      (
        await db.query(
          "select * from public.shiplog_deployments where application_id=$1",
          [application],
        )
      ).rows,
    ).toHaveLength(3);
    await record({ completed_at: time(1) });
    expect(await current()).toBe(first);
  });
  it("validates timestamps, cross-app references, rollback reasons and bounded metadata in SQL", async () => {
    const otherApp = await value<string>(
      "select (public.shiplog_create_application($1,'Other','other','web')).id as value",
      [workspace],
    );
    const foreignRelease = await createRelease("1.0.0", otherApp);
    for (const patch of [
      { release_id: foreignRelease },
      { environment_id: "99999999-9999-4999-8999-999999999999" },
      { outcome: "unknown" },
      { outcome: null },
      { source: " " },
      { source: "x".repeat(121) },
      { started_at: time(3), completed_at: time(2) },
      { completed_at: "2999-01-01T12:00:00Z" },
      { completed_at: "infinity" },
      { started_at: "-infinity" },
      { started_at: null },
      { pipeline_url: "javascript:alert(1)" },
      { pipeline_url: "https://example.com/\nunsafe" },
      { build_reference: "x".repeat(301) },
      { notes: "x".repeat(10001) },
      { error_details: "x".repeat(10001) },
      { rollback_target_id: second },
      { outcome: "rollback", rollback_target_id: first },
      { outcome: "rollback", rollback_target_id: foreignRelease },
    ])
      await expect(record(patch)).rejects.toThrow();
    await record();
    await record({ release_id: second, completed_at: time(2) });
    await expect(
      record({
        release_id: second,
        outcome: "rollback",
        rollback_target_id: first,
        completed_at: time(3),
        notes: " ",
      }),
    ).rejects.toThrow(/constraint/);
    expect(await current()).toBe(second);
  });
  it("reserves writes for editors, isolates workspaces and never exposes deployment metadata publicly", async () => {
    const deployment = await record();
    for (const account of [viewer, outsider, null]) {
      await login(account, account ? "authenticated" : "anon");
      await expect(record()).rejects.toThrow(
        /edit access required|permission denied/,
      );
      if (account) {
        expect(
          (
            await db.query(
              "select * from public.shiplog_deployments where id=$1",
              [deployment.id],
            )
          ).rows,
        ).toHaveLength(account === viewer ? 1 : 0);
        expect(
          (
            await db.query(
              "select * from public.shiplog_environment_versions where application_id=$1",
              [application],
            )
          ).rows,
        ).toHaveLength(account === viewer ? 1 : 0);
      } else {
        await expect(
          db.query("select * from public.shiplog_deployments"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          db.query("select * from public.shiplog_environment_versions"),
        ).rejects.toThrow(/permission denied/);
      }
    }
    await login(owner);
    for (const sql of [
      "delete from public.shiplog_deployments",
      "update public.shiplog_deployments set notes='changed'",
      "update public.shiplog_environment_versions set release_id=$1",
    ])
      await expect(
        db.query(sql, sql.includes("$1") ? [second] : []),
      ).rejects.toThrow(/permission denied|cannot update view/);
    await db.query("select public.shiplog_set_application_public($1,true)", [
      application,
    ]);
    await db.query("select public.shiplog_publish_release($1,true)", [first]);
    const token = await value(
      "select public.shiplog_portal($1,true) as value",
      [workspace],
    );
    await login(null, "anon");
    const raw = await value<{ releases: Record<string, unknown>[] }>(
      "select public.shiplog_public_catalog($1) as value",
      [token],
    );
    expect(Object.keys(raw.releases[0]!).sort()).toEqual([
      "application_id",
      "changes",
      "id",
      "public_notes",
      "published_at",
      "release_type",
      "title",
      "version",
    ]);
    for (const secret of [
      "SECRET",
      "pipeline_url",
      "readiness_warnings",
      "first_deployed_at",
      "deployment.recorded",
    ])
      expect(JSON.stringify(raw)).not.toContain(secret);
  });
  it("freezes content only after successful outcomes, preserving earliest deployment time and QA decisions", async () => {
    await record({ outcome: "failed" });
    expect(
      await value(
        "select first_deployed_at as value from public.shiplog_releases where id=$1",
        [first],
      ),
    ).toBeNull();
    await db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
      first,
      JSON.stringify({
        application_id: application,
        version: "1.0.0",
        release_type: "minor",
        title: "Editable",
        internal_notes: "",
        public_notes: "",
      }),
    ]);
    await record({ completed_at: time(3) });
    await expect(
      db.query("select public.shiplog_save_change($1,$2::jsonb)", [
        first,
        JSON.stringify({ title: "Rewrite", category: "feature" }),
      ]),
    ).rejects.toThrow(/never been deployed/);
    await record({ completed_at: time(2) });
    expect(
      Date.parse(
        await value(
          "select first_deployed_at as value from public.shiplog_releases where id=$1",
          [first],
        ),
      ),
    ).toBe(Date.parse(time(2)));
    await db.query(
      "select public.shiplog_transition_readiness($1,'ready_for_qa','')",
      [first],
    );
    await db.query(
      "select public.shiplog_record_manual_qa($1,'passed','Verified later')",
      [first],
    );
    await db.query(
      "select public.shiplog_transition_readiness($1,'approved','')",
      [first],
    );
    const approved = await record({ completed_at: time(4) });
    expect(approved.readiness_warnings).toEqual([]);
  });
});

it("does not invent deployment history for existing releases during migration", async () => {
  const migration = "20261030220000_shiplog_manual_deployments.sql";
  const legacy = await createMigratedDatabase(accounts, { until: migration });
  try {
    await legacy.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await legacy.exec("set role authenticated");
    const ws = (
      await legacy.query<{ id: string }>(
        "select id from public.create_workspace('Legacy')",
      )
    ).rows[0]!.id;
    const app = (
      await legacy.query<{ id: string }>(
        "select * from public.shiplog_create_application($1,'App','app','web')",
        [ws],
      )
    ).rows[0]!.id;
    await legacy.query("select public.shiplog_create_release($1::jsonb)", [
      JSON.stringify({
        application_id: app,
        version: "1.0.0",
        release_type: "minor",
        title: "Old release",
      }),
    ]);
    await legacy.exec("reset role");
    await applyMigrations(legacy, { from: migration });
    await legacy.exec("set role authenticated");
    expect(
      (await legacy.query("select * from public.shiplog_deployments")).rows,
    ).toEqual([]);
    expect(
      (await legacy.query("select * from public.shiplog_environment_versions"))
        .rows,
    ).toEqual([]);
    expect(
      (
        await legacy.query<{ first_deployed_at: null }>(
          "select first_deployed_at from public.shiplog_releases where application_id=$1",
          [app],
        )
      ).rows[0]!.first_deployed_at,
    ).toBeNull();
  } finally {
    await legacy.close();
  }
});
