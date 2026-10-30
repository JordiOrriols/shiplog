import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createShiplogRepository } from "./repository";

function setup() {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = createClient(
    "https://example.supabase.co",
    "test-publishable-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: crypto.randomUUID(),
      },
      global: { fetch },
    },
  );
  const response = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  return { fetch, response, repository: createShiplogRepository(client) };
}
describe("Shiplog transport", () => {
  it("rejects malformed releases before any request", async () => {
    const { fetch, repository } = setup();
    await expect(
      repository.createRelease({ version: "1.0" }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects invalid deployment outcomes before transport and surfaces deployment server errors", async () => {
    const { fetch, response, repository } = setup();
    await expect(
      repository.recordDeployment({ outcome: "succeeded" }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    const input = {
      environment_id: "11111111-1111-4111-8111-111111111111",
      release_id: "22222222-2222-4222-8222-222222222222",
      outcome: "succeeded",
      rollback_target_id: null,
      started_at: "2026-01-01T12:00:00Z",
      completed_at: "2026-01-02T12:00:00Z",
      source: "Manual",
      build_reference: "",
      pipeline_url: "",
      notes: "",
      error_details: "",
    };
    for (const patch of [
      { pipeline_url: "javascript:alert(1)" },
      { started_at: "2026-01-03T12:00:00Z" },
      { outcome: "rollback" },
      { rollback_target_id: input.release_id },
    ])
      await expect(
        repository.recordDeployment({ ...input, ...patch }),
      ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(
      response(
        {
          message:
            "Rollback source must match the reported environment version at that time",
        },
        400,
      ),
    );
    await expect(repository.recordDeployment(input)).rejects.toThrow(
      "Rollback source must match",
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/rpc/shiplog_record_deployment"),
      expect.objectContaining({ body: JSON.stringify({ input }) }),
    );
  });
  it("validates draft edits and changes before transport and surfaces mutation failures", async () => {
    const { fetch, response, repository } = setup();
    await expect(
      repository.updateDraft("release", { version: "1.0" }),
    ).rejects.toThrow();
    await expect(
      repository.saveChange("release", { category: "invalid" }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(
      response({ message: "Only never-published drafts can be edited" }, 400),
    );
    await expect(
      repository.saveChange(
        "release",
        {
          category: "bug_fix",
          title: "Dates align",
          description: "",
          is_public: false,
        },
        "change",
      ),
    ).rejects.toThrow("Only never-published drafts can be edited");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/rpc/shiplog_save_change"),
      expect.objectContaining({
        body: JSON.stringify({
          release: "release",
          input: {
            category: "bug_fix",
            title: "Dates align",
            description: "",
            is_public: false,
          },
          change_id: "change",
        }),
      }),
    );
    fetch.mockResolvedValueOnce(
      response({ public_notes: "Incomplete projection" }),
    );
    await expect(repository.previewRelease("release")).rejects.toThrow();
  });
  it("validates response shapes and surfaces server errors", async () => {
    const { fetch, response, repository } = setup();
    fetch.mockResolvedValueOnce(
      response({ message: "Shiplog edit access required" }, 403),
    );
    await expect(repository.setPublic("application", true)).rejects.toThrow(
      "Shiplog edit access required",
    );
    fetch.mockResolvedValueOnce(response({ name: "Missing releases" }));
    await expect(repository.publicCatalog("token")).rejects.toThrow();
  });
  it("validates manual readiness input before transport and preserves server failures", async () => {
    const { fetch, response, repository } = setup();
    await expect(
      repository.saveChecklistTemplate("application", {
        revision: 1,
        items: [{ title: "Incomplete" }],
      }),
    ).rejects.toThrow();
    await expect(
      repository.recordManualQa("release", { qa_status: "invalid", notes: "" }),
    ).rejects.toThrow();
    await expect(
      repository.transitionReadiness("release", "approved", "x".repeat(4001)),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(
      response(
        { message: "Checklist template changed. Reload before saving." },
        409,
      ),
    );
    await expect(
      repository.saveChecklistTemplate("application", {
        revision: 2,
        items: [],
      }),
    ).rejects.toThrow("Checklist template changed");
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/rpc/shiplog_save_checklist_template"),
      expect.objectContaining({
        body: JSON.stringify({
          application: "application",
          items: [],
          expected_revision: 2,
        }),
      }),
    );
    fetch.mockResolvedValueOnce(
      response({ message: "Workspace owner access required" }, 403),
    );
    await expect(
      repository.transitionReadiness("release", "approved", "Emergency"),
    ).rejects.toThrow("Workspace owner access required");
  });
  it("distinguishes an unconfigured template from transport failures and validates readiness responses", async () => {
    const { fetch, response, repository } = setup();
    fetch.mockResolvedValueOnce(response(null));
    expect(await repository.checklistTemplate("application")).toEqual({
      revision: 0,
      items: [],
    });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("application_id=eq.application"),
      expect.anything(),
    );
    fetch.mockResolvedValueOnce(
      response({ message: "Template unavailable" }, 500),
    );
    await expect(repository.checklistTemplate("application")).rejects.toThrow(
      "Template unavailable",
    );
    fetch.mockResolvedValueOnce(response({ qa_status: "passed", items: [] }));
    await expect(repository.readiness("release")).rejects.toThrow();
  });
  it("pages workspace reads without truncation and scopes each request", async () => {
    const { fetch, response, repository } = setup();
    const application = {
      id: "11111111-1111-4111-8111-111111111111",
      workspace_id: "22222222-2222-4222-8222-222222222222",
      name: "Website",
      slug: "website",
      description: "",
      platform: "web",
      public_enabled: false,
      created_at: "2026-10-30T12:00:00Z",
    };
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("shiplog_releases")) return response([]);
      return response(
        path.includes("offset=500")
          ? [application]
          : Array(500).fill(application),
      );
    });
    expect(
      (await repository.loadWorkspace(application.workspace_id)).applications,
    ).toHaveLength(501);
    for (const [url] of fetch.mock.calls)
      expect(String(url)).toContain(
        `workspace_id=eq.${application.workspace_id}`,
      );
  });
  it("pages deployment history by application and orders it by outcome time rather than recording time", async () => {
    const { fetch, response, repository } = setup();
    const app = "11111111-1111-4111-8111-111111111111";
    const environment = "22222222-2222-4222-8222-222222222222";
    const release = "33333333-3333-4333-8333-333333333333";
    const deployment = {
      id: "44444444-4444-4444-8444-444444444444",
      application_id: app,
      environment_id: environment,
      release_id: release,
      outcome: "succeeded",
      rollback_target_id: null,
      started_at: "2026-01-01T10:00:00Z",
      completed_at: "2026-01-01T12:00:00Z",
      source: "Manual",
      build_reference: "",
      pipeline_url: "",
      notes: "",
      error_details: "",
      sequence: 1,
      recorded_by: null,
      created_at: "2026-01-02T12:00:00Z",
      readiness_warnings: [],
    };
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("shiplog_environments?"))
        return response([
          {
            id: environment,
            application_id: app,
            name: "Production",
            kind: "production",
          },
        ]);
      if (path.includes("shiplog_environment_versions?"))
        return response([
          {
            environment_id: environment,
            application_id: app,
            deployment_id: deployment.id,
            release_id: release,
            completed_at: deployment.completed_at,
          },
        ]);
      return response(
        path.includes("offset=500")
          ? [
              {
                ...deployment,
                sequence: 2,
                completed_at: "2026-01-03T12:00:00Z",
              },
            ]
          : Array(500).fill(deployment),
      );
    });
    const result = await repository.deployments(app);
    expect(result.deployments).toHaveLength(501);
    expect(result.deployments[0]!.sequence).toBe(2);
    expect(result.environments).toHaveLength(1);
    expect(result.versions).toHaveLength(1);
    for (const [url] of fetch.mock.calls)
      expect(String(url)).toContain(`application_id=eq.${app}`);
  });
});
