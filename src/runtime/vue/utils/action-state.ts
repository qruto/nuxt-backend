import { computed, ref, toRaw, watch, type ComputedRef, type Ref } from 'vue'
import { tryUseNuxtApp } from '#imports'
import { type BackendError, failureOf } from './backend-error'

/** What the `backend:error` hook receives. */
export interface BackendErrorContext {
  /** The failure, as the composable's `error` holds it. */
  error: BackendError
  /** What the call threw, as it threw it. */
  cause: unknown
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /**
     * A composable's action failed: the same failure its `error` holds and
     * its promise rejects with. One place for an app-wide toast or an error
     * report. Reads never call it, not even one a composable runs as an
     * action (`useWorkspace().getInvitation`), and neither do the step
     * machines (`useLoginFlow`, `useEmailChange`) for the calls they make,
     * since they show their own `error`.
     */
    'backend:error': (context: BackendErrorContext) => void | Promise<void>
  }
}

/** The state a composable's actions share: whether one runs, and why the last one failed. */
export interface ActionState {
  /** `true` while any action runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed (see `failureOf`), or `null`. Cleared when the next one starts. */
  failure: Ref<BackendError | null>
  /**
   * Run one action: clear the last failure, count it as pending, and on
   * failure keep `failureOf(cause)` in `failure` and reject with the error
   * the call threw, as it threw it. `silent` keeps the failure from the
   * `backend:error` hook: a read run as an action.
   */
  run: <T>(call: () => Promise<T>, options?: RunOptions) => Promise<T>
}

/** How one action runs. */
export interface RunOptions {
  /** Keep a failure from the `backend:error` hook. */
  silent?: boolean
  /**
   * Leave it out of `isPending`, and leave the last failure in `failure`
   * as it starts: an action that waits on the person for as long as the
   * page is open, a passkey offered in autofill, must neither keep every
   * button busy nor wipe what an action the person ran said. Its own
   * failure still lands in `failure`.
   */
  background?: boolean
}

/** How many `quietly` calls are on the stack: a run that starts inside one is silent. */
let quiet = 0

/**
 * Start actions that report their own failures: every `run` that begins
 * while `start` runs is silent, however long it then takes. A step machine
 * wraps the composable calls it makes in this, since its `error` already
 * says why a step failed.
 */
export function quietly<T>(start: () => T): T {
  quiet++
  try {
    return start()
  }
  finally {
    quiet--
  }
}

/**
 * The action half of the composable conventions: an action resolves with its
 * result or rejects with what the call threw, mirrors a failure into the
 * composable's `error`, and counts toward `isPending` while it runs. A
 * failure belongs to the session it happened in: it is dropped once
 * `signedOut` turns true. Every failure also calls the app's
 * `backend:error` hook.
 */
export function useActionState(signedOut?: () => boolean): ActionState {
  const pending = ref(0)
  const failure = ref<BackendError | null>(null)
  const nuxtApp = tryUseNuxtApp()
  if (signedOut) {
    watch(signedOut, (out) => {
      if (out) failure.value = null
    })
  }

  async function run<T>(call: () => Promise<T>, options: RunOptions = {}): Promise<T> {
    // Read before the first await: a `quietly` around this call has returned by then.
    const silent = options.silent === true || quiet > 0
    const counted = options.background !== true
    if (counted) {
      failure.value = null
      pending.value++
    }
    try {
      return await call()
    }
    catch (cause) {
      failure.value = failureOf(cause)
      if (!silent) report(failure.value, cause)
      throw cause
    }
    finally {
      if (counted) pending.value--
    }
  }

  /** Tell the app's `backend:error` listeners; a listener's own failure never replaces the action's. */
  function report(error: BackendError, cause: unknown) {
    const context = { error: toRaw(error), cause: toRaw(cause) }
    void nuxtApp?.callHook('backend:error', context)?.catch((listenerError: unknown) => {
      if (import.meta.dev) console.warn('[nuxt-backend] A backend:error listener threw:', listenerError)
    })
  }

  return { isPending: computed(() => pending.value > 0), failure, run }
}
