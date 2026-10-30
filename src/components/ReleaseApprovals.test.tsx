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
    name: "Ada Lovelace",
    approved: true,
    decided_at: "2026-10-30",
  },
  {
    user_id: "editor",
    name: "Grace Hopper",
    approved: false,
    decided_at: "2026-10-30",
  },
  {
    user_id: "viewer",
    name: "Viewer",
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
    const approve = screen.getByRole("button", {
      name: "Approve",
      exact: true,
    });
    const disapprove = screen.getByRole("button", {
      name: "Disapprove",
      exact: true,
    });
    expect(approve).toHaveAttribute("aria-pressed", "false");
    expect(disapprove).toHaveAttribute("aria-pressed", "false");
    expect(approve).toHaveClass("text-muted-foreground");
    expect(screen.getByText("Ada Lovelace")).toBeVisible();
    expect(screen.getByRole("list")).toHaveClass("justify-end");
    await userEvent.click(approve);
    await waitFor(() =>
      expect(state.decideRelease).toHaveBeenCalledWith("release", true),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Approve", exact: true }),
      ).toBeEnabled(),
    );
    await userEvent.click(disapprove);
    expect(state.decideRelease).toHaveBeenLastCalledWith("release", false);
  });
  it("does not show a successful vote on server failure", async () => {
    state.decideRelease.mockRejectedValue(new Error("Cannot save decision"));
    show();
    await userEvent.click(
      await screen.findByRole("button", { name: "Approve", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot save decision",
    );
    expect(
      screen.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(screen.getByRole("list")).getByText("Pending", { exact: true }),
    ).toBeVisible();
  });
  it.each([true, false])(
    "colors only the selected thumb (%s)",
    async (approved) => {
      state.decisions.mockResolvedValue(
        decisions.map((member) =>
          member.user_id === "viewer" ? { ...member, approved } : member,
        ),
      );
      show();
      const approve = await screen.findByRole("button", {
        name: "Approve",
        exact: true,
      });
      const disapprove = screen.getByRole("button", {
        name: "Disapprove",
        exact: true,
      });
      expect(approve).toHaveAttribute("aria-pressed", String(approved));
      expect(disapprove).toHaveAttribute("aria-pressed", String(!approved));
      expect(approved ? approve : disapprove).toHaveClass(
        approved ? "text-green-700" : "text-destructive",
      );
      expect(approved ? disapprove : approve).toHaveClass(
        "text-muted-foreground",
      );
    },
  );
});
