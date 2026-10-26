import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        // Set by scripts/fetch-docs.mjs on pages copied from a project repo.
        source: z
          .object({
            project: z.string(),
            repo: z.string(),
            ref: z.string(),
            path: z.string(),
            url: z.url(),
          })
          .optional(),
      }),
    }),
  }),
};
