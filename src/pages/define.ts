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
   * search indexes, sitemaps and caches at its path (`pageRouteRules`).
   */
  auth: boolean
  /**
   * The page guard's rules beyond a sign-in (`definePageMeta({ auth })`):
   * the admin console asks for the app-wide `admin` role, and is `hidden`,
   * so anyone who fails the rules gets the 404 of a page that does not exist.
   * Otherwise a signed-in person who fails them gets the 403 page.
   */
  access?: { role?: string | string[], hidden?: boolean }
  /**
   * A public page that is still kept out of search indexes and sitemaps: one
   * that reads a token from its link (a sign-in code, a signed link). Every
   * `auth` page is kept out already.
   */
  noindex?: boolean
  /**
   * A public page whose address carries a secret it acts on (the "keep my
   * account" link's token): kept out of caches too, like a private page,
   * though anyone may open it.
   */
  uncached?: boolean
}

/** Declares a page. The identity keeps the key's literal type. */
export function definePage<const K extends string>(def: BackendPageDef<K>): BackendPageDef<K> {
  return def
}
