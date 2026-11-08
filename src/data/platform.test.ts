import { afterEach, expect, it, vi } from "vitest";
import { platformRepository } from "./platform";

afterEach(() => vi.unstubAllGlobals());
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
