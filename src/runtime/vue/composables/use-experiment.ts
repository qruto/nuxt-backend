import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, type MaybeRefOrGetter, toValue, watch } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { useAsyncQuery } from 'nuxt-convex-module/app'
import type { ExperimentResult, FlagValues } from '../../../convex/integrations/flags'
import type { FlagOverride } from '../../../convex/flags'
import { useAuthSession } from '../utils/auth-session'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, diagnostics, useLiveQuery } from '../utils/live-query'
import { useApiNamespace, useBackendNamespace } from '../utils/namespace'

export type { ExperimentResult } from '../../../convex/integrations/flags'

/** The functions of `flags.api` an experiment reads. */
export interface ExperimentApiRefs {
  getFlags?: FunctionReference<'query', 'public', Record<string, never>, FlagValues>
  exposeExperiment?: FunctionReference<'mutation', 'public', { key: string }, { variant: string } | null>
}

export interface UseExperimentOptions {
  /** Override the injected `api.flags` namespace. */
  api?: ExperimentApiRefs
}

export interface UseExperimentReturn {
  /**
   * The variant for whoever is looking: the control (the first variant)
   * while the experiment is off, for a signed-out visitor, and during an
   * administrator's visit; the winner once one is picked. `undefined` for a
   * key without variants, and while the first read is on its way, which a
   * page rendered on the server never shows.
   */
  variant: ComputedRef<string | undefined>
  /** `true` until the flags are first read. */
  isLoading: ComputedRef<boolean>
}

/** The exposures this page sent, by account and key: each is sent once, and the server keeps only the first anyway. */
const sent = new Set<string>()

/**
 * The variant of an experiment, a `defineFlags` flag with `variants`, for
 * whoever is looking. Read on the server with the rest of the flags, so the
 * first HTML already shows the right version, and live after.
 *
 * The first time it shows a signed-in person a running experiment, it
 * records their exposure (`experiment.exposed`) through `exposeExperiment`:
 * only exposed people count in the experiment's results. `flags.variant(ctx,
 * key)` reads the same variant on the server: both hash the same key and id.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { variant } = useExperiment('pricingHeadline')
 * </script>
 * <template>
 *   <StripShowcase v-if="variant === 'strip'" />
 *   <h1 v-else>Plans for every comic</h1>
 * </template>
 * ```
 */
export function useExperiment(key: MaybeRefOrGetter<string>, options: UseExperimentOptions = {}): UseExperimentReturn {
  const api = useBackendNamespace<ExperimentApiRefs>('flags', 'useExperiment', options.api)
  if (!api.getFlags) return { variant: computed(() => undefined), isLoading: computed(() => false) }
  const read = useAsyncQuery(api.getFlags, {})
  const variant = computed(() => read.data.value?.variants?.[toValue(key)])
  exposeOnRead(api, () => read.data.value, () => toValue(key), true)
  return {
    variant,
    isLoading: computed(() => read.data.value === undefined && read.error.value === null),
  }
}

/**
 * Record the person's exposure the first time a read shows them a running
 * experiment, in the browser only: once per account and key on this page,
 * and the server keeps only the first anyway.
 */
function exposeOnRead(api: ExperimentApiRefs, data: () => FlagValues | undefined, key: () => string | undefined, warn: boolean): void {
  if (!import.meta.client) return
  const auth = useAuthSession()
  const expose = api.exposeExperiment ? useMutation(api.exposeExperiment) : null
  if (!expose && warn && diagnostics.enabled) console.warn('[nuxt-backend] useExperiment(): the backend exports no `exposeExperiment`: re-export it from backend/flags.ts with the rest of `flags.api`, or no exposure is recorded.')
  watch([data, key, () => auth.user.value?.id], ([flags, name, userId]) => {
    if (!flags || !name) return
    if (!Object.hasOwn(flags.variants ?? {}, name)) {
      if (warn && diagnostics.enabled) console.warn(`[nuxt-backend] useExperiment('${name}'): the flag declares no variants, so it reads as no variant. Add \`variants\` to it in backend/flags.ts.`)
      return
    }
    const id = `${userId}:${name}`
    if (!expose || !userId || !flags.running?.includes(name) || sent.has(id)) return
    sent.add(id)
    // A failed exposure is tried again on the next read.
    expose({ key: name }).catch(() => sent.delete(id))
  }, { immediate: true })
}

/**
 * The promotion a price test shows the person, from the first running
 * experiment whose variant maps to one (`discounts`): what `<PricingTable>`
 * shows and applies when the address carries no campaign code, recording
 * the exposure as `useExperiment` does. Silent without a `backend/flags.ts`.
 *
 * @internal
 */
export function useExperimentDiscount(): ComputedRef<string | undefined> {
  const api = useApiNamespace<ExperimentApiRefs>('flags')
  if (!api?.getFlags) return computed(() => undefined)
  const read = useAsyncQuery(api.getFlags, {})
  const test = computed(() => Object.entries(read.data.value?.discounts ?? {})[0])
  // Showing a price test's promotion is a read of its experiment: it records the exposure.
  exposeOnRead(api, () => read.data.value, () => test.value?.[0], false)
  return computed(() => test.value?.[1])
}

/** The functions of `flags.api` the Experiments view reads and writes. */
export interface ExperimentAdminApiRefs {
  getExperiments?: FunctionReference<'query', 'public', Record<string, never>, ExperimentResult[]>
  setFlag?: FunctionReference<'mutation', 'public', { key: string, override: FlagOverride | null }, null>
}

export interface UseExperimentResultsReturn {
  /** Every experiment the code declares, with its results per variant, live; `undefined` while it is read. */
  experiments: ComputedRef<ExperimentResult[] | undefined>
  /** `true` while the first read is on its way. */
  isLoading: ComputedRef<boolean>
  /** Why the read failed, else `null`: `forbidden` for a caller who is no administrator. */
  error: ComputedRef<BackendError | null>
  /**
   * Show one variant to everyone (the experiment's winner), or run it again
   * with `null`: the flag's override keeps the rest of what it held. Takes
   * a recent sign-in, like any flag change. Rejects on failure.
   */
  pick: (experiment: ExperimentResult, variant: string | null) => Promise<void>
}

/**
 * The admin console's Experiments view, as data: each experiment's
 * exposures, goal rate with its 95% interval and guardrails per variant,
 * through `getExperiments` of `backend/flags.ts`, and picking a winner
 * through `setFlag`.
 *
 * @internal
 */
export function useExperimentResults(options: { api?: ExperimentAdminApiRefs } = {}): UseExperimentResultsReturn {
  const api = useBackendNamespace<ExperimentAdminApiRefs>('flags', 'useExperimentResults', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const read = api.getExperiments ? useLiveQuery(api.getExperiments, () => (signedOut.value ? 'skip' : {})) : absentQuery<ExperimentResult[]>()
  const setFlag = api.setFlag ? useMutation(api.setFlag) : null
  return {
    experiments: computed(() => (signedOut.value ? undefined : read.data.value ?? undefined)),
    isLoading: computed(() => !signedOut.value && read.isLoading.value),
    error: computed(() => (signedOut.value ? null : read.error.value)),
    pick: async (experiment, variant) => {
      if (!setFlag) throw new Error('[nuxt-backend] useExperimentResults(): the backend exports no `setFlag`: re-export it from backend/flags.ts.')
      const { winner: _winner, ...rest } = experiment.override ?? {}
      await setFlag({ key: experiment.key, override: variant === null ? rest : { ...rest, winner: variant } })
    },
  }
}
