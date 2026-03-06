import { defineCollection, z } from 'astro:content'

export const collections = {
  docs: defineCollection({
    schema: z
      .object({
        title: z.string(),
        description: z.string().optional(),
        editUrl: z.union([z.string().url(), z.boolean()]).optional().default(true),
        template: z.enum(['doc', 'splash']).default('doc'),
        hero: z.any().optional(),
        lastUpdated: z.union([z.date(), z.boolean()]).optional(),
        prev: z.any().optional(),
        next: z.any().optional(),
        banner: z.object({ content: z.string() }).optional(),
        pagefind: z.boolean().default(true),
        draft: z.boolean().default(false),
        tableOfContents: z.any().optional(),
        head: z.array(z.any()).default([]),
        sidebar: z
          .object({
            order: z.number().optional(),
            label: z.string().optional(),
            hidden: z.boolean().default(false),
            badge: z.any().optional(),
            attrs: z.record(z.any()).default({}),
          })
          .default({}),
      })
      .passthrough(),
  }),
}
