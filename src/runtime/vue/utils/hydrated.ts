import { onMounted, ref, type Ref } from 'vue'
import { tryUseNuxtApp } from '#app'

/**
 * Whether a component may render what the browser knows: `false` on the
 * server and while the browser hydrates the server's render of it, `true`
 * from its mount on, and at once for one that renders after the page has
 * hydrated (a navigation, a dialog). The session reads differently in the
 * two places (the request's token but no session on the server; a token or
 * a session that may already have loaded in the browser), so a component
 * that renders from it waits for this, and its first render in the browser
 * is the server's.
 */
export function useHydrated(): Ref<boolean> {
  const hydrated = ref(import.meta.client && !tryUseNuxtApp()?.isHydrating)
  if (!hydrated.value) {
    onMounted(() => {
      hydrated.value = true
    })
  }
  return hydrated
}
