import type { H3Event } from 'h3'
import { defineNitroPlugin } from 'nitropack/runtime'
import { appendPageKeys } from '../../shared/agent-markdown'

/** The hook nuxt-agent-discovery calls with each page; it declares it for the server build only. */
type DocumentHook = (event: H3Event, page: Record<string, unknown> & { body?: unknown }) => void

/** Nitro's hooks, seen as the one this plugin adds to. */
type DocumentHooks = { hook: (name: 'agent-discovery:document', handler: DocumentHook) => void }

// The page header's keys (Try live, API, Source) close each page's Markdown
// for agents: /raw/<page>.md and /llms-full.txt. nuxt-agent-discovery hands
// every page to `agent-discovery:document`, with a copy of its body, just
// before it writes the Markdown, so the keys go in there. They stay out of
// the stored page: the site's search indexes every word of its body, and a
// reader searching "source" would land on text that is not on the page.
export default defineNitroPlugin((nitroApp) => {
  ;(nitroApp.hooks as unknown as DocumentHooks).hook('agent-discovery:document', (_event, page) => {
    appendPageKeys(page.body, page)
  })
})
