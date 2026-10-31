<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useOnline } from '@vueuse/core'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { IN_FRAME, placedByApp, useOpenedConnection, type ConnectionStatusSlotContext, type ConnectionStatusSlots, type ConnectionStatusState } from './connection-status'

/**
 * The live connection's state, in words, for a person: nothing while it is
 * up; "Reconnecting…" once a drop has lasted `delay`; "You're offline." as
 * soon as the browser is; and how many changes wait to be sent meanwhile.
 * Display only: the client reconnects and sends the waiting changes on its
 * own, and the browser asks before a tab with unsent changes closes.
 *
 * Every ready-made page shows it in its status region, and says nothing
 * there while the app shows one of its own, in a layout around the page.
 * It reads the client's connection state once the client has a connection,
 * never opening one itself, and the browser's online state, in the browser
 * only, and shows what they say once mounted, so a server render and its
 * hydration agree.
 *
 * An always-mounted polite live region (`data-connection="status"`, with
 * `data-state`), its copy from the `connection` labels, and a slot for
 * words or an indicator of your own.
 *
 * @example
 * ```vue
 * <ConnectionStatus :delay="3000" />
 * ```
 */
defineOptions({ name: 'ConnectionStatus' })

const props = withDefaults(defineProps<{
  /** How long a dropped connection lasts, in milliseconds, before it is shown. Going offline shows at once. */
  delay?: number
  /** Copy for this component, over `appConfig.backend.labels.connection` and the translations. */
  labels?: LabelOverrides<BackendLabels['connection']>
}>(), { delay: 1500, labels: undefined })
defineEmits({})
defineSlots<ConnectionStatusSlots>()

const { t } = useLabels('connection', () => props.labels)
const connection = useOpenedConnection()
const online = useOnline()
const mounted = ref(false)
// The frame's own status steps aside for one the app placed: one set of
// words, announced once.
const inFrame = inject(IN_FRAME, false)
onMounted(() => {
  mounted.value = true
  if (!inFrame) placedByApp.value++
})
onBeforeUnmount(() => {
  if (!inFrame) placedByApp.value--
})
const now = computed<ConnectionStatusState>(() => {
  if (!mounted.value) return 'online'
  if (!online.value) return 'offline'
  const state = connection.value
  if (!state || state.isWebSocketConnected) return 'online'
  // A first connection on its first try is no outage.
  return state.hasEverConnected || state.connectionRetries > 0 ? 'reconnecting' : 'online'
})
// A drop shows once it has lasted `delay`, so a blip says nothing; going
// offline shows at once, and so does coming back.
const status = ref<ConnectionStatusState>('online')
let timer: ReturnType<typeof setTimeout> | undefined
watch(now, (next) => {
  clearTimeout(timer)
  if (next === 'reconnecting' && status.value === 'online' && props.delay > 0) {
    timer = setTimeout(() => {
      status.value = now.value
    }, props.delay)
    return
  }
  status.value = next
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))
const pendingChanges = computed(() => (status.value === 'online' ? 0 : connection.value?.inflightMutations ?? 0))
const shown = computed<ConnectionStatusState>(() => (inFrame && placedByApp.value > 0 ? 'online' : status.value))
const context = computed<ConnectionStatusSlotContext>(() => ({ status: shown.value, pendingChanges: shown.value === 'online' ? 0 : pendingChanges.value }))

// In the template: The live region stays mounted, empty while the connection
// is up, so a drop is announced when its words appear in it.
</script>

<template>
  <div
    data-connection="status"
    :data-state="context.status"
    role="status"
    aria-live="polite"
  >
    <slot v-bind="context">
      <p
        v-if="context.status !== 'online'"
        data-connection="message"
      >
        {{ context.status === 'offline' ? t('offline') : t('reconnecting') }}{{ context.pendingChanges > 0 ? ` ${t('pending', { count: context.pendingChanges })}` : '' }}
      </p>
    </slot>
  </div>
</template>
