import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import { applicationSchema } from "@/lib/contracts";
import ChecklistTemplate from "./ChecklistTemplate";

const state = vi.hoisted(() => ({
  checklistTemplate: vi.fn(),
  saveChecklistTemplate: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "owner" } }),
}));
const application = applicationSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  name: "Website",
  team_id: null,
  description: "",
  platform: "web",
  public_enabled: false,
  created_at: "2026-10-30",
});
const item = {
  title: "Review",
  category: "Development",
  description: "Check changes",
  mandatory: true,
};
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ChecklistTemplate application={application} onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.checklistTemplate.mockResolvedValue({ revision: 1, items: [item] });
});
describe("checklist template editor", () => {
  it("preserves edits on failed saves and requires explicitly reloading conflicting templates", async () => {
    state.saveChecklistTemplate.mockRejectedValue(
      new Error("Checklist template changed. Reload before saving."),
    );
    show();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Edit checklist item Review",
        exact: true,
      }),
    );
    await userEvent.clear(screen.getByLabelText("Title", { exact: true }));
    await userEvent.type(
      screen.getByLabelText("Title", { exact: true }),
      "Revised review",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply item", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save template", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reload before saving",
    );
    expect(state.saveChecklistTemplate).toHaveBeenCalledWith(application.id, {
      revision: 1,
      items: [{ ...item, title: "Revised review" }],
    });
    expect(screen.getByText("Revised review", { exact: true })).toBeVisible();
    state.checklistTemplate.mockResolvedValue({
      revision: 2,
      items: [{ ...item, title: "Server review" }],
    });
    await userEvent.click(
      screen.getByRole("button", {
        name: "Reload template (discard local edits)",
        exact: true,
      }),
    );
    expect(
      await screen.findByText("Server review", { exact: true }),
    ).toBeVisible();
    expect(
      screen.queryByText("Revised review", { exact: true }),
    ).not.toBeInTheDocument();
  });
  it("saves required items with only title and description after the template save", async () => {
    state.checklistTemplate.mockResolvedValue({ revision: 0, items: [] });
    state.saveChecklistTemplate.mockImplementation(async () => {
      state.checklistTemplate.mockResolvedValue({
        revision: 1,
        items: [{ ...item, category: "QA" }],
      });
    });
    show();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Add checklist item",
        exact: true,
      }),
    );
    await userEvent.type(
      screen.getByLabelText("Title", { exact: true }),
      item.title,
    );
    expect(
      screen.queryByLabelText("Category", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Mandatory", exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Description", { exact: true }),
      item.description,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply item", exact: true }),
    );
    expect(state.saveChecklistTemplate).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Save template", exact: true }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Checklist template saved.",
    );
    expect(state.saveChecklistTemplate).toHaveBeenCalledWith(application.id, {
      revision: 0,
      items: [{ ...item, category: "QA" }],
    });
  });
  it("makes legacy optional items required on save without exposing category or requirement metadata", async () => {
    state.checklistTemplate.mockResolvedValue({
      revision: 1,
      items: [{ ...item, mandatory: false }],
    });
    show();
    expect(await screen.findByText(item.title, { exact: true })).toBeVisible();
    expect(
      screen.queryByText(/Development|Optional|Mandatory/),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Save template", exact: true }),
    );
    expect(state.saveChecklistTemplate).toHaveBeenCalledWith(application.id, {
      revision: 1,
      items: [item],
    });
  });
});
