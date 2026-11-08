import { z } from "zod";
import {
  applicationSchema,
  applicationInputSchema,
  teamSchema,
  publicCatalogSchema,
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
