// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createMigratedDatabase } from "./support/migratedDatabase";
import { publicCatalogSchema } from "@/lib/contracts";

const owner = "11111111-1111-4111-8111-111111111111";
const editor = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
let workspace: string;
let app: string;
let secondApp: string;
let release: string;
let token: string;
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
async function createRelease(application = app, version = "1.0.0") {
  return value<{ id: string }>(
    "select to_jsonb(public.shiplog_create_release($1::jsonb)) as value",
    [
      JSON.stringify({
        application_id: application,
        version,
        release_type: "minor",
        title: "First release",
        internal_notes: "SECRET: QA report and Jira issue",
        public_notes: "A faster checkout.",
      }),
    ],
  );
}
beforeAll(async () => {
  db = await createMigratedDatabase([
    { id: owner, email: "owner@example.com" },
    { id: editor, email: "editor@example.com" },
    { id: viewer, email: "viewer@example.com" },
    { id: outsider, email: "outsider@example.com" },
  ]);
  await login(owner);
  workspace = await value(
    "select id as value from public.create_workspace('Shipping')",
  );
  for (const [email, appName, access] of [
    ["editor@example.com", "shiplog", "editor"],
    ["viewer@example.com", "shiplog", "viewer"],
    ["outsider@example.com", "planner", "editor"],
  ])
    await db.query("select public.share_workspace($1,$2,$3,$4)", [
      workspace,
      email,
      appName,
      access,
    ]);
  app = await value(
    "select (public.shiplog_create_application($1,'Website','website','web')).id as value",
    [workspace],
  );
  secondApp = await value(
    "select (public.shiplog_create_application($1,'API','api','api')).id as value",
    [workspace],
  );
  release = (await createRelease()).id;
  token = await value("select public.shiplog_portal($1,true) as value", [
    workspace,
  ]);
}, 30_000);
afterAll(async () => {
  await db?.close();
});

describe("Shiplog workspace foundation", () => {
  it("uses the existing workspace directory without granting access through another app", async () => {
    for (const [account, expected] of [
      [owner, 1],
      [editor, 1],
      [viewer, 1],
      [outsider, 0],
    ] as const) {
      await login(account);
      const rows = await db.query(
        "select * from public.list_workspaces('shiplog') where id=$1",
        [workspace],
      );
      expect(rows.rows).toHaveLength(expected);
    }
    await login(outsider);
    expect(
      (
        await db.query(
          "select * from public.list_workspaces('planner') where id=$1",
          [workspace],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from public.shiplog_applications")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.shiplog_releases")).rows,
    ).toHaveLength(0);
  });

  it("creates environments atomically and allows only authorized editor writes", async () => {
    await login(editor);
    expect(
      (await db.query("select * from public.shiplog_environments")).rows,
    ).toHaveLength(4);
    const row = await createRelease(secondApp);
    expect(row.id).toBeTruthy();
    for (const account of [viewer, outsider]) {
      await login(account);
      await expect(createRelease(app, "2.0.0")).rejects.toThrow(/edit access/);
      await expect(
        db.query("select public.shiplog_set_application_public($1,true)", [
          app,
        ]),
      ).rejects.toThrow(/edit access/);
      await expect(
        db.query("select public.shiplog_publish_release($1,true)", [release]),
      ).rejects.toThrow(/edit access/);
      await expect(
        db.query("select public.shiplog_portal($1,true)", [workspace]),
      ).rejects.toThrow(/edit access/);
    }
    await login(viewer);
    expect(
      (await db.query("select * from public.shiplog_releases")).rows,
    ).toHaveLength(2);
    await expect(
      db.query("update public.shiplog_releases set title='Bypass'"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query(
        "insert into public.shiplog_audit_events(workspace_id,event) values($1,'fake')",
        [workspace],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("enforces application-specific unique semantic versions and rejects malformed versions", async () => {
    await login(owner);
    await expect(createRelease()).rejects.toThrow(/unique/);
    for (const version of [
      "1.0",
      "v1.0.0",
      "01.0.0",
      "1.0.0-01",
      "1.0.0-",
      "1.0.0+",
    ]) {
      await expect(createRelease(app, version)).rejects.toThrow(
        /check constraint/,
      );
    }
    for (const version of [
      "1.1.0",
      "1.1.0-beta.1",
      "1.1.0+ci.42",
      "1.1.0-rc.1+build.2",
    ])
      expect((await createRelease(app, version)).id).toBeTruthy();
  });

  it("provides one workspace catalog for multiple apps and serializes only approved public fields", async () => {
    await login(owner);
    await db.query("select public.shiplog_publish_release($1,true)", [release]);
    await login(null, "anon");
    const hidden = publicCatalogSchema.parse(
      await value("select public.shiplog_public_catalog($1) as value", [token]),
    );
    expect(hidden.releases).toEqual([]);
    await expect(
      db.query("select * from public.shiplog_releases"),
    ).rejects.toThrow(/permission denied/);
    await expect(createRelease()).rejects.toThrow(/permission denied/);
    await login(owner);
    await db.query("select public.shiplog_set_application_public($1,true)", [
      app,
    ]);
    await db.query("select public.shiplog_set_application_public($1,true)", [
      secondApp,
    ]);
    const second = await value<string>(
      "select id as value from public.shiplog_releases where application_id=$1",
      [secondApp],
    );
    await db.query("select public.shiplog_publish_release($1,true)", [second]);
    await login(null, "anon");
    const raw = await value<Record<string, unknown>>(
      "select public.shiplog_public_catalog($1) as value",
      [token],
    );
    const publicData = publicCatalogSchema.parse(raw);
    expect(publicData.applications).toHaveLength(2);
    expect(publicData.releases).toHaveLength(2);
    expect(Object.keys(raw).sort()).toEqual([
      "applications",
      "name",
      "releases",
    ]);
    for (const item of raw["releases"] as Record<string, unknown>[])
      expect(Object.keys(item).sort()).toEqual([
        "application_id",
        "id",
        "public_notes",
        "published_at",
        "release_type",
        "title",
        "version",
      ]);
    for (const secret of [
      "SECRET",
      "internal_notes",
      "created_by",
      "QA report",
      owner,
    ])
      expect(JSON.stringify(raw)).not.toContain(secret);
    await login(owner);
    const status = await value(
      "select status as value from public.shiplog_releases where id=$1",
      [release],
    );
    expect(status).toBe("draft");
  });

  it("unpublishes releases and revokes and rotates the one workspace token", async () => {
    await login(owner);
    expect(
      await value("select public.shiplog_portal($1,true) as value", [
        workspace,
      ]),
    ).toBe(token);
    await db.query("select public.shiplog_publish_release($1,false)", [
      release,
    ]);
    await login(null, "anon");
    const catalog = publicCatalogSchema.parse(
      await value("select public.shiplog_public_catalog($1) as value", [token]),
    );
    expect(catalog.releases.some((item) => item.id === release)).toBe(false);
    await login(owner);
    await db.query("select public.shiplog_portal($1,false)", [workspace]);
    await login(null, "anon");
    await expect(
      db.query("select public.shiplog_public_catalog($1)", [token]),
    ).rejects.toThrow(/unavailable/);
    await login(owner);
    expect(
      await value("select public.shiplog_portal($1,true) as value", [
        workspace,
      ]),
    ).not.toBe(token);
    await expect(
      db.query("delete from public.shiplog_audit_events"),
    ).rejects.toThrow(/permission denied/);
  });
});
