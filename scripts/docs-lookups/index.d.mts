/** One lookup: the file it writes, the region of it that it owns (none: the whole file), the registry it reads, and how it renders. */
export interface Lookup {
  file: string
  region?: string
  source: string
  render: () => string
}

export declare const LOOKUPS: Lookup[]

/** The data `::what-you-get` renders on every tab landing. */
export declare const WHAT_YOU_GET_FILE: string

/** The files the lookups write. */
export declare function lookupFiles(): string[]

/** A file's current text, or `''` before a whole-file lookup first writes it. */
export declare function currentText(file: string): string

/** A file's text as its lookups would write it, from its current text. */
export declare function expectedText(file: string, current?: string): string

/** The names of every region a file's text marks. */
export declare function regionNames(file: string, text: string): string[]

/** What sits between a region's markers, or `undefined` when the file has no such region. */
export declare function readRegion(file: string, text: string, name: string): string | undefined

/** The component functions an app may call itself, by `module.function`. */
export declare const APP_CALLABLE: Record<string, string>

/** What the package does itself on a billing event, by event. */
export declare const BILLING_BUILT_IN: Record<string, string>

/** What each route option of `registerBackendRoutes` mounts, by option. */
export declare const DEPLOYMENT_ROUTES: Record<string, [methods: string, calledBy: string, guardedBy: string]>

/** The routes the package mounts, by the tab each belongs to. */
export declare const ROUTE_AREAS: Record<string, string>

/** What each `doctor` finding checks, when it fails, and its fix. */
export declare const FINDING_DOCS: Record<string, { checks: string, fails?: string, prodFails?: string, prodOnly?: boolean, why: string, fix: string, verify?: string }>

/** What each subpath is for, by subpath. */
export declare const USE_FOR: Record<string, string>
