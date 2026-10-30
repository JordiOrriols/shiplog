// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createMigratedDatabase,
  applyMigrations,
} from "./support/migratedDatabase";
import { readinessSchema, type Readiness } from "@/lib/contracts";

const owner = "11111111-1111-4111-8111-111111111111";
const editor = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
const accounts = [owner, editor, viewer, outsider].map((id, i) => ({
  id,
  email: `user${i}@example.com`,
}));
const template = [
  {
    title: "Review completed",
    category: "Development",
    description: "SECRET checklist",
    mandatory: true,
  },
  {
    title: "Notify support",
    category: "Communication",
    description: "",
    mandatory: false,
  },
];
let db: PGlite;
let workspace: string;
let application: string;
let release: string;
let counter = 0;
const releaseInput = () => ({
  application_id: application,
  version: "1.0.0",
  release_type: "minor",
  title: "Manual release",
  internal_notes: "",
  public_notes: "Hello",
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
async function readiness(): Promise<Readiness> {
  return readinessSchema.parse(
    await value("select public.shiplog_get_readiness($1) as value", [release]),
  );
}
const saveTemplate = (items: unknown = template, revision = 0) =>
  db.query("select public.shiplog_save_checklist_template($1,$2::jsonb,$3)", [
    application,
    JSON.stringify(items),
    revision,
  ]);
const transition = (status: string, reason = "") =>
  db.query("select public.shiplog_transition_readiness($1,$2,$3)", [
    release,
    status,
    reason,
  ]);
const qa = (status: string, notes = "") =>
  db.query("select public.shiplog_record_manual_qa($1,$2,$3)", [
    release,
    status,
    notes,
  ]);
const complete = (item: string, completed = true) =>
  db.query("select public.shiplog_complete_checklist_item($1,$2,$3)", [
    release,
    item,
    completed,
  ]);
beforeAll(async () => {
  db = await createMigratedDatabase(accounts);
  await login(owner);
  workspace = await value(
    "select id as value from public.create_workspace('Readiness')",
  );
  for (const [email, access] of [
    ["user1@example.com", "editor"],
    ["user2@example.com", "viewer"],
  ]) {
    await db.query("select public.share_workspace($1,$2,'shiplog',$3)", [
      workspace,
      email,
      access,
    ]);
  }
});
beforeEach(async () => {
  await login(owner);
  counter++;
  application = await value(
    "select (public.shiplog_create_application($1,'Website',$2,'web')).id as value",
    [workspace, `web-${counter}`],
  );
  await saveTemplate();
  release = await value(
    "select (public.shiplog_create_release($1::jsonb)).id as value",
    [JSON.stringify(releaseInput())],
  );
});
afterAll(async () => {
  await db?.close();
});

describe("manual readiness", () => {
  it("snapshots templates at creation and preserves old releases through template edits", async () => {
    const snapshot = await readiness();
    expect(snapshot.template_revision).toBe(1);
    expect(
      snapshot.items.map(({ title, mandatory }) => ({ title, mandatory })),
    ).toEqual(template.map(({ title, mandatory }) => ({ title, mandatory })));
    await saveTemplate(
      [
        {
          ...template[0],
          title: "New rule",
          description: "",
          category: "QA",
          mandatory: true,
        },
      ],
      1,
    );
    expect(await readiness()).toEqual(snapshot);
    const next = await value<string>(
      "select (public.shiplog_create_release($1::jsonb)).id as value",
      [JSON.stringify({ ...releaseInput(), version: "1.1.0" })],
    );
    const nextData = readinessSchema.parse(
      await value("select public.shiplog_get_readiness($1) as value", [next]),
    );
    expect(nextData.template_revision).toBe(2);
    expect(nextData.items.map((item) => item.title)).toEqual(["New rule"]);
    await expect(saveTemplate([], 1)).rejects.toThrow(/changed.*Reload/);
    expect((await readiness()).items).toHaveLength(2);
  });
  it("validates bounded template data and prevents direct snapshot mutations", async () => {
    for (const items of [
      {},
      null,
      Array(101).fill(template[0]),
      [{ ...template[0], title: " " }],
      [{ ...template[0], category: "x".repeat(81) }],
      [{ ...template[0], description: "x".repeat(4001) }],
      [{ ...template[0], mandatory: "true" }],
      [{ title: "Incomplete" }],
    ]) {
      await expect(saveTemplate(items, 1)).rejects.toThrow(/items|Invalid/);
    }
    for (const sql of [
      "delete from public.shiplog_checklist_items",
      "update public.shiplog_readiness set qa_status='passed'",
      "update public.shiplog_checklist_templates set items='[]'",
      "select public.shiplog_lock_readiness($1)",
    ])
      await expect(
        db.query(sql, sql.includes("$1") ? [release] : []),
      ).rejects.toThrow(/permission denied/);
    await expect(transition("released")).rejects.toThrow(
      /Invalid readiness transition/,
    );
  });
  it("allows editors to complete checklists and record QA, but reserves approvals and overrides for owners", async () => {
    await login(editor);
    const item = (await readiness()).items[0]!;
    await expect(qa("passed")).rejects.toThrow(/ready for QA first/);
    await expect(saveTemplate([], 1)).rejects.toThrow(/owner access/);
    await expect(transition("ready_for_qa")).rejects.toThrow(/incomplete/);
    await expect(transition("ready_for_qa", "Override")).rejects.toThrow(
      /owner access/,
    );
    await complete(item.id);
    const completed = (await readiness()).items[0]!;
    expect(completed.completed_by).toBe(editor);
    expect(completed.completed_at).toBeTruthy();
    await complete(item.id);
    expect((await readiness()).items[0]!.completed_at).toBe(
      completed.completed_at,
    );
    await transition("ready_for_qa");
    for (const status of [
      "running",
      "failed",
      "partially_passed",
      "skipped",
      "not_started",
      "passed",
    ]) {
      await qa(status, "SECRET QA notes");
      const result = await readiness();
      expect(result.qa_status).toBe(status);
      expect(result.qa_recorded_by).toBe(editor);
      expect(result.qa_recorded_at).toBeTruthy();
      expect(
        await value(
          "select status as value from public.shiplog_releases where id=$1",
          [release],
        ),
      ).toBe(status === "passed" ? "qa_passed" : "qa_in_progress");
    }
    await expect(transition("approved")).rejects.toThrow(/owner access/);
    await expect(qa("unknown")).rejects.toThrow(/Invalid/);
    await expect(qa("passed", "x".repeat(10001))).rejects.toThrow(/Invalid/);
    await login(owner);
    await transition("approved");
    expect((await readiness()).approved_by).toBe(owner);
    expect((await readiness()).approval_override_reason).toBe("");
  });
  it("blocks approval for incomplete requirements and audits owner overrides without faking passed QA", async () => {
    await expect(transition("approved", "Reason")).rejects.toThrow(/enter QA/);
    await expect(transition("ready_for_qa", " ")).rejects.toThrow(/incomplete/);
    await transition("ready_for_qa", "Review tracked separately");
    await expect(transition("approved")).rejects.toThrow(/incomplete/);
    await expect(transition("approved", "x".repeat(4001))).rejects.toThrow(
      /Invalid/,
    );
    await transition("approved", "Emergency release approved by owner");
    const approved = await readiness();
    expect(approved.approved_at).toBeTruthy();
    expect(approved.approval_override_reason).toBe(
      "Emergency release approved by owner",
    );
    expect(approved.qa_status).toBe("not_started");
    expect(approved.items[0]!.completed_at).toBeNull();
    const audit = await value<{
      override_reason: string;
      missing_mandatory: number;
      qa_status: string;
    }>(
      "select details as value from public.shiplog_audit_events where release_id=$1 and event='readiness.approved'",
      [release],
    );
    expect(audit).toMatchObject({
      override_reason: "Emergency release approved by owner",
      missing_mandatory: 1,
      qa_status: "not_started",
    });
  });
  it("locks approved decisions and requires an explicit reopening that revokes approval", async () => {
    const item = (await readiness()).items[0]!;
    await complete(item.id);
    await transition("ready_for_qa");
    await qa("passed", "Verified");
    await transition("approved");
    await expect(complete(item.id, false)).rejects.toThrow(/Reopen QA/);
    await expect(qa("failed")).rejects.toThrow(/Reopen QA/);
    await expect(transition("reopen_qa", " ")).rejects.toThrow(
      /reason is required/,
    );
    await login(editor);
    await transition("reopen_qa", "Regression discovered");
    const reopened = await readiness();
    expect(reopened.approved_at).toBeNull();
    expect(reopened.approved_by).toBeNull();
    expect(reopened.qa_status).toBe("not_started");
    expect(reopened.qa_notes).toBe("");
    expect(reopened.items[0]!.completed_at).toBeTruthy();
    await complete(item.id, false);
    expect((await readiness()).items[0]!.completed_by).toBeNull();
    expect(
      await value(
        "select details->>'override_reason' as value from public.shiplog_audit_events where release_id=$1 and event='readiness.reopen_qa'",
        [release],
      ),
    ).toBe("Regression discovered");
  });
  it("authorizes all new surfaces and isolates QA/checklists from public data", async () => {
    const item = (await readiness()).items[0]!;
    for (const account of [viewer, outsider, null]) {
      await login(account, account ? "authenticated" : "anon");
      for (const operation of [
        () => saveTemplate([], 1),
        () => complete(item.id),
        () => qa("passed"),
        () => transition("ready_for_qa"),
        () => transition("approved", "Override"),
      ])
        await expect(operation()).rejects.toThrow(
          /access required|permission denied/,
        );
      if (account === viewer) expect((await readiness()).items).toHaveLength(2);
      else {
        await expect(readiness()).rejects.toThrow(
          /access required|permission denied/,
        );
        if (account) {
          expect(
            (await db.query("select * from public.shiplog_readiness")).rows,
          ).toHaveLength(0);
          expect(
            (await db.query("select * from public.shiplog_checklist_templates"))
              .rows,
          ).toHaveLength(0);
          expect(
            (await db.query("select * from public.shiplog_checklist_items"))
              .rows,
          ).toHaveLength(0);
        }
      }
    }
    await login(owner);
    await transition("ready_for_qa", "SECRET override");
    await qa("failed", "SECRET observations");
    await db.query("select public.shiplog_set_application_public($1,true)", [
      application,
    ]);
    await db.query("select public.shiplog_publish_release($1,true)", [release]);
    const token = await value(
      "select public.shiplog_portal($1,true) as value",
      [workspace],
    );
    await login(null, "anon");
    const catalog = await value(
      "select public.shiplog_public_catalog($1) as value",
      [token],
    );
    for (const privateField of [
      "SECRET",
      "qa_status",
      "qa_notes",
      "template_revision",
      "items",
      "approved_by",
    ])
      expect(JSON.stringify(catalog)).not.toContain(privateField);
  });
  it("does not conflate publication, approval or deployment and freezes content outside draft", async () => {
    await complete((await readiness()).items[0]!.id);
    await transition("ready_for_qa");
    await expect(
      db.query("select public.shiplog_update_draft($1,$2::jsonb)", [
        release,
        JSON.stringify(releaseInput()),
      ]),
    ).rejects.toThrow(/never-published drafts/);
    await qa("passed");
    await transition("approved");
    const row = await value<{ status: string; published_at: null }>(
      "select to_jsonb(r) as value from public.shiplog_releases r where id=$1",
      [release],
    );
    expect(row.status).toBe("approved");
    expect(row.published_at).toBeNull();
    await login(owner, "postgres");
    await db.query(
      "update public.shiplog_releases set status='released' where id=$1",
      [release],
    );
    await login(owner);
    await expect(qa("failed")).rejects.toThrow(/locked/);
    await expect(transition("reopen_qa", "Reason")).rejects.toThrow(/locked/);
  });
});

it("backfills existing releases with empty snapshots rather than retroactive requirements", async () => {
  const migration = "20261030210000_shiplog_manual_readiness.sql";
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
    const id = (
      await legacy.query<{ id: string }>(
        "select * from public.shiplog_create_release($1::jsonb)",
        [JSON.stringify({ ...releaseInput(), application_id: app })],
      )
    ).rows[0]!.id;
    await legacy.exec("reset role");
    await applyMigrations(legacy, { from: migration });
    await legacy.exec("set role authenticated");
    const result = readinessSchema.parse(
      (
        await legacy.query<{ value: unknown }>(
          "select public.shiplog_get_readiness($1) as value",
          [id],
        )
      ).rows[0]!.value,
    );
    expect(result.items).toEqual([]);
    expect(result.template_revision).toBe(0);
    expect(result.qa_status).toBe("not_started");
  } finally {
    await legacy.close();
  }
});
