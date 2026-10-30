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
      response({ message: "Only drafts can be edited" }, 400),
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
    ).rejects.toThrow("Only drafts can be edited");
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
      repository.updatePublicNotes("release", "x".repeat(20001)),
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
    await expect(repository.decideRelease("release", true)).rejects.toThrow(
      "Workspace owner access required",
    );
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
      team_id: null,
      description: "",
      platform: "web",
      public_enabled: false,
      created_at: "2026-10-30T12:00:00Z",
    };
    fetch.mockImplementation(async (url) => {
      const path = String(url);
      if (path.includes("shiplog_releases")) return response([]);
      if (path.includes("/rpc/shiplog_list_teams")) return response([]);
      return response(
        path.includes("offset=500")
          ? [application]
          : Array(500).fill(application),
      );
    });
    expect(
      (await repository.loadWorkspace(application.workspace_id)).applications,
    ).toHaveLength(501);
    for (const [url] of fetch.mock.calls.filter(
      ([url]) => !String(url).includes("/rpc/"),
    ))
      expect(String(url)).toContain(
        `workspace_id=eq.${application.workspace_id}`,
      );
  });
});
