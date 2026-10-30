import { defineCollection, defineContentConfig, z } from '@nuxt/content'
import { useNuxt } from '@nuxt/kit'
import { joinURL } from 'ufo'
import { DOCS_CAPABILITY_IDS } from './shared/docs-capabilities'
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
        kind: z.enum(['landing', 'tutorial', 'how-to', 'concept', 'recipe', 'reference']),
        /**
         * The STABILITY.md tier of what the page documents, or a release
         * marker (shared/planned.ts): `planned`, not built yet, or
         * `changing`, built with an API the release reshapes.
         */
        status: z.enum(['stable', 'experimental', 'deprecated', 'planned', 'changing']).optional(),
        /** The unit of the release plan that builds a planned page's feature: set exactly when `status` is `planned`. */
        plannedBy: z.string().optional(),
        /** The unit of the release plan that brings the code to a changing page's API: set exactly when `status` is `changing`. */
        changedBy: z.string().optional(),
        /**
         * The Feature map's section the page is a row of: a capability, or
         * `ui` and `tools` for what spans them (shared/docs-capabilities.ts).
         * A page without it is not on the map.
         */
        capability: z.enum(DOCS_CAPABILITY_IDS).optional(),
        /** Routes of the pages a reader goes to next: the aside's Related list. */
        related: z.array(z.string()).optional(),
        /** The playground route that shows it running: the header's Try live key. */
        playground: z.string().optional(),
        /** The generated API page of what it documents: the header's API key. */
        api: z.string().optional(),
        /** The repository path of the code it documents: the header's Source key. */
        source: z.string().optional(),
        /**
         * It runs live demo blocks (`::demo-*`), which load the backend
         * client when they scroll into view or when the reader starts them;
         * on every other docs page the client never loads
         * (modules/deferred-backend-client). The page marks its root with
         * it, and the bundle check holds the mark to the blocks it renders.
         */
        demo: z.boolean().optional(),
        /**
         * `false` for a page about this repository's own tooling (the try
         * kit): coding agents' skills never route an app's agent to it
         * (scripts/agent-guidance.mjs).
         */
        agents: z.boolean().optional(),
        /** The release that introduced it. */
        since: z.string().optional(),
        /** When the file last changed in git: set at build (modules/docs-pages.ts), never by hand. */
        modifiedAt: z.string().optional(),
      }),
    }),
  },
})
