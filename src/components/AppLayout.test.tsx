import React from "react";
import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import AppLayout from "./AppLayout";

vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ user: null, authEnabled: false, authError: null }),
}));
vi.mock("@/data/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    workspaces: [],
    workspace: null,
    loading: false,
    error: null,
  }),
}));

it("links to Agents through the shared project registry", async () => {
  render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Switch project" }));
  expect(screen.getByRole("menuitem", { name: "Agents" })).toHaveAttribute(
    "href",
    "https://agents.jordiorriols.cat/",
  );
  expect(screen.getByRole("menuitem", { name: "Shiplog" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
