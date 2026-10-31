// @vitest-environment node
import { beforeAll, afterAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDatabase } from "./support/migratedDatabase";
import { releaseSchema } from "@/lib/contracts";

const owner = "11111111-1111-4111-8111-111111111111";
const editor = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
let db: PGlite;
let workspace: string;
let app: string;
let feature: string;
let otherFeature: string;
let version = 0;
async function value<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, args)).rows[0]!.value;
}
async function login(id = owner) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
function input() {
  return {
    application_id: app,
    version: `1.0.${++version}`,
    title: "Launch",
    public_notes: "Notes",
  };
}
async function save(
  data = input(),
  status = "draft",
  ids: string[] | null = null,
  release: string | null = null,
) {
  return releaseSchema.parse(
    await value(
      "select to_jsonb(public.shiplog_save_configuration($1::jsonb,$2,$3::uuid[],$4::uuid)) as value",
      [JSON.stringify(data), status, ids, release],
    ),
  );
}
beforeAll(async () => {
  db = await createMigratedDatabase([
    { id: owner, email: "owner@example.com" },
    { id: editor, email: "editor@example.com" },
    { id: viewer, email: "viewer@example.com" },
  ]);
  await login();
  workspace = await value(
    "select id as value from public.create_workspace('Configuration')",
  );
  app = await value(
    "select (public.shiplog_save_application($1,'Website')).id as value",
    [workspace],
  );
  const project = await value(
    "insert into public.projects(workspace_id,name) values($1,'Product') returning id as value",
    [workspace],
  );
  feature = await value(
    "insert into public.features(project_id,name) values($1,'Roadmap') returning id as value",
    [project],
  );
  const other = await value(
    "select id as value from public.create_workspace('Other')",
  );
  const otherProject = await value(
    "insert into public.projects(workspace_id,name) values($1,'Other') returning id as value",
    [other],
  );
  otherFeature = await value(
    "insert into public.features(project_id,name) values($1,'Other feature') returning id as value",
    [otherProject],
  );
  await db.query(
    "select public.share_workspace($1,'editor@example.com','shiplog','editor')",
    [workspace],
  );
  await db.query(
    "select public.share_workspace($1,'viewer@example.com','shiplog','viewer')",
    [workspace],
  );
}, 30_000);
afterAll(async () => {
  await db?.close();
});
it("lists same-workspace candidates before a release exists", async () => {
  const rows = (
    await db.query<{ id: string }>(
      "select * from public.shiplog_workspace_features($1)",
      [workspace],
    )
  ).rows;
  expect(rows.map((row) => row.id)).toEqual([feature]);
});
it("creates with links and QA status atomically and preserves snapshot names", async () => {
  const release = await save(input(), "qa", [feature, feature]);
  expect(release.status).toBe("qa");
  const rows = (
    await db.query("select * from public.shiplog_list_features($1)", [
      release.id,
    ])
  ).rows;
  expect(rows).toEqual([{ id: feature, name: "Roadmap", linked: true }]);
});
it("rolls back creation and audit events when a feature is outside the workspace", async () => {
  const data = input();
  const count = await value(
    "select count(*)::int as value from public.shiplog_audit_events where workspace_id=$1",
    [workspace],
  );
  await expect(save(data, "draft", [feature, otherFeature])).rejects.toThrow(
    "Planner feature unavailable",
  );
  expect(
    await value(
      "select count(*)::int as value from public.shiplog_releases where application_id=$1 and version=$2",
      [app, data.version],
    ),
  ).toBe(0);
  expect(
    await value(
      "select count(*)::int as value from public.shiplog_audit_events where workspace_id=$1",
      [workspace],
    ),
  ).toBe(count);
});
it("stages draft link replacements before transitioning and rolls back invalid statuses", async () => {
  const data = input();
  const release = await save(data, "draft", [feature]);
  await expect(
    save({ ...data, title: "Changed" }, "invalid", [], release.id),
  ).rejects.toThrow("Invalid release status");
  expect(
    (
      await db.query("select * from public.shiplog_list_features($1)", [
        release.id,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    await value(
      "select title as value from public.shiplog_releases where id=$1",
      [release.id],
    ),
  ).toBe("Launch");
  expect((await save(data, "released", [], release.id)).status).toBe(
    "released",
  );
  expect(
    (
      await db.query("select * from public.shiplog_list_features($1)", [
        release.id,
      ])
    ).rows,
  ).toHaveLength(0);
  await expect(save(data, "released", [feature], release.id)).rejects.toThrow(
    "Only drafts can be edited",
  );
});
it("lets Shiplog-only editors save details without changing links, but refuses feature edits", async () => {
  const data = input();
  const release = await save(data, "draft", [feature]);
  await login(editor);
  await expect(
    db.query("select * from public.shiplog_workspace_features($1)", [
      workspace,
    ]),
  ).rejects.toThrow("Planner access required");
  expect(
    (await save({ ...data, title: "Editor notes" }, "draft", null, release.id))
      .title,
  ).toBe("Editor notes");
  await expect(save(data, "draft", [], release.id)).rejects.toThrow(
    "Planner access required",
  );
  await login();
});
it("refuses viewers and nonexistent releases", async () => {
  await login(viewer);
  await expect(save()).rejects.toThrow("Shiplog edit access required");
  await login();
  await expect(
    save(input(), "draft", null, "44444444-4444-4444-8444-444444444444"),
  ).rejects.toThrow("Release not found");
});
