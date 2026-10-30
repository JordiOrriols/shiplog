import { z } from "zod";

export const applicationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  platform: z.enum(["web", "ios", "android", "backend", "api", "other"]),
  public_enabled: z.boolean(),
  created_at: z.string(),
});
export const releaseSchema = z.object({
  id: z.string().uuid(),
  application_id: z.string().uuid(),
  version: z.string(),
  release_type: z.enum(["major", "minor", "patch", "hotfix"]),
  title: z.string(),
  internal_notes: z.string(),
  public_notes: z.string(),
  status: z.enum([
    "draft",
    "ready_for_qa",
    "qa_in_progress",
    "qa_passed",
    "approved",
    "released",
    "deprecated",
    "rolled_back",
  ]),
  published_at: z.string().nullable(),
  first_published_at: z.string().nullable(),
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
    published_at: true,
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
  releases: z.array(publicReleaseSchema.extend({ published_at: z.string() })),
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
export const manualQaInputSchema = z.object({
  qa_status: z.enum(QA_STATUSES),
  notes: z.string().max(10000),
});
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
export type ReadinessTransition = "ready_for_qa" | "approved" | "reopen_qa";
export function isEditableDraft(release: Release) {
  return release.status === "draft" && release.first_published_at === null;
}
export const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
export const releaseInputSchema = releaseSchema
  .pick({
    application_id: true,
    release_type: true,
  })
  .extend({
    version: z.string().regex(versionPattern),
    title: z.string().trim().min(1).max(160),
    internal_notes: z.string().max(20000),
    public_notes: z.string().max(20000),
  });
