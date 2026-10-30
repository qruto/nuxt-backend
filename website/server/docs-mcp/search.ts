import { searchWeight } from '../../shared/search-ranking'

// The docs MCP's `search`: every section of the docs (Nuxt Content's search
// sections, the ones the site's own search indexes) scored against the
// query's words and ranked as the site's search ranks them, a section written
// by hand above one a lookup generates, and both above the generated API
// reference (shared/search-ranking.ts). Plain functions: ./tools.ts reads the
// sections, test/docs/docs-mcp.test.ts ranks its own.

/** A search section as Nuxt Content splits a page: `id` is the page's path, `#anchor` for a heading. */
export interface SearchSection {
  id: string
  title: string
  titles: string[]
  content: string
  level: number
}

/** One search result: where the section is, the headings above it, and the text around the first match. */
export interface SearchResult {
  title: string
  /** The page's path, which `get-page` takes. */
  path: string
  /** The section's anchor on that page, when it is a heading's section. */
  anchor?: string
  url: string
  /** The headings the section sits under, the page's title first. */
  under: string[]
  snippet: string
}

/** The most results one call returns. */
export const SEARCH_LIMIT = 20

/** The query's words: lowercased, each at least two characters, punctuation that is part of a name (`useAuth()`, `env push`, `@nuxt/ui`) kept. */
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().split(/[\s,;:!?"'`()[\]{}<>]+/).map(word => word.replace(/^[.\-/]+|[.\-/]+$/g, ''))
  return [...new Set(words.filter(word => word.length >= 2))]
}

/** How many times a word occurs in a text. */
function occurrences(text: string, word: string): number {
  let count = 0
  for (let at = text.indexOf(word); at !== -1 && count < 50; at = text.indexOf(word, at + word.length)) count += 1
  return count
}

/** A section's score for the query's words, before its weight: 0 when none of them occurs. */
export function scoreSection(section: SearchSection, terms: readonly string[], phrase: string): number {
  const title = section.title.toLowerCase()
  const under = section.titles.join(' ').toLowerCase()
  const content = section.content.toLowerCase()
  let matched = 0
  let score = 0
  for (const term of terms) {
    const inTitle = title.includes(term)
    const inHeadings = under.includes(term)
    const hits = Math.min(occurrences(content, term), 5)
    if (!inTitle && !inHeadings && !hits) continue
    matched += 1
    score += (inTitle ? 20 : 0) + (inHeadings ? 4 : 0) + hits * 2
  }
  if (!matched) return 0
  // Every word found counts for more than one word found often.
  score *= (matched / terms.length) ** 2
  if (terms.length > 1 && (title.includes(phrase) || content.includes(phrase))) score *= 1.5
  // As Nuxt Content's own full-text search does: a deeper heading counts a little less.
  return score / Math.sqrt(Math.max(section.level, 1))
}

/** The text around the first word found, on one line. */
function snippetOf(content: string, terms: readonly string[], width = 220): string {
  const text = content.replace(/\s+/g, ' ').trim()
  const lower = text.toLowerCase()
  const at = Math.min(...terms.map(term => lower.indexOf(term)).filter(index => index !== -1), text.length)
  const start = Math.max(0, (at === text.length ? 0 : at) - 60)
  const slice = text.slice(start, start + width)
  return `${start > 0 ? '…' : ''}${slice}${start + width < text.length ? '…' : ''}`
}

/** The sections that best match a query, best first, at most `limit` of them, with absolute URLs on `site`. */
export function rankSections(sections: readonly SearchSection[], query: string, limit: number, site: string): SearchResult[] {
  const terms = queryTerms(query)
  if (!terms.length) return []
  const phrase = query.toLowerCase().trim().replace(/\s+/g, ' ')
  return sections
    .map(section => ({ section, score: scoreSection(section, terms, phrase) * searchWeight(section.id) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.section.id.localeCompare(b.section.id))
    .slice(0, Math.min(Math.max(limit, 1), SEARCH_LIMIT))
    .map(({ section }) => {
      const [path, anchor] = section.id.split('#') as [string, string | undefined]
      return {
        title: section.title,
        path,
        ...(anchor ? { anchor } : {}),
        url: `${site.replace(/\/$/, '')}${section.id}`,
        under: section.titles,
        snippet: snippetOf(section.content, terms),
      }
    })
}
