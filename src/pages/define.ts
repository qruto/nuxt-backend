/**
 * One ready-made page the module mounts. Each page is a file in this folder
 * whose default export is a {@link definePage} call; `pnpm generate` lists
 * them in registry.ts, so adding a page never edits a shared list.
 */
export interface BackendPageDef<K extends string = string> {
  /** The page's key under `backend.pages` in nuxt.config. */
  key: K
  /** Where the page mounts unless `backend.pages.<key>` gives it a path. */
  defaultPath: string
  /** The page component's file name under `runtime/vue/pages/`. */
  file: string
  /**
   * Behind the `auth` route middleware. A private page is also kept out of
   * search indexes, sitemaps and every cache (`pageRouteRules`).
   */
  auth: boolean
}

/** Declares a page. The identity keeps the key's literal type. */
export function definePage<const K extends string>(def: BackendPageDef<K>): BackendPageDef<K> {
  return def
}
