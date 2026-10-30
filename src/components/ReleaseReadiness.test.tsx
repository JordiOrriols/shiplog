import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { releaseSchema } from "@/lib/contracts";
import ReleaseReadiness from "./ReleaseReadiness";

const state = vi.hoisted(() => ({
  readiness: vi.fn(),
  completeChecklistItem: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "owner" } }),
}));
const release = releaseSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  application_id: "22222222-2222-4222-8222-222222222222",
  version: "1.0.0",
  release_type: "minor",
  title: "Website",
  public_notes: "",
  status: "released",
  published_at: null,
  first_published_at: null,
  first_deployed_at: null,
  created_at: "2026-10-30",
});
function show(canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReleaseReadiness release={release} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.readiness.mockResolvedValue({
    items: [
      {
        id: "check",
        title: "Review passed",
        description: "",
        completed_at: null,
      },
    ],
  });
});
describe("simple QA tab", () => {
  it("only shows checks and progress, without result forms, transitions or overrides", async () => {
    show();
    expect(
      await screen.findByText("0 of 1 checks passed", { exact: true }),
    ).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("keeps checkboxes stable during saves and reports failed saves with rollback", async () => {
    let reject!: (error: Error) => void;
    state.completeChecklistItem.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    show();
    const checkbox = await screen.findByRole("checkbox", {
      name: "Review passed",
      exact: true,
    });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    await act(async () => reject(new Error("Cannot save check")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot save check",
    );
    expect(checkbox).not.toBeChecked();
    expect(state.completeChecklistItem).toHaveBeenCalledWith(
      release.id,
      "check",
      true,
    );
  });
  it("keeps QA check completion read-only for viewers", async () => {
    show(false);
    expect(await screen.findByRole("checkbox")).toBeDisabled();
  });
});
