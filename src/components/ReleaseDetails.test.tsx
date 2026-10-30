import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { releaseSchema, type Release } from "@/lib/contracts";
import ReleaseDetails from "./ReleaseDetails";

const state = vi.hoisted(() => ({
  listChanges: vi.fn(),
  readiness: vi.fn(),
  updateDraft: vi.fn(),
  saveChange: vi.fn(),
  updatePublicNotes: vi.fn(),
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
  internal_notes: "SECRET private notes",
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
  state.listChanges.mockResolvedValue([]);
  state.readiness.mockResolvedValue({ items: [] });
});
describe("release content controls", () => {
  it("prevents editing notes during a save so server refresh cannot erase newer input", async () => {
    let resolve!: () => void;
    state.updatePublicNotes.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    show(true, "released");
    const notes = screen.getByLabelText("Public release notes", {
      exact: true,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(notes).toBeDisabled();
    await act(async () => resolve());
    await waitFor(() => expect(notes).toBeEnabled());
  });
  it("allows released notes to be edited directly without internal notes or type selectors", async () => {
    state.updatePublicNotes.mockRejectedValue(new Error("Cannot save notes"));
    show(true, "released");
    expect(
      screen.queryByLabelText("Internal notes", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Release type", { exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.clear(
      screen.getByLabelText("Public release notes", { exact: true }),
    );
    await userEvent.type(
      screen.getByLabelText("Public release notes", { exact: true }),
      "Revised public story",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot save notes",
    );
    expect(
      screen.getByLabelText("Public release notes", { exact: true }),
    ).toHaveValue("Revised public story");
    expect(state.updatePublicNotes).toHaveBeenCalledWith(
      release.id,
      "Revised public story",
    );
  });
  it("preserves form values and surfaces failed draft saves", async () => {
    state.updateDraft.mockRejectedValue(new Error("Version already exists"));
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit draft", exact: true }),
    );
    await userEvent.clear(screen.getByLabelText("Title", { exact: true }));
    await userEvent.type(
      screen.getByLabelText("Title", { exact: true }),
      "Revised",
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
    expect(state.updateDraft).toHaveBeenCalledWith(
      release.id,
      expect.objectContaining({
        application_id: release.application_id,
        title: "Revised",
      }),
    );
  });
  it("defaults changes to private and refreshes the saved list", async () => {
    state.saveChange.mockResolvedValue({});
    show();
    await userEvent.click(
      screen.getByRole("button", { name: "Add change", exact: true }),
    );
    expect(screen.getByLabelText("Release status")).toBeDisabled();
    const save = screen.getByRole("button", { name: "Save", exact: true });
    expect(save).toHaveAttribute("form", "release-change-form");
    expect(save.closest("form")).toBeNull();
    expect(
      screen.getByRole("checkbox", { name: "Public change", exact: true }),
    ).not.toBeChecked();
    await userEvent.type(
      screen.getByLabelText("Title", { exact: true }),
      "Private maintenance",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(state.saveChange).toHaveBeenCalledWith(
      release.id,
      {
        category: "feature",
        title: "Private maintenance",
        description: "",
        is_public: false,
      },
      undefined,
    );
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Title", { exact: true }),
      ).not.toBeInTheDocument(),
    );
  });
  it("keeps status only on the first tab and uses a footer save associated with its form", async () => {
    show();
    const save = screen.getByRole("button", { name: "Save", exact: true });
    expect(save.closest("form")).toBeNull();
    expect(save).toHaveAttribute("form", "release-notes-form");
    expect(screen.getByLabelText("Release status")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "QA", exact: true }),
    );
    expect(screen.queryByLabelText("Release status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save", exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit draft", exact: true }),
    );
    expect(screen.queryByLabelText("Release status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save", exact: true }),
    ).toHaveAttribute("form", "release-edit-form");
    for (const name of ["Approvals", "Deployments", "Public preview"])
      expect(
        screen.queryByRole("button", { name, exact: true }),
      ).not.toBeInTheDocument();
  });
  it.each([
    [false, "draft"],
    [true, "released"],
  ] as const)(
    "hides draft mutations for a viewer or non-draft release (%s, %s)",
    async (canEdit, status) => {
      show(canEdit, status);
      expect(await screen.findByText("No changes yet.")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: "Edit draft", exact: true }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Add change", exact: true }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Public preview", exact: true }),
      ).not.toBeInTheDocument();
    },
  );
});
