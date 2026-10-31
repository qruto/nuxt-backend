import { GENERATED_SECTIONS, REFERENCE_ROUTE } from './docs-routes'

// How the site's full-text search ranks a section by where it comes from
// (components/app/AppSearch.vue): a section written by hand keeps its rank,
// a section the lookups generate from the code is scaled down, and the
// generated API reference further. SQLite's bm25 rank is negative and better
// the lower, so a weight below 1 moves a rank toward zero, down the list.

/** The weight of the generated API reference's sections. */
export const API_WEIGHT = 0.25

/** The weight of a section a lookup generates (GENERATED_SECTIONS). */
export const LOOKUP_WEIGHT = 0.5

const generated = new Set(GENERATED_SECTIONS)

/** How much of its rank a search section keeps, by its id (`/docs/…` or `/docs/…#anchor`). */
export function searchWeight(id: string): number {
  const route = id.split('#')[0]!
  if (route === REFERENCE_ROUTE || route.startsWith(`${REFERENCE_ROUTE}/`)) return API_WEIGHT
  return generated.has(id) ? LOOKUP_WEIGHT : 1
}

/** Results ranked again by `searchWeight`, best first, cut to `limit`. */
export function rankByWeight<T extends { id: string, rank: number }>(results: readonly T[], limit: number): T[] {
  return results
    .map(result => ({ result, rank: result.rank * searchWeight(result.id) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ result }) => result)
}
