import { computed, type ComputedRef, inject, ref } from 'vue'
import { useAction, useQuery, ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useBackendNamespace } from '../utils/namespace'
import { openProviderUrl } from '../utils/open-url'
import type { BillingApi, ReceivedGift } from './use-billing'

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
}

export interface UseGiftsReturn {
  /** The paid and claimed gifts addressed to the signed-in user's email, or `undefined` while loading. */
  received: ComputedRef<ReceivedGift[] | undefined>
  /** Gifts that are paid but not yet claimed (ready to receive). */
  unclaimed: ComputedRef<ReceivedGift[]>
  /** `true` until the gift list has loaded (always `false` when signed out). */
  isLoading: ComputedRef<boolean>
  /** `true` while a claim is in flight. */
  isClaiming: ComputedRef<boolean>
  /**
   * Claim one gift into the signed-in user's own billing account. Resolves
   * `true` when the server confirmed the claim itself: the provider grants
   * the credits a moment later, and they arrive reactively. Resolves `false`
   * after opening the provider's $0 checkout, which the recipient finishes
   * when the pack asks for checkout fields.
   */
  claim: (giftId: string, options?: ClaimGiftOptions) => Promise<boolean>
}

/**
 * Gifts addressed to the signed-in user. A gift is a credit pack someone
 * else paid for on their own billing account; the recipient receives it by
 * claiming it, which grants the credits to their own account through a $0
 * order. Nothing is claimed without the recipient asking — show a "Receive"
 * button, or the packaged `GiftClaimBanner`.
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

  // Gate the query on auth state, read via `inject` (not `useConvexAuth`,
  // which throws) so `useGifts` still works without the auth integration.
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)

  const rawReceived = billing.getReceivedGifts
    ? useQuery(billing.getReceivedGifts, () => (signedOut.value ? 'skip' : {}))
    : computed<ReceivedGift[] | null | undefined>(() => null)
  const received = computed<ReceivedGift[] | undefined>(() => {
    if (signedOut.value) return []
    // Server-side null = claimless caller (auth handshake) — treat as empty.
    return rawReceived.value === null ? [] : rawReceived.value
  })

  const unclaimed = computed(() => (received.value ?? []).filter(gift => gift.status === 'paid'))

  const runClaim = billing.claimGift ? useAction(billing.claimGift) : null
  const claiming = ref(false)

  const claim = async (giftId: string, claimOptions: ClaimGiftOptions = {}): Promise<boolean> => {
    if (!runClaim) {
      throw new Error(
        '[nuxt-backend] Gift claiming is unavailable — ensure `billing.ts` re-exports `claimGift` '
        + 'from setupBilling().functions, or pass `{ api }` to useGifts().',
      )
    }
    claiming.value = true
    try {
      const successUrl = claimOptions.successUrl ?? (typeof window === 'undefined' ? undefined : window.location.href)
      const { url } = await runClaim({ giftId, ...(successUrl ? { successUrl } : {}) })
      if (url === null) return true
      openProviderUrl(url, claimOptions.redirect)
      return false
    }
    finally {
      claiming.value = false
    }
  }

  return {
    received,
    unclaimed,
    isLoading: computed(() => !signedOut.value && received.value === undefined),
    isClaiming: computed(() => claiming.value),
    claim,
  }
}
