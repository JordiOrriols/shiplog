import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  applicationSchema,
  releaseSchema,
  publicCatalogSchema,
  releaseInputSchema,
} from "@/lib/contracts";

export function createShiplogRepository(client: SupabaseClient) {
  async function rpc(name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message, { cause: error });
    return data as unknown;
  }
  async function list<T>(
    table: string,
    schema: z.ZodType<T>,
    column: string,
    workspace: string,
  ) {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from(table)
        .select("*")
        .eq(column, workspace)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(error.message, { cause: error });
      const page = z.array(schema).parse(data);
      rows.push(...page);
      if (page.length < 500) return rows;
    }
  }
  return {
    loadWorkspace: async (workspace: string) => {
      const [applications, releases] = await Promise.all([
        list(
          "shiplog_applications",
          applicationSchema,
          "workspace_id",
          workspace,
        ),
        list("shiplog_releases", releaseSchema, "workspace_id", workspace),
      ]);
      return { applications, releases };
    },
    createApplication: async (
      workspace: string,
      name: string,
      slug: string,
      platform: string,
      description: string,
    ) =>
      applicationSchema.parse(
        await rpc("shiplog_create_application", {
          workspace,
          application_name: name,
          application_slug: slug,
          application_platform: platform,
          application_description: description,
        }),
      ),
    setPublic: (application: string, enabled: boolean) =>
      rpc("shiplog_set_application_public", { application, enabled }),
    createRelease: async (input: unknown) => {
      const parsed = releaseInputSchema.parse(input);
      return releaseSchema.parse(
        await rpc("shiplog_create_release", { input: parsed }),
      );
    },
    publishRelease: (release: string, published: boolean) =>
      rpc("shiplog_publish_release", { release, published }),
    portal: async (workspace: string, enabled?: boolean) =>
      z
        .string()
        .uuid()
        .nullable()
        .parse(
          await rpc("shiplog_portal", {
            workspace,
            ...(enabled === undefined ? {} : { enabled }),
          }),
        ),
    publicCatalog: async (token: string) =>
      publicCatalogSchema.parse(await rpc("shiplog_public_catalog", { token })),
  };
}
