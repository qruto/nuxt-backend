import { defineCollection, defineContentConfig, z } from '@nuxt/content'
import { useNuxt } from '@nuxt/kit'
import { joinURL } from 'ufo'
import { DOCS_SOURCES } from './shared/docs-routes'

// Docus defines `docs` in its own layer; a collection of the same name here
// replaces that definition whole (Nuxt Content merges collections by name,
// app last), so this restates Docus's source and its `links` field, then adds
// the frontmatter this site's pages carry. The sources come from the route
// table, which also tells the tests where each file is served.
const cwd = joinURL(useNuxt().options.rootDir, 'content')

export default defineContentConfig({
  collections: {
    docs: defineCollection({
      type: 'page',
      source: DOCS_SOURCES.map(source => ({ cwd, ...source })),
      schema: z.object({
        // Docus: buttons in the page header.
        links: z.array(z.object({
          label: z.string(),
          icon: z.string(),
          to: z.string(),
          target: z.string().optional(),
        })).optional(),
        /** What the page is for: the docs keep one kind per page. */
        kind: z.enum(['landing', 'tutorial', 'how-to', 'concept', 'recipe', 'reference']).optional(),
        /** The STABILITY.md tier of what the page documents. */
        status: z.enum(['stable', 'experimental', 'deprecated']).optional(),
        /** The capability the page belongs to (`auth`, `billing`, `email`, …). */
        capability: z.string().optional(),
        /** Routes of the pages a reader goes to next. */
        related: z.array(z.string()).optional(),
        /** The playground route that shows it running. */
        demo: z.string().optional(),
        /** The release that introduced it. */
        since: z.string().optional(),
      }),
    }),
  },
})
