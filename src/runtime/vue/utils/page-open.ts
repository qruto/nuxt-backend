import { getCurrentInstance, onMounted } from 'vue'
import { tryUseNuxtApp } from '#imports'

/**
 * Run `open` once the page is the browser's, to read what only the browser
 * has (the address's fragment, the tab's storage): on the component's
 * mount, or, called outside a component, once hydration is over, at once
 * on a page that is past it. Never on the server, so its HTML and the
 * browser's first render agree.
 *
 * @internal
 */
export function onPageOpen(open: () => void): void {
  if (getCurrentInstance()) {
    onMounted(open)
    return
  }
  if (typeof window === 'undefined') return
  const nuxtApp = tryUseNuxtApp()
  if (nuxtApp?.isHydrating) nuxtApp.hooks.hookOnce('app:suspense:resolve', open)
  else open()
}
