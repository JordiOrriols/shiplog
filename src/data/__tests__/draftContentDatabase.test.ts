// @vitest-environment node
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createMigratedDatabase,
  applyMigrations,
} from "./support/migratedDatabase";
import { publicReleaseSchema, publicCatalogSchema } from "@/lib/contracts";

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
let release: string;
let token: string;
let counter = 0;
const input = () => ({
  application_id: application,
  version: `1.0.${counter}`,
  release_type: "patch",
  title: "First title",
  internal_notes: "SECRET internal notes",
  public_notes: "Hello public",
});
const change = {
  category: "feature",
  title: "A new feature",
  description: "Public details",
  is_public: true,
};
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
async function saveChange(payload: unknown = change, id: string | null = null) {
  return value<{ id: string }>(
    "select to_jsonb(public.shiplog_save_change($1,$2::jsonb,$3)) as value",
    [release, JSON.stringify(payload), id],
  );
}
beforeAll(async () => {
  db = await createMigratedDatabase(accounts);
  await login(owner);
  workspace = await value(
    "select id as value from public.create_workspace('Draft tests')",
  );
  application = await value(
    "select (public.shiplog_create_application($1,'Website','web','web')).id as value",
    [workspace],
  );
  await db.query(
    "select public.share_workspace($1,'user1@example.com','shiplog','editor')",
    [workspace],
  );
  await db.query(
    "select public.share_workspace($1,'user2@example.com','shiplog','viewer')",
    [workspace],
  );
  await db.query("select public.shiplog_set_application_public($1,true)", [
    application,
  ]);
  token = await value("select public.shiplog_portal($1,true) as value", [
    workspace,
  ]);
});
beforeEach(async () => {
  await login(owner);
  counter++;
  release = await value(
    "select (public.shiplog_create_release($1::jsonb)).id as value",
    [JSON.stringify(input())],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("draft release content", () => {
  it("edits draft metadata without changing the app and records before/after history", async () => {
    await login(editor);
    const updated = await value<{ title: string }>(
      "select to_jsonb(public.shiplog_update_draft($1,$2::jsonb)) as value",
      [release, JSON.stringify({ ...input(), title: " Revised title " })],
    );
    expect(updated.title).toBe("Revised title");
    const details = await value<{
      before: { title: string };
      after: { title: string };
    }>(
      "select details as value from public.shiplog_audit_events where release_id=$1 and event='release.updated'",
      [release],
    );
    expect(details.before.title).toBe("First title");
    expect(details.after.title).toBe("Revised title");
    const takenVersion = `3.0.${counter}`;
    await db.query("select public.shiplog_create_release($1::jsonb)", [
      JSON.stringify({ ...input(), version: takenVersion }),
    ]);
    await expect(
      db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
        release,
        JSON.stringify({ ...input(), version: takenVersion }),
      ]),
    ).rejects.toThrow(/unique constraint/);
    await expect(
      db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
        release,
        JSON.stringify({
          ...input(),
          application_id: "99999999-9999-4999-8999-999999999999",
        }),
      ]),
    ).rejects.toThrow(/application cannot/);
    for (const patch of [
      { title: " " },
      { version: "01.0.0" },
      { public_notes: "x".repeat(20001) },
    ])
      await expect(
        db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
          release,
          JSON.stringify({ ...input(), ...patch }),
        ]),
      ).rejects.toThrow(/constraint/);
  });

  it("creates, updates and removes categorized changes with scoped ids and audit events", async () => {
    await login(editor);
    const created = await saveChange();
    const privateChange = await saveChange({
      category: "technical",
      title: "Internal maintenance",
    });
    expect(
      await value(
        "select is_public as value from public.shiplog_release_changes where id=$1",
        [privateChange.id],
      ),
    ).toBe(false);
    await saveChange(
      { ...change, title: "Edited", is_public: false },
      created.id,
    );
    const rows = await db.query<{ title: string; is_public: boolean }>(
      "select title,is_public from public.shiplog_release_changes where id=$1",
      [created.id],
    );
    expect(rows.rows).toEqual([{ title: "Edited", is_public: false }]);
    await expect(
      saveChange({ ...change, category: "invalid" }),
    ).rejects.toThrow(/constraint/);
    await expect(saveChange({ ...change, title: " " })).rejects.toThrow(
      /constraint/,
    );
    await expect(
      saveChange({ ...change, description: "x".repeat(10001) }),
    ).rejects.toThrow(/constraint/);
    const other = await value<string>(
      "select (public.shiplog_create_release($1::jsonb)).id as value",
      [JSON.stringify({ ...input(), version: `2.0.${counter}` })],
    );
    await expect(
      db.query("select public.shiplog_delete_change($1,$2)", [
        other,
        created.id,
      ]),
    ).rejects.toThrow(/not found/);
    await expect(
      db.query("select public.shiplog_save_change($1,$2::jsonb,$3)", [
        other,
        JSON.stringify(change),
        created.id,
      ]),
    ).rejects.toThrow(/not found/);
    await db.query("select public.shiplog_delete_change($1,$2)", [
      release,
      created.id,
    ]);
    expect(
      (
        await db.query(
          "select * from public.shiplog_release_changes where id=$1",
          [created.id],
        )
      ).rows,
    ).toHaveLength(0);
    const events = await db.query<{ event: string }>(
      "select event from public.shiplog_audit_events where release_id=$1 order by created_at,id",
      [release],
    );
    expect(events.rows.map((item) => item.event)).toEqual(
      expect.arrayContaining([
        "change.created",
        "change.updated",
        "change.deleted",
      ]),
    );
  });

  it("checks editor/viewer/outsider/anonymous permissions on every new RPC", async () => {
    const saved = await saveChange();
    for (const account of [viewer, outsider]) {
      await login(account);
      await expect(saveChange()).rejects.toThrow(/edit access/);
      await expect(
        db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
          release,
          JSON.stringify(input()),
        ]),
      ).rejects.toThrow(/edit access/);
      await expect(
        db.query("select public.shiplog_delete_change($1,$2)", [
          release,
          saved.id,
        ]),
      ).rejects.toThrow(/edit access/);
      await expect(
        db.query("select public.shiplog_lock_draft($1)", [release]),
      ).rejects.toThrow(/permission denied/);
      await expect(
        db.query("select public.shiplog_public_release_content($1)", [release]),
      ).rejects.toThrow(/permission denied/);
    }
    await login(viewer);
    expect(
      publicReleaseSchema.parse(
        await value("select public.shiplog_preview_release($1) as value", [
          release,
        ]),
      ).title,
    ).toBe("First title");
    await login(outsider);
    await expect(
      db.query("select public.shiplog_preview_release($1)", [release]),
    ).rejects.toThrow(/access required/);
    expect(
      (await db.query("select * from public.shiplog_release_changes")).rows,
    ).toHaveLength(0);
    await login(null, "anon");
    for (const sql of [
      "select public.shiplog_preview_release($1)",
      "select public.shiplog_lock_draft($1)",
      "select public.shiplog_public_release_content($1)",
    ])
      await expect(db.query(sql, [release])).rejects.toThrow(
        /permission denied/,
      );
    await expect(
      db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
        release,
        JSON.stringify(input()),
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(saveChange()).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select public.shiplog_delete_change($1,$2)", [
        release,
        saved.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("uses the identical allow-list for draft preview and published catalog, excluding internal changes", async () => {
    await saveChange();
    await saveChange({
      ...change,
      title: "SECRET private change",
      is_public: false,
    });
    const preview = publicReleaseSchema.parse(
      await value("select public.shiplog_preview_release($1) as value", [
        release,
      ]),
    );
    expect(preview.changes).toEqual([
      {
        category: "feature",
        title: change.title,
        description: change.description,
      },
    ]);
    expect(preview.published_at).toBeNull();
    expect(JSON.stringify(preview)).not.toContain("SECRET");
    const before = publicCatalogSchema.parse(
      await value("select public.shiplog_public_catalog($1) as value", [token]),
    );
    expect(before.releases.some((item) => item.id === release)).toBe(false);
    await db.query("select public.shiplog_publish_release($1,true)", [release]);
    await login(null, "anon");
    const catalog = publicCatalogSchema.parse(
      await value("select public.shiplog_public_catalog($1) as value", [token]),
    );
    const published = catalog.releases.find((item) => item.id === release)!;
    expect({ ...published, published_at: null }).toEqual(preview);
  });

  it("locks all content edits after publication, even after unpublishing, while retaining notes", async () => {
    const saved = await saveChange();
    for (const published of [true, false]) {
      await db.query("select public.shiplog_publish_release($1,$2)", [
        release,
        published,
      ]);
      await expect(saveChange()).rejects.toThrow(/never-published drafts/);
      await expect(
        saveChange({ ...change, title: "rewrite" }, saved.id),
      ).rejects.toThrow(/never-published drafts/);
      await expect(
        db.query("select public.shiplog_delete_change($1,$2)", [
          release,
          saved.id,
        ]),
      ).rejects.toThrow(/never-published drafts/);
      await expect(
        db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
          release,
          JSON.stringify(input()),
        ]),
      ).rejects.toThrow(/never-published drafts/);
    }
    expect(
      await value(
        "select first_published_at is not null as value from public.shiplog_releases where id=$1",
        [release],
      ),
    ).toBe(true);
    expect(
      await value(
        "select title as value from public.shiplog_release_changes where id=$1",
        [saved.id],
      ),
    ).toBe(change.title);
    // Future lifecycle workflows must not accidentally unlock non-draft content.
    await login(owner, "postgres");
    await db.query(
      "update public.shiplog_releases set first_published_at=null,status='approved' where id=$1",
      [release],
    );
    await login(owner);
    await expect(saveChange()).rejects.toThrow(/never-published drafts/);
  });
});

it("backfills the first publication date from audit history for an already unpublished release", async () => {
  const migration = "20261030200000_shiplog_draft_content.sql";
  const old = await createMigratedDatabase(accounts, { until: migration });
  try {
    await old.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await old.exec("set role authenticated");
    const ws = (
      await old.query<{ id: string }>(
        "select id from public.create_workspace('Legacy')",
      )
    ).rows[0]!.id;
    const app = (
      await old.query<{ id: string }>(
        "select * from public.shiplog_create_application($1,'App','app','web')",
        [ws],
      )
    ).rows[0]!.id;
    const releaseId = (
      await old.query<{ id: string }>(
        "select * from public.shiplog_create_release($1::jsonb)",
        [JSON.stringify({ ...input(), application_id: app, version: "1.0.0" })],
      )
    ).rows[0]!.id;
    await old.query("select public.shiplog_publish_release($1,true)", [
      releaseId,
    ]);
    await old.query("select public.shiplog_publish_release($1,false)", [
      releaseId,
    ]);
    await old.exec("reset role");
    await applyMigrations(old, { from: migration });
    await old.exec("set role authenticated");
    await expect(
      old.query("select public.shiplog_update_draft($1,$2::jsonb)", [
        releaseId,
        JSON.stringify({ ...input(), application_id: app, version: "1.0.0" }),
      ]),
    ).rejects.toThrow(/never-published drafts/);
  } finally {
    await old.close();
  }
});
