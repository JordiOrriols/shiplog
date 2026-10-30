// @vitest-environment node
import { it, expect } from "vitest";
import {
  createMigratedDatabase,
  applyMigrations,
} from "./support/migratedDatabase";
import { publicCatalogSchema } from "@/lib/contracts";

it("automatically includes existing and future applications without leaking internal changes or another workspace, and still revokes the catalog", async () => {
  const migration = "20261030233000_shiplog_all_applications_catalog.sql";
  const owner = "11111111-1111-4111-8111-111111111111";
  const db = await createMigratedDatabase(
    [{ id: owner, email: "owner@example.com" }],
    { until: migration },
  );
  async function value<T>(sql: string, args: unknown[] = []) {
    return (await db.query<{ value: T }>(sql, args)).rows[0]!.value;
  }
  async function createApp(workspace: string, name: string) {
    const app = await value<string>(
      "select (public.shiplog_save_application($1,$2)).id as value",
      [workspace, name],
    );
    const release = await value<string>(
      "select (public.shiplog_create_release($1::jsonb)).id as value",
      [
        JSON.stringify({
          application_id: app,
          version: "1.0.0",
          title: name,
          public_notes: "Public story",
        }),
      ],
    );
    return { app, release };
  }
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    const workspace = await value<string>(
      "select id as value from public.create_workspace('Catalog')",
    );
    const hidden = await createApp(workspace, "Previously excluded");
    const included = await createApp(workspace, "Previously included");
    await db.query("select public.shiplog_set_application_public($1,true)", [
      included.app,
    ]);
    const otherWorkspace = await value<string>(
      "select id as value from public.create_workspace('Other workspace')",
    );
    await createApp(otherWorkspace, "SECRET other workspace");
    const token = await value<string>(
      "select public.shiplog_portal($1,true) as value",
      [workspace],
    );
    await db.exec("reset role");
    await applyMigrations(db, { from: migration });
    await db.exec("set role authenticated");
    const applications = (
      await db.query<Record<string, unknown>>(
        "select * from public.shiplog_applications where workspace_id=$1",
        [workspace],
      )
    ).rows;
    for (const app of applications)
      expect(app).not.toHaveProperty("public_enabled");
    const audit = (
      await db.query(
        "select event,details from public.shiplog_audit_events where workspace_id=$1",
        [workspace],
      )
    ).rows;
    expect(JSON.stringify(audit)).not.toContain("public_enabled");
    expect(JSON.stringify(audit)).not.toContain("application.public_disabled");
    const future = await createApp(workspace, "Future application");
    for (const [release, status] of [
      [hidden.release, "qa"],
      [included.release, "released"],
    ])
      await db.query("select public.shiplog_set_release_status($1,$2)", [
        release,
        status,
      ]);
    for (const [title, is_public] of [
      ["Visible change", true],
      ["SECRET internal change", false],
    ])
      await db.query("select public.shiplog_save_change($1,$2::jsonb)", [
        future.release,
        JSON.stringify({
          title,
          category: "feature",
          description: "",
          is_public,
        }),
      ]);
    expect(
      await value(
        "select to_regprocedure('public.shiplog_set_application_public(uuid,boolean)') as value",
      ),
    ).toBeNull();
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.exec("set role anon");
    const raw = await value(
      "select public.shiplog_public_catalog($1) as value",
      [token],
    );
    const catalog = publicCatalogSchema.parse(raw);
    expect(catalog.applications.map((app) => app.name)).toEqual([
      "Future application",
      "Previously excluded",
      "Previously included",
    ]);
    expect(catalog.releases.map((release) => release.status).sort()).toEqual([
      "draft",
      "qa",
      "released",
    ]);
    expect(
      catalog.releases
        .find((release) => release.id === future.release)
        ?.changes.map((change) => change.title),
    ).toEqual(["Visible change"]);
    for (const secret of ["SECRET", "public_enabled", "workspace_id", owner])
      expect(JSON.stringify(raw)).not.toContain(secret);
    await expect(
      db.query("select * from public.shiplog_applications"),
    ).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      owner,
    ]);
    await db.exec("set role authenticated");
    await db.query("select public.shiplog_portal($1,false)", [workspace]);
    await db.exec("reset role");
    await db.exec("set role anon");
    await expect(
      db.query("select public.shiplog_public_catalog($1)", [token]),
    ).rejects.toThrow(/unavailable/);
  } finally {
    await db.close();
  }
}, 30_000);
