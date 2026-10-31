import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, inject, ref, type Ref, watch } from 'vue'
import { useAsyncState } from '@vueuse/core'
import { ConvexAuthStateKey, useConvex } from 'nuxt-convex-module/client'
import type { AiCosts, PersonCost } from '../../../convex/integrations/ai/config'
import { type BackendError, failureOf } from '../utils/backend-error'
import { useBackendNamespace } from '../utils/namespace'

export type { AiCosts, PersonCost } from '../../../convex/integrations/ai/config'

/** The windows the Costs tab offers, in days; the first is the default. */
export const COST_WINDOWS = [30, 7, 90] as const

/** One of {@link COST_WINDOWS}. */
export type CostWindow = typeof COST_WINDOWS[number]

/** The function of `ai.api` the Costs tab reads. */
export interface AiCostsApiRefs {
  getCosts?: FunctionReference<'query', 'public', { since: number }, AiCosts | null>
}

export interface UseAiCostsOptions {
  /** Override the injected `api.ai` namespace. */
  api?: AiCostsApiRefs
  /** The window to open on, in days. Default 30. */
  days?: CostWindow
}

export interface UseAiCostsReturn {
  /** The window in days: set it to read another. */
  days: Ref<CostWindow>
  /** What AI cost over the window, as of the last read. `null` for a caller who is no administrator, `undefined` until it is read. */
  costs: ComputedRef<AiCosts | null | undefined>
  /** `true` while a read is on its way. */
  isLoading: ComputedRef<boolean>
  /** `true` once the read answered that this caller is no administrator. */
  isRefused: ComputedRef<boolean>
  /** Why the last read failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** Read the window again. */
  refresh: () => Promise<void>
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The first moment of the window that ends today: its first UTC day's
 * start. Fixed for the day, so a read for the same window asks the same.
 */
export function costWindowStart(days: number, now = Date.now()): number {
  return now - (now % DAY_MS) - (days - 1) * DAY_MS
}

/**
 * The admin console's Costs tab, as data: what each person's AI calls cost
 * over the last 7, 30 or 90 days, through `backend/ai.ts`'s `getCosts`,
 * which only answers administrators. A read, not a subscription: it runs
 * when the tab opens, when the window changes and on `refresh()`, since
 * every AI call that ends would rerun a live one.
 *
 * @internal
 */
export function useAiCosts(options: UseAiCostsOptions = {}): UseAiCostsReturn {
  const api = useBackendNamespace<AiCostsApiRefs>('ai', 'useAiCosts', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  // The browser's client: the server renders the tab without a read.
  const convex = import.meta.client ? useConvex() : null
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const days = ref<CostWindow>(options.days ?? COST_WINDOWS[0])
  // The last read's answer stays while the next one is on its way; a late answer for an older window is dropped.
  const read = useAsyncState(
    async (): Promise<AiCosts | null | undefined> => (convex && api.getCosts && !signedOut.value ? await convex.query(api.getCosts, { since: costWindowStart(days.value) }) : undefined),
    undefined,
    { immediate: false, resetOnExecute: false, onError: () => {} },
  )
  const refresh = async () => {
    await read.execute()
  }
  watch([days, signedOut], refresh, { immediate: true })

  return {
    days,
    costs: computed(() => (signedOut.value ? null : read.state.value)),
    isLoading: computed(() => !signedOut.value && read.isLoading.value),
    isRefused: computed(() => !signedOut.value && read.state.value === null),
    error: computed(() => (signedOut.value || read.error.value === undefined ? null : failureOf(read.error.value))),
    refresh,
  }
}

/** Who a row names, for the table: the account's name, else its address, else what the row holds. */
export function personName(person: Pick<PersonCost, 'who' | 'name' | 'email'>): string {
  return person.name || person.email || person.who
}
