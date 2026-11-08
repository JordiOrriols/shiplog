import { afterEach, expect, it, vi } from "vitest";
import { platformRepository } from "./platform";

afterEach(() => vi.unstubAllGlobals());
it("approval requests only submit the decision and validate reduced identity projections", async () => {
  const workspace = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222";
  const data = {
    account_id: id,
    decisions: [{ user_id: id, name: "ada", approved: null, decided_at: null }],
  };
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(data))),
    );
  vi.stubGlobal("fetch", fetcher);
  expect(await platformRepository.decisions(workspace, id)).toEqual(data);
  await platformRepository.decideRelease(workspace, id, false);
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    `/api/shiplog/workspaces/${workspace}/releases/${id}/decision`,
  );
  expect(fetcher.mock.calls[1]?.[1].method).toBe("PATCH");
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({
    approved: false,
  });
  await expect(
    platformRepository.decideRelease(workspace, "bad", true),
  ).rejects.toThrow();
  fetcher.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ...data, account_id: "bad" })),
    ),
  );
  await expect(platformRepository.decisions(workspace, id)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("checklist APIs validate templates and completion before scoped JSON writes", async () => {
  const workspace = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222";
  const template = {
    revision: 0,
    items: [
      { category: "QA", title: "Check", description: "", mandatory: true },
    ],
  };
  const readiness = {
    release_id: id,
    template_revision: 1,
    qa_status: "not_started",
    qa_notes: "",
    qa_recorded_by: null,
    qa_recorded_at: null,
    approved_by: null,
    approved_at: null,
    approval_override_reason: "",
    items: [],
  };
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(template))),
    );
  vi.stubGlobal("fetch", fetcher);
  await platformRepository.checklistTemplate(workspace, id);
  await platformRepository.saveChecklistTemplate(workspace, id, template);
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    `/api/shiplog/workspaces/${workspace}/applications/${id}/checklist-template`,
  );
  expect(fetcher.mock.calls[1]?.[1].method).toBe("PATCH");
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual(template);
  fetcher.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(readiness))),
  );
  await platformRepository.readiness(workspace, id);
  await platformRepository.completeChecklistItem(workspace, id, id, false);
  expect(fetcher.mock.calls[3]?.[0]).toBe(
    `/api/shiplog/workspaces/${workspace}/releases/${id}/checklist/${id}`,
  );
  expect(JSON.parse(fetcher.mock.calls[3]?.[1].body)).toEqual({
    completed: false,
  });
  await expect(
    platformRepository.saveChecklistTemplate(workspace, id, {
      ...template,
      revision: -1,
    }),
  ).rejects.toThrow();
  await expect(
    platformRepository.completeChecklistItem(workspace, id, "bad", true),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("release configuration validates and scopes writes and linked-feature reads", async () => {
  const workspace = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222";
  const input = {
    application_id: id,
    version: "1.0.0",
    title: " Release ",
    public_notes: "",
  };
  const fetcher = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          ...input,
          title: "Release",
          id,
          release_type: "major",
          status: "draft",
          created_at: "2026-11-08",
          features: [],
        }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await platformRepository.saveConfiguration(
    workspace,
    input,
    "draft",
    null,
    null,
  );
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    `/api/shiplog/workspaces/${workspace}/releases`,
  );
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
    ...input,
    title: "Release",
    status: "draft",
    feature_ids: null,
  });
  await platformRepository.saveConfiguration(workspace, input, "qa", [id], id);
  expect(fetcher.mock.calls[1]?.[1].method).toBe("PATCH");
  fetcher.mockImplementation(() => Promise.resolve(new Response("[]")));
  await platformRepository.releaseFeatures(workspace, id);
  expect(fetcher.mock.calls[2]?.[0]).toBe(
    `/api/shiplog/workspaces/${workspace}/releases/${id}/features`,
  );
  await platformRepository.workspaceFeatures(workspace);
  expect(fetcher.mock.calls[3]?.[0]).toBe(
    `/api/shiplog/workspaces/${workspace}/features`,
  );
  await expect(
    platformRepository.saveConfiguration(
      workspace,
      { ...input, version: "01.0.0" },
      "draft",
      null,
      null,
    ),
  ).rejects.toThrow();
  await expect(
    platformRepository.saveConfiguration(
      workspace,
      input,
      "invalid",
      null,
      null,
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("application CRUD validates editable fields and uses scoped JSON requests", async () => {
  const workspace = "11111111-1111-4111-8111-111111111111",
    id = "22222222-2222-4222-8222-222222222222";
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ applications: [], teams: [] })),
      ),
    );
  vi.stubGlobal("fetch", fetcher);
  await platformRepository.applications(workspace);
  await platformRepository.saveApplication(workspace, {
    name: "  App  ",
    description: "Notes",
    team_id: null,
  });
  expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual({
    name: "App",
    description: "Notes",
    team_id: null,
  });
  await platformRepository.saveApplication(
    workspace,
    { name: "Renamed", description: "", team_id: null },
    id,
  );
  expect(fetcher.mock.calls[2]?.[1].method).toBe("PATCH");
  await platformRepository.deleteApplication(workspace, id);
  expect(fetcher.mock.calls[3]?.[1].method).toBe("DELETE");
  expect(fetcher.mock.calls[3]?.[0]).toBe(
    `/api/shiplog/workspaces/${workspace}/applications/${id}`,
  );
  await expect(
    platformRepository.saveApplication(workspace, {
      name: " ",
      description: "",
      team_id: null,
    }),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it("uses the same-origin API and validates workspace responses", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
  vi.stubGlobal("fetch", fetcher);
  expect(await platformRepository.workspaces()).toEqual([]);
  expect(fetcher).toHaveBeenCalledWith("/api/apps/shiplog/workspaces", {
    credentials: "same-origin",
    method: "GET",
    headers: { Accept: "application/json" },
  });
  fetcher.mockResolvedValue(new Response(JSON.stringify([{ id: "invalid" }])));
  await expect(platformRepository.workspaces()).rejects.toThrow();
});

it("surfaces authentication/permission errors instead of empty success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Workspace access required" }), {
        status: 403,
      }),
    ),
  );
  await expect(platformRepository.workspaces()).rejects.toThrow(
    "Workspace access required",
  );
});

it("rejects invalid workspace IDs before making a catalog request", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(platformRepository.catalog("not-a-uuid")).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
