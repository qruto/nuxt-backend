/** The public-surface manifest and the rename map: the core skill's files, as the site serves them. */
export declare const MANIFESTS: { readonly surface: string, readonly renames: string }

/** The documents the Markdown 404 points an agent at: the ones this site adds to the module's own. */
export declare const NOT_FOUND_LINKS: readonly string[]

/** llms.txt's sections, in order: the module's overview and full-docs set, a section per tab, then the site's own. */
export declare const LLMS_HEADINGS: readonly string[]

/** llms.txt read back: its version (the line it opens with names it) and its sections, each with its links. */
export declare function parseLlms(text: string): {
  version: string | undefined
  sections: Array<{ title: string, links: Array<{ title: string, href: string, description?: string }> }>
}

/** The section headings of a Markdown document, in order. */
export declare function headings(text: string): string[]

/** Every link target in a Markdown document. */
export declare function markdownLinks(text: string): string[]

/** The title and description a twin opens with, as Nuxt Content parsed them. */
export declare function twinFrontmatter(markdown: string): { title?: string, description?: string }

/** Every page under website/content, with the kind and status its header shows. */
export declare function contentPages(root?: string): Array<{ route: string, kind?: string, status?: string, changedBy?: string }>

/** A page's raw twin path: `/docs/start` → `/raw/docs/start.md`, `/` → `/raw/index.md`. */
export declare function rawTwin(route: string): string

/** The line a page's twin opens with, under its title and description. */
export declare function headerLine(page: { route: string, kind?: string, status?: string }): string

/** The redirects both twins of every moved route must answer: each straight to the target's twin. */
export declare function twinRedirects(): Array<{ from: string, to: string, status: 301 | 302 }>

/** The checks, against a site answering at `origin`. Returns what failed, one line each. */
export declare function checkSurfaces(origin: string, options?: { live?: boolean, root?: string }): Promise<string[]>

/** One call the check makes to a docs MCP tool, and what its answer must hold. */
export interface DocsMcpCall {
  name: string
  arguments: Record<string, unknown>
  holds: (answer: never) => boolean
  says: string
}

/** Each docs tool asked about something the built content holds, and what its answer must say. */
export declare const DOCS_MCP_CALLS: readonly DocsMcpCall[]

/** The docs MCP on its host, against a site: what fails goes to `fail`. */
export declare function checkDocsMcp(context: {
  get: (path: string, init?: RequestInit) => Promise<Response>
  fail: (message: string) => void
  site: string
  live: boolean
}): Promise<void>

/** Whether a page's runtime config turns the docs assistant on; `undefined` when it says neither. */
export declare function assistantFlag(html: string): boolean | undefined

/** The docs assistant, against a site: on as `expected` says (the build's credentials, or always live); off, its endpoint answers 404. */
export declare function checkAssistant(context: {
  get: (path: string, init?: RequestInit) => Promise<Response>
  fail: (message: string) => void
  live: boolean
}, expected?: boolean): Promise<void>
