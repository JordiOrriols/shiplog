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
  it("uses shared member/account/email display-name precedence for approvals", async () => {
    const { fetch, response, repository } = setup();
    const base = {
      user_id: "11111111-1111-4111-8111-111111111111",
      approved: true,
      decided_at: null,
    };
    fetch.mockResolvedValueOnce(
      response([
        {
          ...base,
          name: "Workspace Ada",
          member_name: "Workspace Ada",
          account_name: "Account Ada",
          email: "ada@example.com",
        },
        {
          ...base,
          name: "grace@example.com",
          member_name: " ",
          account_name: "Account Grace",
          email: "grace@example.com",
        },
        {
          ...base,
          name: "alan@example.com",
          member_name: null,
          account_name: null,
          email: "alan@example.com",
        },
      ]),
    );
    expect(
      (await repository.decisions("release")).map((member) => member.name),
    ).toEqual(["Workspace Ada", "Account Grace", "alan"]);
  });
  it("pages only the authorized current-app directory and surfaces invalid data or access failures", async () => {
    const { fetch, response, repository } = setup();
    const share = {
      user_id: "11111111-1111-4111-8111-111111111111",
      email: "reader@example.com",
      app: "shiplog",
      access_level: "viewer",
    };
    fetch
      .mockResolvedValueOnce(response(Array(500).fill(share)))
      .mockResolvedValueOnce(response([share]));
    expect(await repository.sharingAccess("workspace")).toHaveLength(501);
    expect(String(fetch.mock.calls[1]?.[0])).toContain("offset=500");
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      workspace: "workspace",
      app_name: "shiplog",
    });
    fetch.mockResolvedValueOnce(
      response({ message: "Workspace sharing access required" }, 403),
    );
    await expect(repository.sharingAccess("workspace")).rejects.toThrow(
      "Workspace sharing access required",
    );
    fetch.mockResolvedValueOnce(response([{ ...share, app: "planner" }]));
    await expect(repository.sharingAccess("workspace")).rejects.toThrow();
  });
  it("rejects malformed releases before any request", async () => {
    const { fetch, repository } = setup();
    await expect(
      repository.createRelease({ version: "1.0" }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates details before transport and surfaces feature mutation failures", async () => {
    const { fetch, response, repository } = setup();
    await expect(
      repository.updateDraft("release", { version: "1.0" }),
    ).rejects.toThrow();
    await expect(
      repository.updateDetails("release", { version: "1.0" }, "qa"),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(
      response({ message: "Only drafts can be edited" }, 400),
    );
    await expect(
      repository.linkFeature("release", "feature", true),
    ).rejects.toThrow("Only drafts can be edited");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/rpc/shiplog_link_feature"),
      expect.objectContaining({
        body: JSON.stringify({
          release: "release",
          feature: "feature",
          linked: true,
        }),
      }),
    );
  });
  it("paginates Planner names and validates responses without swallowing access failures", async () => {
    const { fetch, response, repository } = setup();
    const feature = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Roadmap",
      linked: false,
    };
    fetch
      .mockResolvedValueOnce(response(Array(500).fill(feature)))
      .mockResolvedValueOnce(response([feature]));
    expect(await repository.releaseFeatures("release", true)).toHaveLength(501);
    expect(String(fetch.mock.calls[1]?.[0])).toContain("offset=500");
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      release: "release",
      candidates: true,
    });
    fetch.mockResolvedValueOnce(
      response({ message: "Planner access required" }, 403),
    );
    await expect(repository.releaseFeatures("release", true)).rejects.toThrow(
      "Planner access required",
    );
    fetch.mockResolvedValueOnce(response([{ name: "Missing ID" }]));
    await expect(repository.releaseFeatures("release")).rejects.toThrow();
  });
  it("validates response shapes and surfaces server errors", async () => {
    const { fetch, response, repository } = setup();
    fetch.mockResolvedValueOnce(
      response({ message: "Shiplog edit access required" }, 403),
    );
    await expect(repository.setReleaseStatus("release", "qa")).rejects.toThrow(
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
