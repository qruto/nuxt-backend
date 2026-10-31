import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import type { AgentPage } from '../../shared/agent-surfaces'

// The pages the content holds, as sitemap.md labels and orders them
// (server/plugins/agent-surfaces.ts): a module of its own, so the docs
// tests run that plugin with this one stood in for.

/** A page row as sitemap.md reads it. */
interface PageRow { path: string, stem: string, title: string, kind?: string, status?: string }

/**
 * The content query, seen as the two page collections this reads. Typed
 * here, not by the generated collection types: the docs tests import the
 * plugin that calls it, and type-check both without the website's `.nuxt`.
 */
const pagesOf = queryCollection as unknown as (event: H3Event, collection: 'docs' | 'landing') => {
  select: (...fields: Array<keyof PageRow>) => { all: () => Promise<PageRow[]> }
}

/** Every page the content holds, with what sitemap.md labels and orders it by. */
export async function contentPages(event: H3Event): Promise<AgentPage[]> {
  const [docs, landing] = await Promise.all([
    pagesOf(event, 'docs').select('path', 'stem', 'title', 'kind', 'status').all(),
    pagesOf(event, 'landing').select('path', 'stem', 'title').all(),
  ])
  return [
    ...docs.map(page => ({ route: page.path, stem: page.stem, title: page.title, kind: page.kind, status: page.status })),
    ...landing.map(page => ({ route: page.path, stem: page.stem, title: page.title, kind: 'landing' })),
  ]
}
