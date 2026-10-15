/** What the Playground LED shows: the deployment answers, does not, or is not known yet. */
export type PlaygroundStatus = 'live' | 'down' | 'unknown'

/**
 * The playground's status, from /api/playground/status, asked once per
 * visit from the browser: the docs are prerendered, so a status baked into
 * them would be as old as the build. A component reads `unknown` until it
 * mounts, as the server rendered it, so hydration matches even when the
 * answer came in first.
 */
export function usePlaygroundStatus() {
  const { data } = useFetch('/api/playground/status', {
    key: 'playground-status',
    server: false,
    lazy: true,
    default: () => null,
  })
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  return computed<PlaygroundStatus>(() => !mounted.value || data.value === null ? 'unknown' : data.value.live ? 'live' : 'down')
}
