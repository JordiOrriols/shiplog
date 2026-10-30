import { z } from "zod";

export const applicationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  team_id: z.string().uuid().nullable(),
  created_at: z.string(),
});
export const releaseSchema = z.object({
  id: z.string().uuid(),
  application_id: z.string().uuid(),
  version: z.string(),
  release_type: z.enum(["major", "minor", "patch", "hotfix"]),
  title: z.string(),
  public_notes: z.string(),
  status: z.enum(["draft", "qa", "released"]),
  created_at: z.string(),
});
export const CHANGE_CATEGORIES = [
  "feature",
  "improvement",
  "bug_fix",
  "technical",
  "breaking",
  "security",
] as const;
export const changeInputSchema = z.object({
  category: z.enum(CHANGE_CATEGORIES),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10000),
  is_public: z.boolean(),
});
export const changeSchema = changeInputSchema.extend({
  id: z.string().uuid(),
  release_id: z.string().uuid(),
  created_at: z.string(),
});
export const publicReleaseSchema = releaseSchema
  .pick({
    id: true,
    application_id: true,
    version: true,
    title: true,
    release_type: true,
    public_notes: true,
    status: true,
    created_at: true,
  })
  .extend({
    changes: z.array(
      changeInputSchema.pick({
        category: true,
        title: true,
        description: true,
      }),
    ),
  });
export const publicCatalogSchema = z.object({
  name: z.string(),
  applications: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  releases: z.array(publicReleaseSchema),
});
export type Application = z.infer<typeof applicationSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type PublicCatalog = z.infer<typeof publicCatalogSchema>;
export type ReleaseChange = z.infer<typeof changeSchema>;
export type PublicRelease = z.infer<typeof publicReleaseSchema>;
export const checklistDefinitionSchema = z.object({
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(4000),
  mandatory: z.boolean(),
});
export const checklistTemplateSchema = z.object({
  revision: z.number().int().min(0),
  items: z.array(checklistDefinitionSchema).max(100),
});
export const QA_STATUSES = [
  "not_started",
  "running",
  "passed",
  "failed",
  "partially_passed",
  "skipped",
] as const;
export const readinessSchema = z.object({
  release_id: z.string().uuid(),
  template_revision: z.number().int(),
  qa_status: z.enum(QA_STATUSES),
  qa_notes: z.string(),
  qa_recorded_by: z.string().uuid().nullable(),
  qa_recorded_at: z.string().nullable(),
  approved_by: z.string().uuid().nullable(),
  approved_at: z.string().nullable(),
  approval_override_reason: z.string(),
  items: z.array(
    checklistDefinitionSchema.extend({
      id: z.string().uuid(),
      position: z.number().int(),
      completed_by: z.string().uuid().nullable(),
      completed_at: z.string().nullable(),
    }),
  ),
});
export type ChecklistDefinition = z.infer<typeof checklistDefinitionSchema>;
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
export const teamSchema = z.object({ id: z.string().uuid(), name: z.string() });
export const decisionSchema = z.object({
  user_id: z.string().uuid(),
  name: z.string(),
  approved: z.boolean().nullable(),
  decided_at: z.string().nullable(),
});
export const applicationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000),
  team_id: z.string().uuid().nullable(),
});
export function isEditableDraft(release: Release) {
  return release.status === "draft";
}
export const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
export const releaseInputSchema = releaseSchema
  .pick({
    application_id: true,
  })
  .extend({
    version: z.string().regex(versionPattern),
    title: z.string().trim().min(1).max(160),
    public_notes: z.string().max(20000),
  });
