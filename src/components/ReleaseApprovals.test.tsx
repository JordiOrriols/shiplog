import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import ReleaseApprovals from "./ReleaseApprovals";

const state = vi.hoisted(() => ({
  decisions: vi.fn(),
  decideRelease: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "viewer" } }),
}));
const decisions = [
  {
    user_id: "owner",
    name: "owner@example.com",
    approved: true,
    decided_at: "2026-10-30",
  },
  {
    user_id: "editor",
    name: "editor@example.com",
    approved: false,
    decided_at: "2026-10-30",
  },
  {
    user_id: "viewer",
    name: "viewer@example.com",
    approved: null,
    decided_at: null,
  },
];
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReleaseApprovals releaseId="release" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.decisions.mockResolvedValue(decisions);
});
describe("individual approvals", () => {
  it("shows each member's approval, disapproval or pending state and permits a viewer's own vote", async () => {
    state.decideRelease.mockResolvedValue(undefined);
    show();
    expect(await screen.findByText("Approved", { exact: true })).toBeVisible();
    expect(screen.getByText("Disapproved", { exact: true })).toBeVisible();
    expect(
      within(screen.getByRole("list")).getByText("Pending", { exact: true }),
    ).toBeVisible();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Your approval" }),
      "approved",
    );
    await waitFor(() =>
      expect(state.decideRelease).toHaveBeenCalledWith("release", true),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Your approval" }),
      ).toBeEnabled(),
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Your approval" }),
      "disapproved",
    );
    expect(state.decideRelease).toHaveBeenLastCalledWith("release", false);
  });
  it("does not show a successful vote on server failure", async () => {
    state.decideRelease.mockRejectedValue(new Error("Cannot save decision"));
    show();
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Your approval" }),
      "approved",
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot save decision",
    );
    expect(screen.getByRole("combobox", { name: "Your approval" })).toHaveValue(
      "",
    );
    expect(
      within(screen.getByRole("list")).getByText("Pending", { exact: true }),
    ).toBeVisible();
  });
});
