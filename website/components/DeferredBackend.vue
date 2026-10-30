<script setup lang="ts">
import { BackendClientChunkError } from '../modules/deferred-backend-client/runtime/loader'
import type { DeferredBackendState } from '../utils/live-demo'

/**
 * A live block outside the playground: it renders its slot once the backend
 * client has loaded. It asks for the client when it scrolls into view
 * (`load="visible"`, the default) or when the reader starts it
 * (`load="click"`, through the `start` its fallback gets), and at once on a
 * route that already has the client. Until then, and on the server, it
 * renders `#fallback`, which gets the block's `state`:
 *
 * - `idle`: nothing has asked for the client yet;
 * - `loading`: it is on its way;
 * - `failed`: it would not load, offline or because its plugin failed;
 *   `start` tries again;
 * - `stale`: its chunk would not fetch: the page outlived the deploy that
 *   built it, or the fetch dropped. A browser keeps a failed import's
 *   answer for its URL, so `start` reloads the page instead, as the route
 *   middleware does for a page that needs the client;
 * - `unavailable`: this build has no backend URL, so there is nothing to
 *   load.
 *
 * `started` comes along too, whether the reader started it (so a retry key
 * can stay while it loads). Every change is emitted as `state`. A block
 * the reader started takes focus once it is live, so the key they pressed,
 * which the live part replaces, does not drop focus to the page; the block
 * itself is no control, so it draws no ring, and the next Tab lands on the
 * live part's first.
 *
 * On the docs only pages with `demo: true` may hold one (the page-header
 * test, and scripts/check-website-bundle.mjs on the build), and the homepage
 * none; see modules/deferred-backend-client. `data-deferred-backend` marks
 * the block in the prerendered page for the bundle check.
 */
const props = withDefaults(defineProps<{
  as?: string
  load?: 'visible' | 'click'
}>(), { as: 'div', load: 'visible' })

const emit = defineEmits<{ state: [state: DeferredBackendState] }>()

const root = useTemplateRef<HTMLElement>('root')
const state = ref<DeferredBackendState>('idle')
const started = ref(false)
// Client-only: the plugin that provides these runs in the browser.
const { $loadBackendClient, $backendClientStatus } = useNuxtApp()

watch(state, (value) => {
  emit('state', value)
  if (value === 'ready' && started.value) void nextTick(() => root.value?.focus())
})

function connect(): Promise<void> {
  if (state.value === 'loading' || state.value === 'ready') return Promise.resolve()
  const status = $backendClientStatus()
  // Known without a round trip: nothing to load, or loaded already.
  if (status !== 'deferred') {
    state.value = status === 'loaded' ? 'ready' : 'unavailable'
    return Promise.resolve()
  }
  state.value = 'loading'
  return $loadBackendClient().then(() => {
    state.value = 'ready'
  }, (error: unknown) => {
    // Offline, the reader needs their connection back first. Online, a
    // chunk that would not fetch will not on a retry either.
    state.value = error instanceof BackendClientChunkError && navigator.onLine !== false ? 'stale' : 'failed'
  })
}

/** The reader starts the block: from a click-to-load fallback, to try again after a failure, or to reload a stale page. */
function start(): Promise<void> {
  started.value = true
  if (state.value === 'stale') {
    // They asked for it, so past Nuxt's guard against a reload loop.
    reloadNuxtApp({ persistState: true, force: true })
    return Promise.resolve()
  }
  return connect()
}

let observer: IntersectionObserver | undefined
onMounted(() => {
  // Nothing to load, or loaded already: say so, or go live, at once.
  if ($backendClientStatus() !== 'deferred') {
    void connect()
    return
  }
  if (props.load === 'click') return
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting)) return
    observer?.disconnect()
    void connect()
  }, { rootMargin: '200px' })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <component
    :is="props.as"
    ref="root"
    data-deferred-backend
    :data-state="state"
    :aria-busy="state === 'loading' ? 'true' : undefined"
    :tabindex="started ? -1 : undefined"
    class="outline-none"
  >
    <slot v-if="state === 'ready'" />
    <slot
      v-else
      name="fallback"
      :state="state"
      :started="started"
      :start="start"
    />
  </component>
</template>
