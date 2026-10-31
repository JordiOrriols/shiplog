import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import "@/i18n";
import type { Release } from "@/lib/contracts";
import ReleaseQA from "./ReleaseQA";

const state = vi.hoisted(() => ({
  readiness: vi.fn(),
  completeChecklistItem: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "owner" } }),
}));
const release: Release = {
  id: "release",
  application_id: "app",
  version: "1.0.0",
  release_type: "major",
  title: "Launch",
  public_notes: "",
  status: "draft",
  created_at: "",
};
beforeEach(() => vi.resetAllMocks());
function show(canEdit = true) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReleaseQA release={release} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}
it("stays gray for empty or incomplete checks and becomes green only after every check persists", async () => {
  const items = [
    {
      id: "one",
      title: "Review",
      description: "",
      completed_at: null as string | null,
    },
    {
      id: "two",
      title: "Optional check",
      description: "",
      completed_at: "done" as string | null,
    },
  ];
  state.readiness.mockImplementation(async () => ({ items }));
  state.completeChecklistItem.mockImplementation(
    async (_release, id, checked) => {
      items.find((item) => item.id === id)!.completed_at = checked
        ? "done"
        : null;
    },
  );
  show();
  const icon = screen.getByRole("button", { name: "QA", exact: true });
  await waitFor(() => expect(icon).toHaveAttribute("aria-busy", "false"));
  expect(icon).toHaveAttribute("data-qa-complete", "false");
  await userEvent.click(icon);
  expect(screen.getByRole("dialog", { name: "QA", exact: true })).toBeVisible();
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "Review", exact: true }),
  );
  await waitFor(() => expect(icon).toHaveAttribute("data-qa-complete", "true"));
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Optional check", exact: true }),
  );
  await waitFor(() =>
    expect(icon).toHaveAttribute("data-qa-complete", "false"),
  );
});
it("keeps an empty checklist gray and allows viewers to open a read-only modal", async () => {
  state.readiness.mockResolvedValue({ items: [] });
  show(false);
  const icon = screen.getByRole("button", { name: "QA", exact: true });
  await userEvent.click(icon);
  expect(await screen.findByText(/No QA checks/)).toBeVisible();
  expect(icon).toHaveAttribute("data-qa-complete", "false");
});
it("surfaces a failed completion without turning the button green", async () => {
  state.readiness.mockResolvedValue({
    items: [
      { id: "one", title: "Review", description: "", completed_at: null },
    ],
  });
  state.completeChecklistItem.mockRejectedValue(new Error("Save failed"));
  show();
  const icon = screen.getByRole("button", { name: "QA", exact: true });
  await userEvent.click(icon);
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "Review", exact: true }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(icon).toHaveAttribute("data-qa-complete", "false");
});
