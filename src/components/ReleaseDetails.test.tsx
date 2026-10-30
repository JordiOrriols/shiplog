import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { releaseSchema, type Release } from "@/lib/contracts";
import ReleaseDetails from "./ReleaseDetails";

const state = vi.hoisted(() => ({
  releaseFeatures: vi.fn(),
  linkFeature: vi.fn(),
  readiness: vi.fn(),
  updateDetails: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "owner" } }),
}));
vi.mock("@/data/useWorkspaceData", () => ({
  useWorkspaceData: () => ({ refresh: state.refresh }),
}));
const release = releaseSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  application_id: "22222222-2222-4222-8222-222222222222",
  version: "1.0.0",
  release_type: "minor",
  title: "Website",
  public_notes: "Public notes",
  status: "draft",
  created_at: "2026-10-30T12:00:00Z",
});
function show(canEdit = true, status: Release["status"] = "draft") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReleaseDetails
        release={{ ...release, status }}
        canEdit={canEdit}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.releaseFeatures.mockResolvedValue([]);
  state.readiness.mockResolvedValue({ items: [] });
});
describe("release content controls", () => {
  it("consolidates details with one footer save and keeps status out of Changes and QA", async () => {
    show();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Details",
      "Changes",
      "QA",
    ]);
    expect(screen.getByLabelText("Version")).toBeEnabled();
    const save = screen.getByRole("button", { name: "Save", exact: true });
    expect(save.closest("form")).toBeNull();
    expect(save).toHaveAttribute("form", "release-details-form");
    await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(screen.getByLabelText("Release status")).not.toBeVisible();
    expect(await screen.findByText("No linked features yet.")).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: "QA" }));
    expect(
      screen.queryByRole("button", { name: "Save", exact: true }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        "No QA checks for this release. Configure a checklist template for future releases.",
      ),
    ).toBeVisible();
  });
  it("keeps details input through tab changes", async () => {
    show();
    const title = screen.getByLabelText("Title", { exact: true });
    await userEvent.clear(title);
    await userEvent.type(title, "Revised");
    await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(title).toHaveValue("Revised");
  });
  it("saves details and status atomically and preserves failed drafts", async () => {
    state.updateDetails.mockRejectedValue(new Error("Version already exists"));
    show();
    await userEvent.clear(screen.getByLabelText("Title", { exact: true }));
    await userEvent.type(
      screen.getByLabelText("Title", { exact: true }),
      "Revised",
    );
    await userEvent.click(screen.getByLabelText("Release status"));
    await userEvent.click(
      screen.getByRole("option", { name: "QA", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Version already exists",
    );
    expect(screen.getByLabelText("Title", { exact: true })).toHaveValue(
      "Revised",
    );
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.updateDetails).toHaveBeenCalledWith(
      release.id,
      expect.objectContaining({
        application_id: release.application_id,
        title: "Revised",
      }),
      "qa",
    );
  });
  it("allows released notes and status changes but not version edits", async () => {
    show(true, "released");
    expect(screen.getByLabelText("Version")).toBeDisabled();
    expect(screen.getByLabelText("Title", { exact: true })).toBeDisabled();
    const notes = screen.getByLabelText("Public release notes");
    await userEvent.clear(notes);
    await userEvent.type(notes, "Updated notes");
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(state.updateDetails).toHaveBeenCalledWith(
      release.id,
      {
        application_id: release.application_id,
        version: release.version,
        title: release.title,
        public_notes: "Updated notes",
      },
      "released",
    );
  });
  it("prevents editing during a save so refresh cannot erase newer input", async () => {
    let resolve!: () => void;
    state.updateDetails.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(screen.getByLabelText("Public release notes")).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Changes" })).toBeDisabled();
    await act(async () => resolve());
    await waitFor(() =>
      expect(screen.getByLabelText("Public release notes")).toBeEnabled(),
    );
  });
  it("links and unlinks existing features without manual change forms", async () => {
    const feature = { id: "feature", name: "Roadmap", linked: false };
    state.releaseFeatures.mockImplementation(async (_release, candidates) =>
      candidates ? [feature] : feature.linked ? [feature] : [],
    );
    state.linkFeature.mockImplementation(async (_release, _id, linked) => {
      feature.linked = linked;
    });
    show();
    await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Planner feature")).toBeEnabled(),
    );
    await userEvent.click(screen.getByLabelText("Planner feature"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Roadmap", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Link feature", exact: true }),
    );
    const unlink = await screen.findByRole("button", {
      name: "Unlink Roadmap",
    });
    expect(state.linkFeature).toHaveBeenCalledWith(
      release.id,
      feature.id,
      true,
    );
    await userEvent.click(unlink);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Unlink Roadmap" }),
      ).not.toBeInTheDocument(),
    );
    expect(state.linkFeature).toHaveBeenCalledWith(
      release.id,
      feature.id,
      false,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("still shows linked names when a Shiplog editor lacks Planner access", async () => {
    state.releaseFeatures.mockImplementation(async (_release, candidates) => {
      if (candidates) throw new Error("Planner access required");
      return [{ id: "feature", name: "Linked roadmap", linked: true }];
    });
    show();
    await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
    expect(await screen.findByText("Linked roadmap")).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Planner access required",
    );
    expect(
      screen.queryByRole("button", { name: "Unlink Linked roadmap" }),
    ).not.toBeInTheDocument();
  });
  it.each([
    [false, "draft"],
    [true, "released"],
  ] as const)(
    "hides feature editing for viewers and non-drafts (%s, %s)",
    async (canEdit, status) => {
      show(canEdit, status);
      await userEvent.click(screen.getByRole("tab", { name: "Changes" }));
      expect(await screen.findByText("No linked features yet.")).toBeVisible();
      expect(
        screen.queryByLabelText("Planner feature"),
      ).not.toBeInTheDocument();
      expect(state.releaseFeatures).not.toHaveBeenCalledWith(release.id, true);
    },
  );
});
