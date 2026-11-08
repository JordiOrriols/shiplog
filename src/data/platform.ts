import { z } from "zod";
import {
  applicationSchema,
  applicationInputSchema,
  teamSchema,
  publicCatalogSchema,
  plannerFeatureSchema,
  publicReleaseSchema,
  releaseInputSchema,
  checklistTemplateSchema,
  readinessSchema,
  decisionSchema,
} from "@/lib/contracts";

const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(["owner", "editor", "viewer", "external"]),
});
const applicationsDirectorySchema = z.object({
  applications: z.array(applicationSchema.extend({ in_use: z.boolean() })),
  teams: z.array(teamSchema),
});
const workspacePath = (workspace: string) =>
  `shiplog/workspaces/${z.string().uuid().parse(workspace)}`;
const decisionsSchema = z.object({
  account_id: z.string().uuid(),
  decisions: z.array(
    decisionSchema.pick({
      user_id: true,
      name: true,
      approved: true,
      decided_at: true,
    }),
  ),
});
const auditCursorSchema = z
  .string()
  .regex(
    /^(platform|legacy):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
const auditSchema = z.object({
  events: z
    .array(
      z.object({
        id: z.string().uuid(),
        source: z.enum(["platform", "legacy"]),
        created_at: z.string(),
        event: z.string(),
        actor_id: z.string().uuid().nullable(),
        actor_name: z.string().nullable(),
        details: z.record(z.unknown()),
      }),
    )
    .max(50),
  next_cursor: auditCursorSchema.nullable(),
});

export async function platformRequest(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<unknown> {
  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const body: unknown = await response.json();
    const message = z.object({ message: z.string() }).safeParse(body);
    throw new Error(
      message.success
        ? message.data.message
        : `API request failed (${response.status})`,
    );
  }
  return response.json();
}

export const platformRepository = {
  audit: async (workspace: string, cursor?: string) =>
    auditSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/audit${cursor === undefined ? "" : `?cursor=${encodeURIComponent(auditCursorSchema.parse(cursor))}`}`,
      ),
    ),
  decisions: async (workspace: string, release: string) =>
    decisionsSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/releases/${z.string().uuid().parse(release)}/decisions`,
      ),
    ),
  decideRelease: async (
    workspace: string,
    release: string,
    approved: boolean,
  ) =>
    decisionsSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/releases/${z.string().uuid().parse(release)}/decision`,
        { approved: z.boolean().parse(approved) },
        "PATCH",
      ),
    ),
  checklistTemplate: async (workspace: string, application: string) =>
    checklistTemplateSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/applications/${z.string().uuid().parse(application)}/checklist-template`,
      ),
    ),
  saveChecklistTemplate: async (
    workspace: string,
    application: string,
    input: z.infer<typeof checklistTemplateSchema>,
  ) =>
    checklistTemplateSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/applications/${z.string().uuid().parse(application)}/checklist-template`,
        checklistTemplateSchema.parse(input),
        "PATCH",
      ),
    ),
  readiness: async (workspace: string, release: string) =>
    readinessSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/releases/${z.string().uuid().parse(release)}/readiness`,
      ),
    ),
  completeChecklistItem: async (
    workspace: string,
    release: string,
    item: string,
    completed: boolean,
  ) =>
    readinessSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/releases/${z.string().uuid().parse(release)}/checklist/${z.string().uuid().parse(item)}`,
        { completed: z.boolean().parse(completed) },
        "PATCH",
      ),
    ),
  releaseFeatures: async (workspace: string, release: string) =>
    z
      .array(plannerFeatureSchema)
      .parse(
        await platformRequest(
          `${workspacePath(workspace)}/releases/${z.string().uuid().parse(release)}/features`,
        ),
      ),
  workspaceFeatures: async (workspace: string) =>
    z
      .array(plannerFeatureSchema)
      .parse(await platformRequest(`${workspacePath(workspace)}/features`)),
  saveConfiguration: async (
    workspace: string,
    input: z.infer<typeof releaseInputSchema>,
    status: string,
    featureIds: string[] | null,
    id: string | null,
  ) =>
    publicReleaseSchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/releases${id ? `/${z.string().uuid().parse(id)}` : ""}`,
        {
          ...releaseInputSchema.parse(input),
          status: z.enum(["draft", "qa", "released"]).parse(status),
          feature_ids: z.array(z.string().uuid()).nullable().parse(featureIds),
        },
        id ? "PATCH" : "POST",
      ),
    ),
  applications: async (workspace: string) =>
    applicationsDirectorySchema.parse(
      await platformRequest(`${workspacePath(workspace)}/applications`),
    ),
  saveApplication: async (
    workspace: string,
    input: z.infer<typeof applicationInputSchema>,
    id?: string,
  ) =>
    applicationsDirectorySchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/applications${id ? `/${z.string().uuid().parse(id)}` : ""}`,
        applicationInputSchema.parse(input),
        id ? "PATCH" : "POST",
      ),
    ),
  deleteApplication: async (workspace: string, id: string) =>
    applicationsDirectorySchema.parse(
      await platformRequest(
        `${workspacePath(workspace)}/applications/${z.string().uuid().parse(id)}`,
        undefined,
        "DELETE",
      ),
    ),
  workspaces: async () =>
    z
      .array(workspaceSchema)
      .parse(await platformRequest("apps/shiplog/workspaces")),
  catalog: async (workspace: string) =>
    publicCatalogSchema.parse(
      await platformRequest(
        `shiplog/workspaces/${z.string().uuid().parse(workspace)}/catalog`,
      ),
    ),
};
