/**
 * The device side of web push: which push manager a browser subscribes
 * through, and the module's service worker for the browsers that need one.
 * The worker lives under a scope of its own, so it sits beside a service
 * worker the app already has at `/` and never controls a page.
 *
 * @internal
 */
import { watch } from 'vue'
import { settledSessionKey } from './local-sign-out'
import { PUSH_WORKER_SCOPE, PUSH_WORKER_URL } from '../../../convex/web-push'

export { PUSH_WORKER_SCOPE, PUSH_WORKER_URL } from '../../../convex/web-push'

/** How a browser takes push: Declarative Web Push (Safari 18.4 and later, no worker) or a service worker. */
export type PushDevice = 'declarative' | 'worker'

/** Safari's Declarative Web Push: a push manager on the window itself. */
function windowPushManager(): PushManager | null {
  return (window as Window & { pushManager?: PushManager }).pushManager ?? null
}

/** How this browser takes push; `null` where it takes none (or on the server). */
export function pushDevice(): PushDevice | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null
  if (windowPushManager()) return 'declarative'
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'worker'
  return null
}

/** A registration's worker once it is active: a push subscription needs one, and the worker controls no page, so `serviceWorker.ready` never says. */
function activated(registration: ServiceWorkerRegistration): Promise<ServiceWorkerRegistration> {
  const worker = registration.installing ?? registration.waiting
  if (registration.active || !worker) return Promise.resolve(registration)
  return new Promise((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve(registration)
    })
  })
}

/**
 * The module's own registration, matched by its exact scope: `getRegistration()`
 * answers the registration whose scope matches a URL longest, which is an app's
 * own worker at `/` while the push worker is not registered yet.
 */
async function ownRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const scope = new URL(PUSH_WORKER_SCOPE, location.origin).href
  return (await navigator.serviceWorker.getRegistrations()).find(registration => registration.scope === scope)
}

/** A key as base64url, the form the deployment hands out. */
function base64url(key: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * This device's subscription under `publicKey`, made when there is none. One
 * made under another key (a rotated one) is dropped first: the push service
 * refuses every send to it.
 */
export async function subscriptionFor(manager: PushManager, publicKey: string): Promise<PushSubscription> {
  const existing = await manager.getSubscription()
  const key = existing?.options.applicationServerKey
  if (existing && key && base64url(key) === publicKey) return existing
  await existing?.unsubscribe()
  return manager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey })
}

/**
 * The push manager this device subscribes through: Safari's own, else the
 * module's worker's, registered first when `register` asks for it. `null`
 * when the worker is not registered and `register` is false.
 */
export async function devicePushManager(device: PushDevice, { register }: { register: boolean }): Promise<PushManager | null> {
  if (device === 'declarative') return windowPushManager()
  const existing = await ownRegistration()
  if (existing) return (await activated(existing)).pushManager
  if (!register) return null
  return (await activated(await navigator.serviceWorker.register(PUSH_WORKER_URL, { scope: PUSH_WORKER_SCOPE }))).pushManager
}

/**
 * Drop this device's push subscription, as signing out does: the next
 * person to sign in here gets none of the last one's notifications. The
 * deployment drops its row once the push service answers it is gone.
 */
export async function dropDeviceSubscription(): Promise<void> {
  const device = pushDevice()
  if (!device) return
  const manager = await devicePushManager(device, { register: false })
  const subscription = await manager?.getSubscription()
  await subscription?.unsubscribe()
}

/**
 * Watch the session and drop this device's push subscription when it signs
 * out, so a shared computer stops notifying the person who left. `session`
 * is the Better Auth session (`useSession()`'s state); only a settled end
 * counts, signed in by the last answer and signed out by
 * this one. A pending answer (a token refresh) is no end, nor is a new
 * session id (a sign-in again, an administrator's visit): the Convex
 * connection's own auth state drops for a round trip on both.
 */
export function watchPushSignOut(session: () => { isPending: boolean, data: unknown }): void {
  if (pushDevice() === null) return
  let signedIn: string | null | undefined
  watch(() => settledSessionKey(session()), (now) => {
    if (now === undefined) return
    const ended = signedIn
    signedIn = now
    if (now === null && ended) void dropDeviceSubscription().catch(() => {})
  }, { immediate: true })
}

let watching = false

/**
 * Start {@link watchPushSignOut} once per page, on a device that holds a
 * push subscription: the session's client loads only there, so a page of
 * an app that never asked for push (a docs page) never fetches it. `run`
 * runs in the app's context, where the session's composable reads it;
 * `load` loads that client.
 */
export async function watchDevicePushSignOut(
  run: (watch: () => void) => void,
  load: () => Promise<{ useBetterAuth: () => { session: { value: { isPending: boolean, data: unknown } } } }> = () => import('nuxt-convex-module/better-auth/client'),
): Promise<void> {
  const device = pushDevice()
  if (watching || !device) return
  // Claimed before the first await, so two callers at once start one watch.
  watching = true
  const manager = await devicePushManager(device, { register: false })
  if (!(await manager?.getSubscription())) {
    watching = false
    return
  }
  const { useBetterAuth } = await load()
  run(() => {
    const { session } = useBetterAuth()
    watchPushSignOut(() => session.value)
  })
}
