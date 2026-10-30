import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/i18n";
import ApplicationDeployments from "./ApplicationDeployments";
import { releaseSchema } from "@/lib/contracts";

const state = vi.hoisted(() => ({
  deployments: vi.fn(),
  recordDeployment: vi.fn(),
  readiness: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/data/DataProvider", () => ({
  useData: () => ({ repository: state, user: { id: "owner" } }),
}));
const app = "11111111-1111-4111-8111-111111111111";
const release = releaseSchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  application_id: app,
  version: "1.0.0",
  title: "Website",
  release_type: "minor",
  status: "draft",
  created_at: "2026-01-01",
  internal_notes: "",
  public_notes: "",
  published_at: null,
  first_published_at: null,
  first_deployed_at: null,
});
vi.mock("@/data/useWorkspaceData", () => ({
  useWorkspaceData: () => ({
    data: { releases: [release] },
    refresh: state.refresh,
  }),
}));
const env = {
  id: "33333333-3333-4333-8333-333333333333",
  application_id: app,
  name: "Production",
  kind: "production",
};
function show(canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ApplicationDeployments
        applicationId={app}
        canEdit={canEdit}
        initialReleaseId={release.id}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  state.deployments.mockResolvedValue({
    environments: [env],
    deployments: [],
    versions: [],
  });
  state.readiness.mockResolvedValue({
    qa_status: "failed",
    items: [{ mandatory: true, completed_at: null }],
  });
});
describe("manual deployment controls", () => {
  it("shows warnings without blocking an editor from saving and preserves failed form input", async () => {
    state.recordDeployment.mockRejectedValue(
      new Error("Cannot record deployment"),
    );
    show();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Record deployment outcome",
        exact: true,
      }),
    );
    expect(
      await screen.findByText("Manual QA has not passed.", { exact: true }),
    ).toBeVisible();
    expect(
      screen.getByText("Release is not approved.", { exact: true }),
    ).toBeVisible();
    expect(
      screen.getByText("Mandatory checklist items are incomplete.", {
        exact: true,
      }),
    ).toBeVisible();
    await userEvent.type(
      screen.getByLabelText("Deployment notes", { exact: true }),
      "Historical outcome",
    );
    const save = screen.getByRole("button", {
      name: "Save deployment record",
      exact: true,
    });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot record deployment",
    );
    expect(screen.getByLabelText("Deployment notes")).toHaveValue(
      "Historical outcome",
    );
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.recordDeployment).toHaveBeenCalledWith(
      expect.objectContaining({
        environment_id: env.id,
        release_id: release.id,
        outcome: "succeeded",
        rollback_target_id: null,
        source: "Manual",
        notes: "Historical outcome",
      }),
    );
  });
  it("refreshes persisted records only after a successful save", async () => {
    state.recordDeployment.mockResolvedValue({});
    show();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Record deployment outcome",
        exact: true,
      }),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Save deployment record",
        exact: true,
      }),
    );
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Save deployment record",
          exact: true,
        }),
      ).not.toBeInTheDocument(),
    );
  });
  it("shows reported current versions and private history but no write controls for viewers", async () => {
    state.deployments.mockResolvedValue({
      environments: [env],
      versions: [
        {
          environment_id: env.id,
          release_id: release.id,
          completed_at: "2026-01-02T12:00:00Z",
        },
      ],
      deployments: [
        {
          id: "deployment",
          environment_id: env.id,
          release_id: release.id,
          outcome: "failed",
          rollback_target_id: null,
          completed_at: "2026-01-03T12:00:00Z",
          started_at: "2026-01-03T11:00:00Z",
          created_at: "2026-01-03T13:00:00Z",
          recorded_by: "owner",
          source: "Manual",
          build_reference: "sha-123",
          pipeline_url: "https://ci.example.com/123",
          notes: "Internal record",
          error_details: "Upload failed",
          readiness_warnings: [],
        },
      ],
    });
    show(false);
    expect(await screen.findAllByText("1.0.0", { exact: true })).toHaveLength(
      2,
    );
    expect(
      screen.queryByRole("button", {
        name: "Record deployment outcome",
        exact: true,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Upload failed", { exact: true })).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Open pipeline or report",
        exact: true,
      }),
    ).toHaveAttribute("href", "https://ci.example.com/123");
  });
  it("surfaces load errors with retry rather than showing an empty deployment history", async () => {
    state.deployments.mockRejectedValue(new Error("History unavailable"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "History unavailable",
    );
    expect(
      screen.queryByText("No deployment outcomes recorded."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
  });
});
