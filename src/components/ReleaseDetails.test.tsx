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
  workspaceFeatures: vi.fn(),
  saveConfiguration: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "owner" } }),
}));
vi.mock("@/data/WorkspaceProvider", () => ({
  useWorkspace: () => ({ workspace: { id: "workspace" } }),
}));
vi.mock("@/data/useWorkspaceData", () => ({
  useWorkspaceData: () => ({
    refresh: state.refresh,
    data: { applications: [{ id: "app", name: "Website" }] },
  }),
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
function show(canEdit = true, status: Release["status"] | null = "draft") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReleaseDetails
        {...(status ? { release: { ...release, status } } : {})}
        canEdit={canEdit}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.releaseFeatures.mockResolvedValue([]);
  state.workspaceFeatures.mockResolvedValue([
    { id: "feature", name: "Roadmap", linked: false },
  ]);
});
async function addFeature() {
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
}
describe("shared release configuration", () => {
  it("shows details and changes together with one footer save and no QA/tab surface", async () => {
    show();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Version")).toBeEnabled();
    expect(await screen.findByText("No linked features yet.")).toBeVisible();
    const save = screen.getByRole("button", { name: "Save", exact: true });
    expect(save.closest("form")).toBeNull();
    expect(save).toHaveAttribute("form", "release-configuration-form");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("configures feature links and status on creation using the same form", async () => {
    show(true, null);
    expect(screen.getByLabelText("Application")).toHaveTextContent("Website");
    await userEvent.type(screen.getByLabelText("Version"), "1.0.0");
    await userEvent.type(
      screen.getByLabelText("Title", { exact: true }),
      "Initial",
    );
    await addFeature();
    expect(state.saveConfiguration).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText("Release status"));
    await userEvent.click(
      screen.getByRole("option", { name: "QA", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(state.saveConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ application_id: "app", title: "Initial" }),
      "qa",
      ["feature"],
      null,
    );
  });
  it("stages additions/removals without mutating persisted links until Save", async () => {
    show();
    await addFeature();
    const unlink = screen.getByRole("button", { name: "Unlink Roadmap" });
    expect(state.saveConfiguration).not.toHaveBeenCalled();
    await userEvent.click(unlink);
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await waitFor(() => expect(state.saveConfiguration).toHaveBeenCalled());
    expect(state.saveConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      "draft",
      [],
      release.id,
    );
  });
  it("preserves input and staged links after a failed atomic save", async () => {
    state.saveConfiguration.mockRejectedValue(
      new Error("Version already exists"),
    );
    show();
    await userEvent.clear(screen.getByLabelText("Title", { exact: true }));
    await userEvent.type(
      screen.getByLabelText("Title", { exact: true }),
      "Revised",
    );
    await addFeature();
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Version already exists",
    );
    expect(screen.getByLabelText("Title", { exact: true })).toHaveValue(
      "Revised",
    );
    expect(screen.getByText("Roadmap", { exact: true })).toBeVisible();
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it("allows historical notes/status but locks version, title and feature changes", async () => {
    show(true, "released");
    expect(screen.getByLabelText("Version")).toBeDisabled();
    expect(screen.getByLabelText("Title", { exact: true })).toBeDisabled();
    expect(screen.queryByLabelText("Planner feature")).not.toBeInTheDocument();
    const notes = screen.getByLabelText("Public release notes");
    await userEvent.clear(notes);
    await userEvent.type(notes, "Updated notes");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save", exact: true }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(state.saveConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ public_notes: "Updated notes" }),
      "released",
      null,
      release.id,
    );
  });
  it("disables all changes while saving", async () => {
    let resolve!: () => void;
    state.saveConfiguration.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    show();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save", exact: true }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(screen.getByLabelText("Public release notes")).toBeDisabled();
    expect(screen.getByLabelText("Planner feature")).toBeDisabled();
    await act(async () => resolve());
  });
  it("preserves linked names and allows detail saves without Planner access", async () => {
    state.releaseFeatures.mockResolvedValue([
      { id: "feature", name: "Linked roadmap", linked: true },
    ]);
    state.workspaceFeatures.mockRejectedValue(
      new Error("Planner access required"),
    );
    show();
    expect(await screen.findByText("Linked roadmap")).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Planner access required",
    );
    expect(
      screen.queryByRole("button", { name: "Unlink Linked roadmap" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(state.saveConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      "draft",
      null,
      release.id,
    );
  });
  it("does not offer editing to viewers", async () => {
    show(false);
    expect(screen.getByLabelText("Public release notes")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save", exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Planner feature")).not.toBeInTheDocument();
    expect(await screen.findByText("No linked features yet.")).toBeVisible();
  });
});
