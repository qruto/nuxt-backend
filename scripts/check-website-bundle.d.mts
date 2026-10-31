/** Code a page must not load before it is asked for, by a string its chunk always carries. */
export declare const DEFERRED: ReadonlyArray<{ what: string, marker: string }>

/** The most initial JavaScript, gzipped, any page may ship. */
export declare const CEILING: number

/** The most JavaScript, gzipped, a demo page may load once its block starts. */
export declare const DEMO_CEILING: number

/** The chunks a script imports statically: `import "./x.js"` and `from "./x.js"`, never `import("./x.js")`. */
export declare function staticImports(code: string): string[]

/** The module scripts a page names: its entry and its modulepreload links, never a prefetch. */
export declare function pageScripts(html: string): string[]

/** The global the deferred client loader is reached by: a call to it means the client loads. */
export declare const CLIENT_CALL: string

/** The attribute a <DeferredBackend> block renders, in the prerendered HTML. */
export declare const LIVE_BLOCK: string

/** The attribute a docs page with `demo: true` renders on its root. */
export declare const DEMO_PAGE: string

/** Whether one of a page's tags carries `attribute`: a page that only mentions it in its text does not. */
export declare function hasAttribute(html: string, attribute: string): boolean

/** The chunks a script imports on demand: `import("./x.js")`, in any quotes the minifier picks. */
export declare function dynamicImports(code: string): string[]

/** The page's entry scripts. */
export declare function pageEntries(html: string): string[]

/** The scripts a page prefetches while idle. */
export declare function pagePrefetches(html: string): string[]

/** A redirect Nitro prerendered for a route rule: a refresh and no script, so no app to load. */
export declare function isRedirect(html: string): boolean

/** The built chunks of one build, each read, gzipped and followed once. */
export interface ChunkStore {
  read: (chunk: string) => string
  gzipped: (chunk: string) => number
  exists: (chunk: string) => boolean
  /** The chunks given and everything they import statically. */
  closure: (chunks: string[]) => Set<string>
  /** The deferred code a chunk holds itself. */
  carries: (chunk: string) => Array<{ what: string, marker: string }>
  /** Every chunk of the build that holds this piece of deferred code (a `what` of DEFERRED). */
  holding: (what: string) => string[]
}

/** The built chunks in `dir`. */
export declare function chunkStore(dir: string): ChunkStore

/** One failure: the page and what it loads that it must not. */
export interface PageFailure {
  route: string
  message: string
}

/**
 * What a prerendered page loads that it must not, and when; `live` says it
 * holds a <DeferredBackend> block, `demo` that it says `demo: true`, and
 * `demoBytes` what it loads, gzipped, once its block starts.
 */
export declare function checkPage(route: string, html: string, store: ChunkStore): { route: string, live: boolean, demo: boolean, bytes: number, demoBytes: number, failures: PageFailure[] }

/** One line per distinct failure, with the pages it happens on. */
export declare function formatFailures(failures: PageFailure[]): string[]

/** One page's result, as checkPage returns it. */
export type PageResult = ReturnType<typeof checkPage>

/**
 * Every prerendered page under `dir` (a built site's public folder) that
 * defers the backend client, checked: the home page and the docs, with the
 * heaviest page up front, the heaviest demo, and every failure, the
 * ceilings' included.
 */
export declare function checkSite(dir: string): {
  results: PageResult[]
  heaviest: { route: string, bytes: number }
  demoHeaviest: { route: string, demoBytes: number }
  failures: PageFailure[]
}
