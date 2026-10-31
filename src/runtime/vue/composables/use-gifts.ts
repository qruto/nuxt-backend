import { computed, type ComputedRef, inject } from 'vue'
import { useAction, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'
import { openProviderUrl } from '../utils/open-url'
import { createGiftCheckout, notConfigured } from './billing-provider'
import type { BillingApi, GiftOptions, ReceivedGift, SentGift } from './use-billing'

export interface UseGiftsOptions {
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
}

/** Per-call options for {@link UseGiftsReturn.claim}. */
export interface ClaimGiftOptions {
  /** Where the provider's $0 checkout returns to, when the pack needs one. Defaults to the current URL. */
  successUrl?: string
  /** Open that checkout in the same tab instead of a new one. */
  redirect?: boolean
  /**
   * The workspace to receive the gift into, one the person manages (an owner
   * or an admin of it). Omitted, it goes to their personal workspace. A plan
   * pass goes only to a workspace on the free plan.
   */
  workspaceId?: string
}

/** Per-call options for {@link UseGiftsReturn.send}. */
export interface SendGiftOptions extends GiftOptions {
  /** Who receives the gift. Never your own address. */
  recipientEmail: string
  /** For a plan pass: how many months, one of the lengths the plan offers (`gift: { months }` in the catalog). Leave it out for a credit pack. */
  months?: number
  /** When the notice goes out and the recipient may claim, up to a year ahead. The purchase is paid at once. */
  deliverAt?: Date | number
}

export interface UseGiftsReturn {
  /** The delivered gifts addressed to the signed-in user's email: waiting and claimed, or `undefined` while loading. */
  received: ComputedRef<ReceivedGift[] | undefined>
  /** Gifts that are delivered but not yet claimed (ready to receive). */
  unclaimed: ComputedRef<ReceivedGift[]>
  /** The gifts the signed-in user sent, newest first: scheduled, delivered, claimed or refunded. `undefined` while loading. */
  sent: ComputedRef<SentGift[] | undefined>
  /** `true` until the gift lists have loaded (always `false` when signed out, and once a read failed). */
  isLoading: ComputedRef<boolean>
  /** `true` while a send, a claim or a change to a sent gift runs. */
  isPending: ComputedRef<boolean>
  /** Why the last action failed, else why a gift list could not be read, else `null`. */
  error: ComputedRef<BackendError | null>
  /**
   * Buy a gift for someone else and open the purchaser's checkout, resolving
   * with its URL: a credit pack by its catalog key, or a plan as a pass with
   * `months`. Rejects on failure, which `error` also holds.
   */
  send: (item: string, options: SendGiftOptions) => Promise<string>
  /**
   * Claim one gift into a workspace the signed-in user manages (their
   * personal one by default). The session's email must be verified. Resolves
   * `true` when the server confirmed the claim: the credits or the plan
   * arrive a moment later, reactively. Resolves `false` after opening the
   * provider's $0 checkout, for a pack that asks for checkout fields. Rejects
   * with the refusal on failure, which `error` also holds.
   */
  claim: (giftId: string, options?: ClaimGiftOptions) => Promise<boolean>
  /** Send a sent gift's notice again. Refused once it is claimed or refunded, and more than once an hour. */
  resend: (giftId: string) => Promise<void>
  /** Address an unclaimed gift to someone else, under the same checks as a new gift. */
  changeRecipient: (giftId: string, recipientEmail: string) => Promise<void>
  /** Move the delivery date of a gift not delivered yet. A date that is now delivers it at once. */
  reschedule: (giftId: string, deliverAt: Date | number) => Promise<void>
  /** Cancel an unclaimed gift and refund the purchase in full. Needs a recent sign-in (`reauthentication_required` otherwise): wrap it in `useReauthentication().withReauthentication`. */
  cancel: (giftId: string) => Promise<void>
}

/**
 * Gifts, from both sides. A gift is a credit pack or a plan pass someone
 * paid for on their own billing account; the recipient receives it by
 * claiming it, which grants the credits or the plan to a workspace they
 * manage. Nothing is claimed without the recipient asking — show a "Receive"
 * button, or the `gift` notice of `<BackendNotices>`. The purchaser sees what
 * they sent and, until it is claimed, can resend its notice, change its
 * recipient or date, or cancel it for a refund. The lists never throw (a
 * failed read shows in `error`); the actions reject on failure.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const gifts = useGifts()
 * </script>
 * <template>
 *   <div v-for="gift in gifts.unclaimed.value" :key="gift.id">
 *     A gift from {{ gift.purchaserName ?? 'someone' }}
 *     <button @click="gifts.claim(gift.id)">Receive</button>
 *   </div>
 * </template>
 * ```
 */
export function useGifts(options: UseGiftsOptions = {}): UseGiftsReturn {
  const billing = useBackendNamespace<BillingApi>('billing', 'useGifts', options.api)

  // Gate the queries on auth state, read via `inject` (not `useConvexAuth`,
  // which throws) so `useGifts` still works without the auth integration.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)

  const read = billing.getReceivedGifts
    ? useLiveQuery(billing.getReceivedGifts, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<ReceivedGift[] | null>()
  const received = computed<ReceivedGift[] | undefined>(() => {
    // Signed out, or without the query deployed, there is nothing to list.
    if (signedOut.value || !billing.getReceivedGifts) return []
    // Server-side null = claimless caller (auth handshake) — treat as empty.
    return read.data.value === null ? [] : read.data.value
  })
  const sentRead = billing.getSentGifts
    ? useLiveQuery(billing.getSentGifts, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<SentGift[] | null>()
  const sent = computed<SentGift[] | undefined>(() => {
    if (signedOut.value || !billing.getSentGifts) return []
    return sentRead.data.value === null ? [] : sentRead.data.value
  })

  const unclaimed = computed(() => (received.value ?? []).filter(gift => gift.status === 'paid'))

  const runClaim = billing.claimGift ? useAction(billing.claimGift) : null
  const runResend = billing.resendGift ? useAction(billing.resendGift) : null
  const runChange = billing.changeGiftRecipient ? useAction(billing.changeGiftRecipient) : null
  const runReschedule = billing.rescheduleGift ? useAction(billing.rescheduleGift) : null
  const runCancel = billing.cancelGift ? useAction(billing.cancelGift) : null
  const checkout = createGiftCheckout(billing)
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  const claim = (giftId: string, claimOptions: ClaimGiftOptions = {}): Promise<boolean> => run(async () => {
    if (!runClaim) {
      throw new Error(
        '[nuxt-backend] Gift claiming is unavailable — ensure `billing.ts` re-exports `claimGift` '
        + 'from setupBilling().functions, or pass `{ api }` to useGifts().',
      )
    }
    const successUrl = claimOptions.successUrl ?? (typeof window === 'undefined' ? undefined : window.location.href)
    const { url } = await runClaim({ giftId, ...(successUrl ? { successUrl } : {}), ...(claimOptions.workspaceId ? { workspaceId: claimOptions.workspaceId } : {}) })
    if (url === null) return true
    openProviderUrl(url, claimOptions.redirect)
    return false
  })

  return {
    received,
    unclaimed,
    sent,
    isLoading: computed(() => !signedOut.value && (read.isLoading.value || sentRead.isLoading.value)),
    isPending,
    error: computed(() => failure.value ?? read.error.value ?? sentRead.error.value),
    send: (item, sendOptions) => run(() => checkout(item, sendOptions)),
    claim,
    resend: giftId => run(async () => {
      if (!runResend) notConfigured('resend a gift')
      await runResend({ giftId })
    }),
    changeRecipient: (giftId, recipientEmail) => run(async () => {
      if (!runChange) notConfigured('change a gift\'s recipient')
      await runChange({ giftId, recipientEmail })
    }),
    reschedule: (giftId, deliverAt) => run(async () => {
      if (!runReschedule) notConfigured('reschedule a gift')
      await runReschedule({ giftId, deliverAt: new Date(deliverAt).getTime() })
    }),
    cancel: giftId => run(async () => {
      if (!runCancel) notConfigured('cancel a gift')
      await runCancel({ giftId })
    }),
  }
}
