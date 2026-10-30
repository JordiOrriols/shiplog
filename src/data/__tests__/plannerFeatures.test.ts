// @vitest-environment node
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createMigratedDatabase,
  applyMigrations,
} from "./support/migratedDatabase";
import { publicCatalogSchema, releaseSchema } from "@/lib/contracts";

const migration = "20261031000000_shiplog_planner_features.sql";
const accounts = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
];
let db: PGlite;
let workspace: string;
let application: string;
let project: string;
let feature: string;
let otherFeature: string;
let legacy: string;
let token: string;
let version = 0;
async function login(account = accounts[0]!, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    account,
  ]);
  await db.exec(`set role ${role}`);
}
async function value<T>(sql: string, args: unknown[] = []) {
  return (await db.query<{ value: T }>(sql, args)).rows[0]!.value;
}
function input(title = "Release") {
  return {
    application_id: application,
    version: `1.0.${++version}`,
    title,
    public_notes: "Public story",
  };
}
async function create() {
  return releaseSchema.parse(
    await value(
      "select to_jsonb(public.shiplog_create_release($1::jsonb)) as value",
      [JSON.stringify(input())],
    ),
  );
}
async function link(release: string, id = feature, linked = true) {
  await db.query("select public.shiplog_link_feature($1,$2,$3)", [
    release,
    id,
    linked,
  ]);
}
async function list(release: string, candidates = false) {
  return (
    await db.query<{ id: string; name: string; linked: boolean }>(
      "select * from public.shiplog_list_features($1,$2)",
      [release, candidates],
    )
  ).rows;
}
beforeAll(async () => {
  db = await createMigratedDatabase(
    accounts.map((id, i) => ({ id, email: `person${i}@example.com` })),
    { until: migration },
  );
  await login();
  workspace = await value(
    "select id as value from public.create_workspace('Feature releases')",
  );
  for (const [email, app, access] of [
    ["person1@example.com", "shiplog", "editor"],
    ["person1@example.com", "planner", "viewer"],
    ["person2@example.com", "shiplog", "editor"],
    ["person3@example.com", "shiplog", "viewer"],
    ["person3@example.com", "planner", "editor"],
    ["person4@example.com", "planner", "editor"],
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
  project = await value(
    "insert into public.projects(workspace_id,name) values($1,'General') returning id as value",
    [workspace],
  );
  feature = await value(
    "insert into public.features(project_id,name,description) values($1,'Roadmap','SECRET planner description') returning id as value",
    [project],
  );
  const other = await value<string>(
    "select id as value from public.create_workspace('Other workspace')",
  );
  const otherProject = await value<string>(
    "insert into public.projects(workspace_id,name) values($1,'General') returning id as value",
    [other],
  );
  otherFeature = await value(
    "insert into public.features(project_id,name) values($1,'SECRET other feature') returning id as value",
    [otherProject],
  );
  legacy = (await create()).id;
  for (const [title, is_public] of [
    ["Legacy public feature", true],
    ["SECRET internal change", false],
  ]) {
    await db.query("select public.shiplog_save_change($1,$2::jsonb)", [
      legacy,
      JSON.stringify({
        category: "feature",
        title,
        description: is_public ? "Public detail" : "SECRET private text",
        is_public,
      }),
    ]);
  }
  token = await value("select public.shiplog_portal($1,true) as value", [
    workspace,
  ]);
  await login(accounts[0], "postgres");
  await applyMigrations(db, { from: migration });
  await login();
}, 30_000);
afterAll(async () => {
  await db?.close();
});

it("stops oversized legacy-note conversion without truncation or deleting changes", async () => {
  const legacyDb = await createMigratedDatabase(
    [{ id: accounts[0]!, email: "owner@example.com" }],
    { until: migration },
  );
  try {
    await legacyDb.query(
      "select set_config('request.jwt.claim.sub',$1,false)",
      [accounts[0]],
    );
    const workspace = (
      await legacyDb.query<{ id: string }>(
        "select id from public.create_workspace('Large notes')",
      )
    ).rows[0]!.id;
    const app = (
      await legacyDb.query<{ id: string }>(
        "select id from public.shiplog_save_application($1,'Website')",
        [workspace],
      )
    ).rows[0]!.id;
    const release = (
      await legacyDb.query<{ id: string }>(
        "select id from public.shiplog_create_release($1::jsonb)",
        [
          JSON.stringify({
            application_id: app,
            version: "1.0.0",
            title: "Release",
            public_notes: "Original notes",
          }),
        ],
      )
    ).rows[0]!.id;
    for (let i = 0; i < 2; i++)
      await legacyDb.query("select public.shiplog_save_change($1,$2::jsonb)", [
        release,
        JSON.stringify({
          category: "feature",
          title: `Feature ${i}`,
          description: "x".repeat(10000),
          is_public: true,
        }),
      ]);
    await expect(
      applyMigrations(legacyDb, { from: migration }),
    ).rejects.toThrow("exceed 20000");
    expect(
      (
        await legacyDb.query<{ public_notes: string }>(
          "select public_notes from public.shiplog_releases where id=$1",
          [release],
        )
      ).rows[0]!.public_notes,
    ).toBe("Original notes");
    expect(
      (await legacyDb.query("select * from public.shiplog_release_changes"))
        .rows,
    ).toHaveLength(2);
  } finally {
    await legacyDb.close();
  }
}, 30_000);

describe("Planner release features", () => {
  it("moves public changes into notes and erases retired internal changes and change audit records", async () => {
    const notes = await value<string>(
      "select public_notes as value from public.shiplog_releases where id=$1",
      [legacy],
    );
    expect(notes).toBe("Public story\n\nLegacy public feature\nPublic detail");
    await login(accounts[0], "postgres");
    expect(
      await value(
        "select to_regclass('public.shiplog_release_changes') as value",
      ),
    ).toBeNull();
    expect(
      await value(
        "select to_regprocedure('public.shiplog_save_change(uuid,jsonb,uuid)') as value",
      ),
    ).toBeNull();
    expect(
      await value(
        "select count(*)::int as value from public.shiplog_audit_events where event like 'change.%'",
      ),
    ).toBe(0);
    await login();
  });
  it("links multiple existing features without duplicates and supports unlinking", async () => {
    await login();
    const release = await create();
    const second = await value<string>(
      "insert into public.features(project_id,name) values($1,'Second feature') returning id as value",
      [project],
    );
    expect(
      (await list(release.id, true)).some((row) => row.id === feature),
    ).toBe(true);
    expect(
      (await list(release.id, true)).some((row) => row.id === otherFeature),
    ).toBe(false);
    await link(release.id);
    await link(release.id);
    await link(release.id, second);
    expect(await list(release.id)).toHaveLength(2);
    await link(release.id, feature, false);
    expect((await list(release.id)).map((row) => row.id)).toEqual([second]);
    await expect(link(release.id, otherFeature)).rejects.toThrow("unavailable");
  });
  it("requires both Shiplog edit and Planner access, while allowing Shiplog-only readers to see linked names", async () => {
    await login();
    const release = await create();
    await login(accounts[1]);
    await link(release.id);
    await login(accounts[2]);
    expect((await list(release.id))[0]?.name).toBe("Roadmap");
    await expect(list(release.id, true)).rejects.toThrow("Planner access");
    await expect(link(release.id)).rejects.toThrow("Planner access");
    await login(accounts[3]);
    expect(await list(release.id, true)).not.toHaveLength(0);
    await expect(link(release.id)).rejects.toThrow("Shiplog edit");
    await login(accounts[4]);
    await expect(list(release.id, true)).rejects.toThrow("Shiplog access");
    await expect(link(release.id)).rejects.toThrow("Shiplog edit");
    await login("", "anon");
    await expect(list(release.id)).rejects.toThrow("permission denied");
    await expect(link(release.id)).rejects.toThrow("permission denied");
    await login();
    await expect(
      db.query(
        "insert into public.shiplog_release_features(release_id,feature_id,name) values($1,$2,'Fake')",
        [release.id, feature],
      ),
    ).rejects.toThrow("permission denied");
  });
  it("rejects link mutations after Draft but preserves QA and decisions", async () => {
    await login();
    const release = await create();
    await link(release.id);
    await db.query("select public.shiplog_decide_release($1,true)", [
      release.id,
    ]);
    await db.query("select public.shiplog_set_release_status($1,'qa')", [
      release.id,
    ]);
    await expect(link(release.id, feature, false)).rejects.toThrow(
      "Only drafts",
    );
    expect(await list(release.id)).toHaveLength(1);
    expect(
      await value(
        "select count(*)::int as value from public.shiplog_list_release_decisions($1) where approved",
        [release.id],
      ),
    ).toBe(1);
    expect(
      await value("select public.shiplog_get_readiness($1)->'items' as value", [
        release.id,
      ]),
    ).toEqual([]);
  });
  it("publishes only snapshotted feature names, never Planner IDs, descriptions or QA", async () => {
    await login();
    const release = await create();
    await link(release.id);
    await db.query(
      "update public.features set name='Renamed privately' where id=$1",
      [feature],
    );
    await login("", "anon");
    const raw = await value(
      "select public.shiplog_public_catalog($1) as value",
      [token],
    );
    const catalog = publicCatalogSchema.parse(raw);
    expect(
      catalog.releases.find((row) => row.id === release.id)?.features,
    ).toEqual([{ name: "Roadmap" }]);
    for (const secret of [
      feature,
      otherFeature,
      "SECRET",
      "Renamed privately",
      "feature_id",
      "description",
      "checklist",
    ])
      expect(JSON.stringify(raw)).not.toContain(secret);
    await login();
    await db.query("update public.features set name='Roadmap' where id=$1", [
      feature,
    ]);
  });
  it("atomically saves version, notes and status, and rejects non-draft title edits", async () => {
    await login();
    const release = await create();
    const details = { ...input("Updated"), public_notes: "Updated story" };
    await db.query("select public.shiplog_update_details($1,$2::jsonb,'qa')", [
      release.id,
      JSON.stringify(details),
    ]);
    const saved = await value<Record<string, unknown>>(
      "select to_jsonb(r) as value from public.shiplog_releases r where id=$1",
      [release.id],
    );
    expect(saved).toMatchObject({
      title: "Updated",
      public_notes: "Updated story",
      status: "qa",
      version: details.version,
    });
    await expect(
      db.query(
        "select public.shiplog_update_details($1,$2::jsonb,'released')",
        [release.id, JSON.stringify({ ...details, title: "No" })],
      ),
    ).rejects.toThrow("Only drafts");
    await db.query(
      "select public.shiplog_update_details($1,$2::jsonb,'released')",
      [
        release.id,
        JSON.stringify({ ...details, public_notes: "Revised story" }),
      ],
    );
    expect(
      await value(
        "select status as value from public.shiplog_releases where id=$1",
        [release.id],
      ),
    ).toBe("released");
    await expect(
      db.query("select public.shiplog_update_details($1,$2::jsonb,'bad')", [
        release.id,
        JSON.stringify(details),
      ]),
    ).rejects.toThrow("Invalid release status");
    await login(accounts[3]);
    await expect(
      db.query("select public.shiplog_update_details($1,$2::jsonb,'draft')", [
        release.id,
        JSON.stringify(details),
      ]),
    ).rejects.toThrow("Shiplog edit");
  });
  it("removes links when the linked Planner feature is deleted", async () => {
    await login();
    const release = await create();
    const disposable = await value<string>(
      "insert into public.features(project_id,name) values($1,'Disposable') returning id as value",
      [project],
    );
    await link(release.id, disposable);
    await db.query("delete from public.features where id=$1", [disposable]);
    expect(await list(release.id)).toEqual([]);
  });
});
