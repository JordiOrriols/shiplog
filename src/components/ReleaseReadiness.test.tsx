import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { releaseSchema, type Readiness } from "@/lib/contracts";
import ReleaseReadiness from "./ReleaseReadiness";

const state = vi.hoisted(() => ({
  access: "owner",
  readiness: vi.fn(),
  completeChecklistItem: vi.fn(),
  recordManualQa: vi.fn(),
  transitionReadiness: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "owner" } }),
}));
vi.mock("@/data/WorkspaceProvider", () => ({
  useWorkspace: () => ({ workspace: { access_level: state.access } }),
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
  internal_notes: "",
  public_notes: "",
  status: "draft",
  published_at: null,
  first_published_at: null,
  created_at: "2026-10-30T12:00:00Z",
});
const data: Readiness = {
  release_id: release.id,
  template_revision: 1,
  qa_status: "not_started",
  qa_notes: "",
  qa_recorded_by: null,
  qa_recorded_at: null,
  approved_by: null,
  approved_at: null,
  approval_override_reason: "",
  items: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      position: 1,
      title: "Review completed",
      category: "Development",
      description: "",
      mandatory: true,
      completed_by: null,
      completed_at: null,
    },
  ],
};
function show(status: typeof release.status = "draft", canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReleaseReadiness release={{ ...release, status }} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.access = "owner";
  state.readiness.mockResolvedValue(data);
});
describe("manual readiness controls", () => {
  it("keeps checkboxes stable during saves and rolls back visibly on failure", async () => {
    let reject!: (error: Error) => void;
    state.completeChecklistItem.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    show();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Review completed",
      exact: true,
    });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(state.completeChecklistItem).toHaveBeenCalledWith(
      release.id,
      data.items[0]!.id,
      true,
    );
    await act(async () => reject(new Error("Cannot update checklist")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot update checklist",
    );
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeEnabled();
  });
  it("retains failed QA input and reports errors without claiming success", async () => {
    state.recordManualQa.mockRejectedValue(new Error("QA update failed"));
    show("qa_in_progress");
    await userEvent.selectOptions(
      await screen.findByLabelText("QA result", { exact: true }),
      "failed",
    );
    await userEvent.type(
      screen.getByLabelText("QA observations", { exact: true }),
      "Calendar fails",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record QA result", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "QA update failed",
    );
    expect(screen.getByLabelText("QA observations")).toHaveValue(
      "Calendar fails",
    );
    expect(state.recordManualQa).toHaveBeenCalledWith(release.id, {
      qa_status: "failed",
      notes: "Calendar fails",
    });
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it("only sends owner overrides after an explicit decision and preserves rejected reasons", async () => {
    state.transitionReadiness.mockRejectedValue(new Error("Decision rejected"));
    show("qa_passed");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Approve release",
        exact: true,
      }),
    );
    expect(state.transitionReadiness).not.toHaveBeenCalled();
    await userEvent.type(
      screen.getByLabelText(
        "Owner override reason (only needed for unmet requirements)",
        { exact: true },
      ),
      "Urgent release",
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Confirm readiness decision",
        exact: true,
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Decision rejected",
    );
    expect(state.transitionReadiness).toHaveBeenCalledWith(
      release.id,
      "approved",
      "Urgent release",
    );
    expect(
      screen.getByLabelText(
        "Owner override reason (only needed for unmet requirements)",
      ),
    ).toHaveValue("Urgent release");
  });
  it("hides mutation controls for viewers and approval for editors", async () => {
    state.access = "viewer";
    const view = show("qa_passed", false);
    expect(await screen.findByRole("checkbox")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Approve release", exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("QA result")).not.toBeInTheDocument();
    view.unmount();
    state.access = "editor";
    show("qa_passed");
    expect(await screen.findByRole("checkbox")).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Approve release", exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("QA result")).toBeVisible();
  });
  it("locks approved controls and allows explicit reopening with a reason", async () => {
    state.access = "editor";
    state.transitionReadiness.mockResolvedValue(undefined);
    show("approved");
    expect(await screen.findByRole("checkbox")).toBeDisabled();
    expect(screen.queryByLabelText("QA result")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Reopen QA", exact: true }),
    );
    await userEvent.type(
      screen.getByLabelText("Reason for reopening QA"),
      "Regression found",
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Confirm readiness decision",
        exact: true,
      }),
    );
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    expect(state.transitionReadiness).toHaveBeenCalledWith(
      release.id,
      "reopen_qa",
      "Regression found",
    );
  });
});
