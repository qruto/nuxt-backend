import type { NuxtApp } from '#app'
import type { Router } from 'vue-router'

/**
 * Run `check` on the page the app loaded on, then after each navigation
 * inside the app: for a plugin that acts on a parameter of the address,
 * which a page load or a link can bring.
 */
export function onEveryPage(nuxtApp: Pick<NuxtApp, 'hook'>, router: Pick<Router, 'afterEach'>, check: () => void): void {
  nuxtApp.hook('app:mounted', check)
  router.afterEach((_to, from) => {
    if (from.matched.length > 0) check()
  })
}
