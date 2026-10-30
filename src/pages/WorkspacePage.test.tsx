import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@/i18n";
import WorkspacePage from "./WorkspacePage";

const state = vi.hoisted(() => ({
  access: "owner",
  setPublic: vi.fn(),
  refresh: vi.fn(),
  createApplication: vi.fn(),
  applications: [
    {
      id: "app",
      name: "Website",
      slug: "website",
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
      createApplication: state.createApplication,
    },
  }),
}));
vi.mock("@/data/useWorkspaceData", () => ({
  useWorkspaceData: () => ({
    isPending: false,
    error: null,
    data: { applications: state.applications, releases: [] },
    refresh: state.refresh,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.access = "owner";
  state.applications[0]!.public_enabled = false;
});

describe("workspace application controls", () => {
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
    state.createApplication.mockRejectedValue(
      new Error("Identifier already exists"),
    );
    render(
      <MemoryRouter>
        <WorkspacePage section="applications" />
      </MemoryRouter>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "New application" }),
    );
    await userEvent.type(
      screen.getByLabelText("Name", { exact: true }),
      "Website",
    );
    await userEvent.type(
      screen.getByLabelText("Identifier", { exact: true }),
      "website",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create", exact: true }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Identifier already exists",
    );
    expect(screen.getByLabelText("Identifier")).toHaveValue("website");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create", exact: true }),
      ).toBeEnabled(),
    );
  });
});
