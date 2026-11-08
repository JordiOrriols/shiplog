import { afterEach, expect, it, vi } from "vitest";
import { platformRepository } from "./platform";

afterEach(() => vi.unstubAllGlobals());

it("uses the same-origin API and validates workspace responses", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
  vi.stubGlobal("fetch", fetcher);
  expect(await platformRepository.workspaces()).toEqual([]);
  expect(fetcher).toHaveBeenCalledWith("/api/apps/shiplog/workspaces", {
    credentials: "same-origin",
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
