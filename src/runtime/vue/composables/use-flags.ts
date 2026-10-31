import type { FunctionReference } from 'convex/server'
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { useAsyncQuery } from 'nuxt-convex-module/app'
import type { AdminFlag, FlagValues } from '../../../convex/integrations/flags'
import type { FlagOverride } from '../../../convex/flags'
import { useActionState } from '../utils/action-state'
import { type BackendError, failureOf } from '../utils/backend-error'
import { absentQuery, diagnostics, useLiveQuery } from '../utils/live-query'
import { useApiNamespace, useBackendNamespace } from '../utils/namespace'

export type { AdminFlag, FlagValues } from '../../../convex/integrations/flags'
export type { FlagOverride } from '../../../convex/flags'

/** The functions re-exported from your `backend/flags.ts`. */
export interface FlagsApiRefs {
  getFlags?: FunctionReference<'query', 'public', Record<string, never>, FlagValues>
  listFlags?: FunctionReference<'query', 'public', Record<string, never>, AdminFlag[] | null>
  setFlag?: FunctionReference<'mutation', 'public', { key: string, override: FlagOverride | null }, null>
}

export interface UseFlagOptions {
  /**
   * Read the flags on the server too (default `true`), so the page's HTML
   * is rendered with the flag as it is for the visitor. `false` reads in
   * the browser only: the flag reads off until then.
   */
  server?: boolean
  /** Override the injected `api.flags` namespace. */
  api?: FlagsApiRefs
}

export interface UseFlagReturn {
  /** Whether the flag is on for the signed-in person (or the visitor), live. `false` until it is read, and for a flag the app does not declare. */
  isEnabled: ComputedRef<boolean>
  /** `true` until the flags are first read. */
  isLoading: ComputedRef<boolean>
  /** Why the flags could not be read, else `null`. The read never throws. */
  error: ComputedRef<BackendError | null>
}

/**
 * Whether a feature flag is on for whoever is looking: their account,
 * their active workspace and their plan, as `backend/flags.ts` declares
 * the flag and the admin console overrides it. One of the package's own
 * reads too: `useFlag('pause_checkout')` is on while checkout is paused.
 *
 * Rendered on the server: the flags ride in the page's payload, so the
 * HTML already shows the flag as it is, and the read then stays live. Every
 * `useFlag` on a page shares one read. The flag is a hint for the page:
 * the server decides with `flags.requireFlag`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { isEnabled } = useFlag('newEditor')
 * </script>
 * <template>
 *   <NewEditor v-if="isEnabled" />
 *   <ClassicEditor v-else />
 * </template>
 * ```
 */
export function useFlag(key: MaybeRefOrGetter<string>, options: UseFlagOptions = {}): UseFlagReturn {
  const api = useBackendNamespace<FlagsApiRefs>('flags', 'useFlag', options.api)
  if (!api.getFlags) {
    return { isEnabled: computed(() => false), isLoading: computed(() => false), error: computed(() => null) }
  }
  const read = useAsyncQuery(api.getFlags, {}, options.server === false ? { server: false, lazy: true, key: 'backend:flags:client' } : {})
  return {
    isEnabled: computed(() => read.data.value?.flags[toValue(key)] === true),
    isLoading: computed(() => read.data.value === undefined && read.error.value === null),
    error: computed(() => (read.error.value ? failureOf(read.error.value) : null)),
  }
}

/**
 * The maintenance banner's state, live, in the browser only: its message
 * while the switch is on (`''` for the default sentence), else `null`.
 * Silent and `null` without a `backend/flags.ts`, so every page's frame may
 * ask.
 *
 * @internal
 */
export function useMaintenanceNotice(): ComputedRef<{ message: string } | null> {
  const api = useApiNamespace<FlagsApiRefs>('flags')
  if (!api?.getFlags) return computed(() => null)
  const read = useLiveQuery(api.getFlags, {})
  return computed(() => read.data.value?.maintenance ?? null)
}

export interface UseFlagAdminOptions {
  /** Override the injected `api.flags` namespace. */
  api?: FlagsApiRefs
}

export interface UseFlagAdminReturn {
  /** Every flag with its default and override, the package's own first, live: `[]` for a caller who is no administrator, `undefined` while it is read. */
  flags: ComputedRef<AdminFlag[] | undefined>
  /** `true` while the list is first read. */
  isLoading: ComputedRef<boolean>
  /** `true` once the list answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** `true` while a change is saved. */
  isPending: ComputedRef<boolean>
  /** Why the last change failed, else why the list could not be read, else `null`. Reads never reject. */
  error: ComputedRef<BackendError | null>
  /**
   * Store a flag's override: on or off for everyone, its targets and its
   * rollout; `null` removes it, so the flag holds its default. Takes a
   * recent sign-in (`useReauthentication().withReauthentication` asks for
   * one). Rejects on failure.
   */
  setFlag: (key: string, override: FlagOverride | null) => Promise<void>
}

/**
 * The admin console's Flags tab, as data: every flag with its default and
 * its override, and the change an administrator makes, through
 * `listFlags` and `setFlag` of `backend/flags.ts`. Every change is an
 * administrator's in person, takes a recent sign-in, and is recorded on the
 * activity trail. A caller who is no administrator reads an empty list and
 * `isRefused`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { flags, setFlag } = useFlagAdmin()
 * const { withReauthentication } = useReauthentication()
 * const pauseCheckout = (on: boolean) => withReauthentication(() => setFlag('pause_checkout', { enabled: on }))
 * </script>
 * ```
 */
export function useFlagAdmin(options: UseFlagAdminOptions = {}): UseFlagAdminReturn {
  const api = useBackendNamespace<FlagsApiRefs>('flags', 'useFlagAdmin', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const authLoading = computed(() => auth != null && auth.isLoading.value)
  const read = api.listFlags ? useLiveQuery(api.listFlags, () => (signedOut.value ? 'skip' : {})) : absentQuery<AdminFlag[] | null>()
  const runSet = api.setFlag ? useMutation(api.setFlag) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)
  if (!api.setFlag && diagnostics.enabled) console.warn('[nuxt-backend] useFlagAdmin(): the backend exports no `setFlag`: re-export it from backend/flags.ts with the rest of `flags.api`.')

  return {
    flags: computed(() => {
      if (authLoading.value) return undefined
      if (signedOut.value || read.data.value === null) return []
      return read.data.value
    }),
    isLoading: computed(() => authLoading.value || (!signedOut.value && read.isLoading.value)),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value)),
    setFlag: (key, override) => run(async () => {
      if (!runSet) throw new Error('[nuxt-backend] Changing a flag needs `setFlag` re-exported from setupFlags() in backend/flags.ts, or pass `{ api }` to useFlagAdmin().')
      await runSet({ key, override })
    }),
  }
}
