import { queryCollectionSearchSections } from '@nuxt/content/server'
import type { H3Event } from 'h3'
import type { SearchSection } from './search'

// The docs' search sections, as Nuxt Content splits the pages for the
// site's own search: a module of its own, so the docs tests run the
// `search` tool with this one stood in for.

/**
 * The content query, seen as the one collection this reads. Typed here, not
 * by the generated collection types: the docs tests reach this module, and
 * type-check it without the website's `.nuxt` (server/utils/content-pages.ts
 * does the same).
 */
const searchSectionsOf = queryCollectionSearchSections as unknown as (event: H3Event, collection: 'docs') => Promise<SearchSection[]>

/** Every search section of the docs, read once per server: the content does not change under a running build. */
let sections: Promise<SearchSection[]> | undefined

/** The docs' search sections; a failed read is tried again on the next call. */
export function docsSections(event: H3Event): Promise<SearchSection[]> {
  const read = () => searchSectionsOf(event, 'docs')
  if (import.meta.dev) return read()
  sections ??= read().catch((error: unknown) => {
    sections = undefined
    throw error
  })
  return sections
}
