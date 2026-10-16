import { computed, onMounted, ref } from 'vue'
import { useFetch } from '#app'

/** What the Playground LED shows: the deployment answers, does not, or is not known yet. */
export type PlaygroundStatus = 'live' | 'down' | 'unknown'

/**
 * The playground's status, from /api/playground/status, asked once per
 * visit from the browser: the docs are prerendered, so a status baked into
 * them would be as old as the build. Every caller reads the one answer: the
 * header's keys, the drawer's and a page's Try live key. One that mounts
 * while the request is out waits for it (`dedupe: 'defer'`) instead of
 * cancelling and sending it again, and one that mounts later, after a
 * navigation or when the drawer opens, reads the answer from the payload. A
 * component reads `unknown` until it mounts, as the server rendered it, so
 * hydration matches even when the answer came in first.
 */
export function usePlaygroundStatus() {
  const { data } = useFetch('/api/playground/status', {
    key: 'playground-status',
    server: false,
    lazy: true,
    default: () => null,
    dedupe: 'defer',
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] as { live: boolean } | undefined,
  })
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  return computed<PlaygroundStatus>(() => {
    const status = data.value as { live: boolean } | null
    return !mounted.value || !status ? 'unknown' : status.live ? 'live' : 'down'
  })
}
