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
});
