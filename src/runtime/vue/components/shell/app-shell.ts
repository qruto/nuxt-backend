import type { InjectionKey } from 'vue'

/** The slots of `<AppShell>`. */
export interface AppShellSlots {
  /** Your logo and name, linking home. */
  brand: () => unknown
  /** Your app's own links, in the shell's navigation landmark. */
  nav: () => unknown
  /** Your buttons before the notifications and the account menu, such as a search button or a "New strip" link. */
  actions: () => unknown
  /** Your page, inside the `<main>` landmark. */
  default: () => unknown
}

/**
 * Provided by `<AppShell>` to everything inside it. A packaged page's frame
 * reads it and leaves the `<main>` landmark, the notices and the consent
 * dialog to the shell, so nothing shows twice.
 *
 * @internal
 */
export const IN_APP_SHELL: InjectionKey<boolean> = Symbol('nuxt-backend:app-shell')
