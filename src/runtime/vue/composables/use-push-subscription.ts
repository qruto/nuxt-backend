import type { FunctionReference } from 'convex/server'
import { computed, getCurrentInstance, inject, onMounted, ref, watch, type ComputedRef } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { PushConfig } from '../../../convex/integrations/notifications'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { devicePushManager, type PushDevice, pushDevice, PUSH_WORKER_SCOPE, PUSH_WORKER_URL, subscriptionFor, watchDevicePushSignOut } from '../utils/push-device'

export type { PushConfig } from '../../../convex/integrations/notifications'

/** The push functions re-exported from your `backend/notifications.ts` (`notifications.api`). */
export interface PushSubscriptionApiRefs {
  getPushConfig?: FunctionReference<'query', 'public', Record<string, never>, PushConfig>
  subscribePush?: FunctionReference<'mutation', 'public', { endpoint: string, p256dh: string, auth: string }, null>
  unsubscribePush?: FunctionReference<'mutation', 'public', { endpoint: string }, null>
}

export interface UsePushSubscriptionOptions {
  /** Override the injected `api.notifications` namespace. */
  api?: PushSubscriptionApiRefs
}

export interface UsePushSubscriptionReturn {
  /** This browser can take web push, and the deployment sends it (its key pair is set). `false` on the server and while the key is read. */
  isSupported: ComputedRef<boolean>
  /** This device gets the signed-in person's push notifications. */
  isSubscribed: ComputedRef<boolean>
  /** The browser's permission for notifications on this site: `default` until asked, `granted` or `denied`. `denied` stays until the person allows it in the browser's site settings. */
  permission: ComputedRef<NotificationPermission>
  /** An iPhone or iPad that must add the app to its Home Screen before it can get push (iOS 16.4 and later). */
  needsInstall: ComputedRef<boolean>
  /** `true` while subscribing or unsubscribing. */
  isPending: ComputedRef<boolean>
  /** Why the last change failed, else why the key could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /**
   * Ask for permission and subscribe this device. Call it from a click:
   * browsers ask only in answer to a gesture. Resolves `false` when the
   * person did not allow notifications. Rejects on failure.
   */
  subscribe: () => Promise<boolean>
  /** Stop push notifications on this device. Rejects on failure. */
  unsubscribe: () => Promise<void>
}

/** An iPhone or iPad browser, where push needs the Home Screen app (iPadOS reads as a Mac with touch). */
function isAppleMobile(): boolean {
  const { userAgent, maxTouchPoints } = navigator
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/** The app runs from the Home Screen or as an installed app. */
function isInstalled(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode:standalone)').matches === true
}

/**
 * Web push on this device, for the signed-in person: whether the browser
 * can take it, whether this device is subscribed, the permission, and the
 * actions that subscribe and unsubscribe it.
 *
 * Safari 18.4 and later take the message itself (Declarative Web Push)
 * through `window.pushManager`, with no service worker. Chromium, Firefox
 * and earlier Safari subscribe through the small service worker the
 * module serves, which shows the same message and opens the app on a click.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { isSupported, isSubscribed, permission, needsInstall, subscribe, unsubscribe } = usePushSubscription()
 * </script>
 * <template>
 *   <p v-if="needsInstall">Add the app to your Home Screen to get notifications.</p>
 *   <p v-else-if="permission === 'denied'">Allow notifications for this site in your browser's settings.</p>
 *   <button v-else-if="isSupported && !isSubscribed" @click="subscribe">Notify me on this device</button>
 *   <button v-else-if="isSubscribed" @click="unsubscribe">Stop notifications on this device</button>
 * </template>
 * ```
 */
export function usePushSubscription(options: UsePushSubscriptionOptions = {}): UsePushSubscriptionReturn {
  const api = useBackendNamespace<PushSubscriptionApiRefs>('notifications', 'usePushSubscription', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const config = api.getPushConfig ? useLiveQuery(api.getPushConfig, () => (signedOut.value ? 'skip' : {})) : absentQuery<PushConfig>()
  const runSubscribe = api.subscribePush ? useMutation(api.subscribePush) : null
  const runUnsubscribe = api.unsubscribePush ? useMutation(api.unsubscribePush) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  // Browser state, read once mounted: nothing of it exists on the server.
  const capable = ref(false)
  const appleMobile = ref(false)
  const installed = ref(false)
  const permission = ref<NotificationPermission>('default')
  const subscribed = ref(false)
  const app = getCurrentInstance()?.appContext.app

  async function readDevice(): Promise<void> {
    const device = pushDevice()
    capable.value = device !== null
    appleMobile.value = isAppleMobile()
    installed.value = isInstalled()
    permission.value = typeof Notification === 'undefined' ? 'default' : Notification.permission
    subscribed.value = device ? (await (await devicePushManager(device, { register: false }))?.getSubscription() ?? null) !== null : false
  }

  onMounted(() => {
    void readDevice().catch(() => {})
    // Signing out drops this device's subscription (watchPushSignOut); signing in reads it again.
    watch(signedOut, (out) => {
      if (out) subscribed.value = false
      else void readDevice().catch(() => {})
    })
  })

  const needs = (name: string): never => {
    throw new Error(`[nuxt-backend] usePushSubscription() needs \`${name}\` re-exported from setupNotifications() in backend/notifications.ts (\`export const { ${name} } = notifications.api\`), or pass { api }.`)
  }

  const subscribe = () => run(async () => {
    if (!runSubscribe) needs('subscribePush')
    const publicKey = config.data.value?.publicKey
    const device = pushDevice()
    if (!publicKey || !device) throw new Error('[nuxt-backend] usePushSubscription: web push is not available here (check isSupported first).')
    permission.value = await Notification.requestPermission()
    if (permission.value !== 'granted') return false
    const manager = await devicePushManager(device as PushDevice, { register: true })
    if (!manager) throw new Error(`[nuxt-backend] usePushSubscription: the push service worker (${PUSH_WORKER_URL}, scope ${PUSH_WORKER_SCOPE}) did not register.`)
    const subscription = await subscriptionFor(manager, publicKey)
    const { endpoint, keys } = subscription.toJSON()
    await runSubscribe!({ endpoint: endpoint!, p256dh: keys!.p256dh!, auth: keys!.auth! })
    subscribed.value = true
    // A subscription made on this page is dropped by signing out here too.
    void watchDevicePushSignOut(watch => (app ? app.runWithContext(watch) : watch())).catch(() => {})
    return true
  })

  const unsubscribe = () => run(async () => {
    if (!runUnsubscribe) needs('unsubscribePush')
    const device = pushDevice()
    const subscription = device ? await (await devicePushManager(device, { register: false }))?.getSubscription() : null
    if (subscription) {
      await runUnsubscribe!({ endpoint: subscription.endpoint })
      await subscription.unsubscribe()
    }
    subscribed.value = false
  })

  return {
    isSupported: computed(() => capable.value && !signedOut.value && Boolean(config.data.value?.publicKey) && !(appleMobile.value && !installed.value)),
    isSubscribed: computed(() => !signedOut.value && subscribed.value),
    permission: computed(() => permission.value),
    needsInstall: computed(() => appleMobile.value && !installed.value && Boolean(config.data.value?.publicKey)),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : config.error.value)),
    subscribe,
    unsubscribe,
  }
}
