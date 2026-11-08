import { z } from "zod";
import { publicCatalogSchema } from "@/lib/contracts";

const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(["owner", "editor", "viewer", "external"]),
});

export async function platformRequest(path: string): Promise<unknown> {
  const response = await fetch(`/api/${path}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
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
