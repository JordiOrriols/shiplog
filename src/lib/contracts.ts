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
  created_at: z.string(),
});
export const publicCatalogSchema = z.object({
  name: z.string(),
  applications: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  releases: z.array(
    z.object({
      id: z.string().uuid(),
      application_id: z.string().uuid(),
      version: z.string(),
      title: z.string(),
      public_notes: z.string(),
      release_type: z.string(),
      published_at: z.string(),
    }),
  ),
});
export type Application = z.infer<typeof applicationSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type PublicCatalog = z.infer<typeof publicCatalogSchema>;
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
