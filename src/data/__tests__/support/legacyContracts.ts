import { z } from "zod";
import {
  releaseSchema as currentReleaseSchema,
  publicReleaseSchema as currentPublicReleaseSchema,
} from "@/lib/contracts";

export const releaseOnlyCatalogSchema = z.object({
  name: z.string(),
  applications: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  releases: z.array(
    currentPublicReleaseSchema.omit({ features: true }).extend({
      changes: z.array(
        z.object({
          category: z.string(),
          title: z.string(),
          description: z.string(),
        }),
      ),
    }),
  ),
});

// Historical migration tests exercise the schema before publication was retired.
export const releaseSchema = currentReleaseSchema.extend({
  published_at: z.string().nullable(),
  first_published_at: z.string().nullable(),
  first_deployed_at: z.string().nullable(),
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
      z.object({
        category: z.string(),
        title: z.string(),
        description: z.string(),
      }),
    ),
  });
export const publicCatalogSchema = z.object({
  name: z.string(),
  applications: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  releases: z.array(publicReleaseSchema.extend({ published_at: z.string() })),
});
