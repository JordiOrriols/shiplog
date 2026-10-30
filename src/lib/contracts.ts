import { z } from "zod";

export const applicationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  team_id: z.string().uuid().nullable(),
  public_enabled: z.boolean(),
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
  published_at: z.string().nullable(),
  first_published_at: z.string().nullable(),
  first_deployed_at: z.string().nullable(),
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
export const DEPLOYMENT_OUTCOMES = [
  "succeeded",
  "failed",
  "cancelled",
  "rollback",
] as const;
export const environmentSchema = z.object({
  id: z.string().uuid(),
  application_id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(["staging", "production", "custom"]),
});
const deploymentFields = z.object({
  environment_id: z.string().uuid(),
  release_id: z.string().uuid(),
  outcome: z.enum(DEPLOYMENT_OUTCOMES),
  rollback_target_id: z.string().uuid().nullable(),
  started_at: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }),
  source: z.string().trim().min(1).max(120),
  build_reference: z.string().max(300),
  pipeline_url: z
    .string()
    .max(2000)
    .refine(
      (value) => !value || /^https?:\/\/\S+$/.test(value),
      "Use an HTTP or HTTPS URL",
    ),
  notes: z.string().max(10000),
  error_details: z.string().max(10000),
});
export const deploymentInputSchema = deploymentFields.superRefine(
  (value, ctx) => {
    if (Date.parse(value.completed_at) < Date.parse(value.started_at))
      ctx.addIssue({
        code: "custom",
        path: ["completed_at"],
        message: "Completion must follow the start",
      });
    if (
      value.outcome === "rollback" &&
      (!value.rollback_target_id ||
        value.rollback_target_id === value.release_id ||
        !value.notes.trim())
    )
      ctx.addIssue({
        code: "custom",
        path: ["rollback_target_id"],
        message: "Choose a different rollback target and record a reason",
      });
    if (value.outcome !== "rollback" && value.rollback_target_id)
      ctx.addIssue({
        code: "custom",
        path: ["rollback_target_id"],
        message: "Only rollback outcomes can have a target",
      });
  },
);
export const READINESS_WARNINGS = [
  "release_not_approved",
  "manual_qa_not_passed",
  "mandatory_items_incomplete",
] as const;
export const deploymentSchema = deploymentFields.extend({
  id: z.string().uuid(),
  application_id: z.string().uuid(),
  sequence: z.number().int(),
  recorded_by: z.string().uuid().nullable(),
  created_at: z.string(),
  readiness_warnings: z.array(z.enum(READINESS_WARNINGS)),
});
export const environmentVersionSchema = z.object({
  environment_id: z.string().uuid(),
  application_id: z.string().uuid(),
  deployment_id: z.string().uuid(),
  release_id: z.string().uuid(),
  completed_at: z.string(),
});
export type DeploymentInput = z.infer<typeof deploymentInputSchema>;
export type Deployment = z.infer<typeof deploymentSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type EnvironmentVersion = z.infer<typeof environmentVersionSchema>;
export function isEditableDraft(release: Release) {
  return (
    release.status === "draft" &&
    release.first_published_at === null &&
    release.first_deployed_at === null
  );
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
