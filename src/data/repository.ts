import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceShare } from "@jordiorriols/ui";
import { z } from "zod";
import {
  applicationSchema,
  releaseSchema,
  publicCatalogSchema,
  releaseInputSchema,
  plannerFeatureSchema,
  checklistTemplateSchema,
  readinessSchema,
  teamSchema,
  decisionSchema,
  applicationInputSchema,
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
  async function teams(workspace: string) {
    return z
      .array(teamSchema)
      .parse(await rpc("shiplog_list_teams", { workspace }));
  }
  return {
    async sharingAccess(workspace: string): Promise<WorkspaceShare[]> {
      const schema = z.object({
        user_id: z.string().uuid(),
        email: z.string(),
        app: z.literal("shiplog"),
        access_level: z.enum(["viewer", "editor"]),
      });
      const rows: WorkspaceShare[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client
          .rpc("list_workspace_app_shares", { workspace, app_name: "shiplog" })
          .range(offset, offset + 499);
        if (error) throw new Error(error.message, { cause: error });
        const page = z.array(schema).parse(data);
        rows.push(...page);
        if (page.length < 500) return rows;
      }
    },
    checklistTemplate: async (application: string) => {
      const { data, error } = await client
        .from("shiplog_checklist_templates")
        .select("revision,items")
        .eq("application_id", application)
        .maybeSingle();
      if (error) throw new Error(error.message, { cause: error });
      return checklistTemplateSchema.parse(data ?? { revision: 0, items: [] });
    },
    saveChecklistTemplate: async (application: string, input: unknown) => {
      const parsed = checklistTemplateSchema.parse(input);
      await rpc("shiplog_save_checklist_template", {
        application,
        items: parsed.items,
        expected_revision: parsed.revision,
      });
    },
    readiness: async (release: string) =>
      readinessSchema.parse(await rpc("shiplog_get_readiness", { release })),
    completeChecklistItem: (
      release: string,
      item: string,
      completed: boolean,
    ) => rpc("shiplog_complete_checklist_item", { release, item, completed }),
    decisions: async (release: string) =>
      z
        .array(decisionSchema)
        .parse(await rpc("shiplog_list_release_decisions", { release })),
    decideRelease: (release: string, approved: boolean) =>
      rpc("shiplog_decide_release", { release, approved }),
    updatePublicNotes: async (release: string, notes: string) =>
      rpc("shiplog_update_public_notes", {
        release,
        notes: z.string().max(20000).parse(notes),
      }),
    setReleaseStatus: (release: string, status: "draft" | "qa" | "released") =>
      rpc("shiplog_set_release_status", { release, status }),
    teams,
    loadWorkspace: async (workspace: string) => {
      const [applications, releases, workspaceTeams] = await Promise.all([
        list(
          "shiplog_applications",
          applicationSchema,
          "workspace_id",
          workspace,
        ),
        list("shiplog_releases", releaseSchema, "workspace_id", workspace),
        teams(workspace),
      ]);
      return { applications, releases, teams: workspaceTeams };
    },
    saveApplication: async (
      workspace: string,
      input: unknown,
      application?: string,
    ) => {
      const parsed = applicationInputSchema.parse(input);
      return applicationSchema.parse(
        await rpc("shiplog_save_application", {
          workspace,
          application_name: parsed.name,
          application_description: parsed.description,
          team: parsed.team_id,
          ...(application ? { application } : {}),
        }),
      );
    },
    createRelease: async (input: unknown) => {
      const parsed = releaseInputSchema.parse(input);
      return releaseSchema.parse(
        await rpc("shiplog_create_release", { input: parsed }),
      );
    },
    updateDraft: async (release: string, input: unknown) =>
      releaseSchema.parse(
        await rpc("shiplog_update_draft", {
          release,
          input: releaseInputSchema.parse(input),
        }),
      ),
    updateDetails: async (release: string, input: unknown, status: string) =>
      rpc("shiplog_update_details", {
        release,
        input: releaseInputSchema.parse(input),
        status: z.enum(["draft", "qa", "released"]).parse(status),
      }),
    async releaseFeatures(release: string, candidates = false) {
      const rows: z.infer<typeof plannerFeatureSchema>[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client
          .rpc("shiplog_list_features", { release, candidates })
          .range(offset, offset + 499);
        if (error) throw new Error(error.message, { cause: error });
        const page = z.array(plannerFeatureSchema).parse(data);
        rows.push(...page);
        if (page.length < 500) return rows;
      }
    },
    linkFeature: (release: string, feature: string, linked: boolean) =>
      rpc("shiplog_link_feature", { release, feature, linked }),
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
