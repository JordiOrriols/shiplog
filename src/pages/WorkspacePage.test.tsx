import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import WorkspacePage from "./WorkspacePage";

const state = vi.hoisted(() => ({
  access: "owner",
  refresh: vi.fn(),
  saveApplication: vi.fn(),
  deleteApplication: vi.fn(),
  teams: vi.fn(),
  releases: [] as { id: string; application_id: string }[],
  applications: [
    {
      id: "app",
      name: "Website",
      team_id: null,
      description: "",
      platform: "web",
      public_enabled: false,
    },
  ],
}));
vi.mock("@/data/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    workspace: { id: "workspace", access_level: state.access },
  }),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({
    repository: {
      saveApplication: state.saveApplication,
      deleteApplication: state.deleteApplication,
      teams: state.teams,
    },
  }),
}));
vi.mock("@/data/useWorkspaceData", () => ({
  useWorkspaceData: () => ({
    isPending: false,
    error: null,
    data: {
      applications: state.applications,
      releases: state.releases,
      teams: [],
    },
    refresh: state.refresh,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.access = "owner";
  state.releases = [];
  state.teams.mockResolvedValue([]);
});

describe("workspace application controls", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("translates known deletion failures and updates a stored error after a language switch", async () => {
    state.deleteApplication.mockRejectedValue(
      new Error("Application not found"),
    );
    await i18n.changeLanguage("ca");
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Suprimeix Website", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Suprimeix", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No s'ha trobat l'aplicació",
    );
    await act(async () => {
      await i18n.changeLanguage("de");
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Anwendung nicht gefunden",
    );
    expect(
      screen.getByRole("heading", { name: "Website", exact: true }),
    ).toBeVisible();
  });

  it("uses icon-only card actions with shared hints and a team badge", async () => {
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    const card = screen.getByRole("article");
    for (const name of [
      "Edit Website",
      "Delete Website",
      "Website checklist template",
    ]) {
      const button = within(card).getByRole("button", { name, exact: true });
      expect(button).toHaveTextContent("");
      expect(button.querySelector("svg")).not.toBeNull();
      await userEvent.hover(button);
      expect(await screen.findByRole("tooltip", { name })).toHaveTextContent(
        name,
      );
      await userEvent.unhover(button);
    }
    expect(screen.getByTestId("application-team")).toHaveClass("rounded-md");
  });
  it("requires confirmation and refreshes after deleting an application", async () => {
    state.deleteApplication.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Website" }),
    );
    expect(state.deleteApplication).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete", exact: true }),
    );
    await waitFor(() =>
      expect(state.deleteApplication).toHaveBeenCalledWith("app"),
    );
    await waitFor(() => expect(state.refresh).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
  it("disables deletion when releases exist and explains why", async () => {
    state.releases = [{ id: "release", application_id: "app" }];
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    const remove = screen.getByRole("button", { name: "Delete Website" });
    expect(remove).toBeDisabled();
    await userEvent.hover(remove);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Applications with releases cannot be deleted.",
    );
  });
  it("surfaces deletion failures and preserves the application", async () => {
    state.deleteApplication.mockRejectedValue(
      new Error("Cannot delete application"),
    );
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Website" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Delete", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot delete application",
    );
    expect(screen.getByRole("heading", { name: "Website" })).toBeVisible();
  });
  it("edits an application without an identifier or platform and allows removing its team", async () => {
    state.saveApplication.mockResolvedValue({});
    state.teams.mockResolvedValue([{ id: "team", name: "Engineering" }]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WorkspacePage section="applications" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Edit Website", exact: true }),
    );
    const name = await screen.findByLabelText("Name", { exact: true });
    expect(name).toHaveValue("Website");
    await userEvent.clear(name);
    await userEvent.type(name, "Renamed");
    await userEvent.click(screen.getByLabelText("Team (optional)"));
    await userEvent.click(
      screen.getByRole("option", { name: "Engineering", exact: true }),
    );
    await userEvent.click(screen.getByLabelText("Team (optional)"));
    await userEvent.click(
      screen.getByRole("option", { name: "No team", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    await waitFor(() =>
      expect(state.saveApplication).toHaveBeenCalledWith(
        "workspace",
        { name: "Renamed", description: "", team_id: null },
        "app",
      ),
    );
  });
  it("includes applications automatically without visibility controls or private labels", () => {
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Not included in public catalog"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/includes every application and release/),
    ).toBeVisible();
  });

  it("keeps all mutation controls out of the viewer's page", () => {
    state.access = "viewer";
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("You have read-only access to this workspace."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "New application" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    for (const name of [
      "Edit Website",
      "Delete Website",
      "Website checklist template",
    ]) {
      expect(
        screen.queryByRole("button", { name, exact: true }),
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole("heading", { name: "Website" })).toBeVisible();
  });

  it("surfaces application creation failures without closing or clearing the form", async () => {
    state.saveApplication.mockRejectedValue(
      new Error("Cannot save application"),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WorkspacePage section="applications" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "New application" }),
    );
    await userEvent.type(
      await screen.findByLabelText("Name", { exact: true }),
      "Website",
    );
    expect(
      screen.queryByLabelText("Identifier", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Platform", { exact: true }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Save", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot save application",
    );
    expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
      "Website",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save", exact: true }),
      ).toBeEnabled(),
    );
  });
});
