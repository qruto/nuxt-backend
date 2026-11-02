import type { NuxtApp } from '#app'
import type { Router } from 'vue-router'

/**
 * Run `check` on the page the app loaded on, then after each navigation
 * inside the app: for a plugin that acts on a parameter of the address,
 * which a page load or a link can bring. Only a navigation that landed: one
 * a guard refused leaves the address as it was, and reading it again would
 * act on the same parameter forever.
 */
export function onEveryPage(nuxtApp: Pick<NuxtApp, 'hook'>, router: Pick<Router, 'afterEach'>, check: () => void): void {
  nuxtApp.hook('app:mounted', check)
  router.afterEach((_to, from, failure) => {
    if (!failure && from.matched.length > 0) check()
  })
}
