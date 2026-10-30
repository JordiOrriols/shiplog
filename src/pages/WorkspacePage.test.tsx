import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import WorkspacePage from "./WorkspacePage";

const state = vi.hoisted(() => ({
  access: "owner",
  setPublic: vi.fn(),
  refresh: vi.fn(),
  saveApplication: vi.fn(),
  teams: vi.fn(),
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
      setPublic: state.setPublic,
      saveApplication: state.saveApplication,
      teams: state.teams,
    },
  }),
}));
vi.mock("@/data/useWorkspaceData", () => ({
  useWorkspaceData: () => ({
    isPending: false,
    error: null,
    data: { applications: state.applications, releases: [], teams: [] },
    refresh: state.refresh,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.access = "owner";
  state.applications[0]!.public_enabled = false;
  state.teams.mockResolvedValue([]);
});

describe("workspace application controls", () => {
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
    await userEvent.selectOptions(
      screen.getByLabelText("Team (optional)"),
      "team",
    );
    await userEvent.selectOptions(screen.getByLabelText("Team (optional)"), "");
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
  it("keeps a catalog checkbox checked while the server saves, and reports rollback failures", async () => {
    let reject!: (error: Error) => void;
    state.setPublic.mockImplementation(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    const checkbox = screen.getByRole("checkbox", {
      name: "Include in public catalog",
    });
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(state.setPublic).toHaveBeenCalledWith("app", true);
    await act(async () => reject(new Error("Cannot change visibility")));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot change visibility",
    );
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeEnabled();
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
      screen.getByRole("button", { name: "Create", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot save application",
    );
    expect(screen.getByLabelText("Name", { exact: true })).toHaveValue(
      "Website",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create", exact: true }),
      ).toBeEnabled(),
    );
  });
});
