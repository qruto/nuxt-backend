import type { FunctionReference } from 'convex/server'
import { computed, inject, ref, useId } from 'vue'
import { refDebounced } from '@vueuse/core'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import type { BillingConsole } from '../../../../convex/integrations/billing'
import { formatBillingAmount, formatBillingDate } from '../../composables/billing-format'
import { type BackendLabels, type LabelKey, useLabels, valueLabel } from '../../composables/use-labels'
import { absentQuery, useLiveQuery } from '../../utils/live-query'
import { useBackendNamespace } from '../../utils/namespace'

// The Billing tab's state, headless: `AdminBilling.vue` renders it. The
// billing lifecycle's records an administrator answers for: the save offers
// the cancel flow made and whether each was taken, the EU withdrawals (the
// refund is the administrator's to send), and the renewal consent proofs
// California's automatic renewal law asks a seller to keep, all of them or
// one billing entity's.

/** The billing function the tab reads, re-exported from `backend/billing.ts`. */
interface BillingAdminRefs {
  getBillingConsole?: FunctionReference<'query', 'public', { entityId?: string }, BillingConsole | null>
}

type SaveOfferRow = BillingConsole['saveOffers'][number]
type ConsentRow = BillingConsole['consents'][number]

/**
 * The Billing tab, as state.
 *
 * @internal
 */
export function useBillingTab() {
  const api = useBackendNamespace<BillingAdminRefs>('billing', 'AdminBilling')
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  /** The billing entity to narrow to, as typed: a workspace's id, or an account's with `billTo: 'user'`. */
  const entity = ref('')
  const entityId = refDebounced(computed(() => entity.value.trim()), 300)
  const read = api.getBillingConsole
    ? useLiveQuery(api.getBillingConsole, () => (signedOut.value ? 'skip' : (entityId.value ? { entityId: entityId.value } : {})))
    : absentQuery<BillingConsole | null>()
  const { t, errorMessage, locale } = useLabels('admin')
  // The cancellation reasons in the cancel flow's own words.
  const reasons = useLabels('cancelFlow')
  const id = useId()

  const date = (at: number) => formatBillingDate(at, { dateStyle: 'medium', timeStyle: 'short' }, locale.value)
  /** What an offer gave: a pause of some months, a cheaper plan, or a win-back discount. */
  const offerText = (row: SaveOfferRow) => row.kind === 'pause'
    ? t('billing.offers.pause', { count: row.months ?? 1 })
    : row.kind === 'downgrade'
      ? t('billing.offers.downgrade', { plan: row.plan ?? '' })
      : t('billing.offers.discount', { discount: row.discount ?? '' })
  const reasonText = (reason: string) => valueLabel(reasons, 'cancelFlow', 'reasons', reason)
  /** A consent's price as the checkout showed it: "€9.00 every month". */
  const priceText = (row: ConsentRow) => {
    const interval = ['day', 'week', 'month', 'year'].includes(row.interval) ? row.interval : 'month'
    return t('billing.price', {
      amount: formatBillingAmount(row.amount, row.currency, locale.value),
      every: t(`billing.every.${interval}` as LabelKey<BackendLabels['admin']>, { count: row.intervalCount }),
    })
  }

  return {
    id,
    t,
    errorMessage,
    entity,
    filtered: computed(() => entityId.value !== ''),
    isLoading: computed(() => !signedOut.value && read.isLoading.value),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    error: computed(() => (signedOut.value ? null : read.error.value)),
    data: computed(() => read.data.value ?? null),
    date,
    offerText,
    reasonText,
    priceText,
  }
}
