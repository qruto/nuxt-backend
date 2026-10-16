/** The repository the docs link into: the Source keys, "Edit this page", the footer. */
export const REPOSITORY = { url: 'https://github.com/qruto/nuxt-backend', branch: 'main' } as const

/** The frontmatter behind a page header's keys. */
export interface PageKeyFields {
  playground?: string
  api?: string
  source?: string
}

/** One key in a page header: Try live, API or Source. */
export interface PageKey {
  name: 'playground' | 'api' | 'source'
  label: string
  to: string
  external: boolean
}

/** A repository path on GitHub: a file opens as a blob, a folder as a tree. */
export function sourceUrl(path: string): string {
  const kind = /\.\w+$/.test(path) ? 'blob' : 'tree'
  return `${REPOSITORY.url}/${kind}/${REPOSITORY.branch}/${path}`
}

/** The keys a page's frontmatter asks for, in the order the header shows them. */
export function pageKeys(page: PageKeyFields): PageKey[] {
  const keys: PageKey[] = []
  if (page.playground) keys.push({ name: 'playground', label: 'Try live', to: page.playground, external: false })
  if (page.api) keys.push({ name: 'api', label: 'API', to: page.api, external: false })
  if (page.source) keys.push({ name: 'source', label: 'Source', to: sourceUrl(page.source), external: true })
  return keys
}
