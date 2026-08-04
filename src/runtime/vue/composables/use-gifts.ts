import { computed, type ComputedRef, inject, ref, watch } from 'vue'
import { useAction, useQuery, ConvexAuthStateKey, useConvexNamespace } from 'nuxt-convex-module/client'
import type { BillingApi, ReceivedGift } from './use-billing'

export interface UseGiftsOptions {
  /** Override the injected `api.billing` namespace. */
  api?: BillingApi
  /**
   * Claim paid gifts automatically once the user is signed in (default `true`).
   * This is what makes "gift to an email without an account" complete: the
   * recipient signs up, and their waiting gifts attach on first load.
   */
  autoClaim?: boolean
}

export interface UseGiftsReturn {
  /** Every gift addressed to the signed-in user's email, or `undefined` while loading. */
  received: ComputedRef<ReceivedGift[] | undefined>
  /** Gifts that are paid but not yet claimed (ready to receive). */
  unclaimed: ComputedRef<ReceivedGift[]>
  /** `true` until the gift list has loaded (always `false` when signed out). */
  isLoading: ComputedRef<boolean>
  /** `true` while an auto- or manual claim is in flight. */
  isClaiming: ComputedRef<boolean>
  /**
   * Claim a specific gift (by id) or every claimable gift (no argument).
   * Resolves with the number of gifts attached; entitlements/credits refresh
   * reactively right after.
   */
  claim: (giftId?: string) => Promise<number>
}

/**
 * Gifts addressed to the signed-in user, with automatic claiming. A gift is a
 * checkout someone else paid for this user's email; once paid it either
 * attached automatically (recipient already had an account) or waits here —
 * and `useGifts` claims it on first authenticated load (disable via
 * `autoClaim: false` to show an explicit "receive" button instead, e.g. with
 * the packaged `GiftClaimBanner` component).
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const gifts = useGifts({ autoClaim: false })
 * </script>
 * <template>
 *   <div v-for="gift in gifts.unclaimed.value" :key="gift.id">
 *     🎁 from {{ gift.purchaserName ?? 'someone' }}
 *     <button @click="gifts.claim(gift.id)">Receive</button>
 *   </div>
 * </template>
 * ```
 */
export function useGifts(options: UseGiftsOptions = {}): UseGiftsReturn {
  const billing = (options.api ?? useConvexNamespace<BillingApi>('billing') ?? {}) as BillingApi
  const autoClaim = options.autoClaim ?? true

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

  const claim = async (giftId?: string): Promise<number> => {
    if (!runClaim) {
      throw new Error(
        '[nuxt-backend] Gift claiming is unavailable — ensure `billing.ts` re-exports `claimGift` '
        + 'from setupBilling().functions, or pass `{ api }` to useGifts().',
      )
    }
    claiming.value = true
    try {
      const { claimed } = await runClaim(giftId ? { giftId } : {})
      return claimed
    }
    finally {
      claiming.value = false
    }
  }

  if (autoClaim && runClaim) {
    // Claim once per session load: the first time an authenticated user is
    // seen holding paid-but-unclaimed gifts. Guarded so re-renders and query
    // refreshes don't double-claim (the server is idempotent regardless).
    let attempted = false
    watch(unclaimed, async (gifts) => {
      if (attempted || claiming.value || gifts.length === 0) return
      attempted = true
      try {
        await claim()
      }
      catch (error) {
        console.warn('[nuxt-backend] Auto-claiming gifts failed — showing them as unclaimed instead.', error)
      }
    }, { immediate: true })
  }

  return {
    received,
    unclaimed,
    isLoading: computed(() => !signedOut.value && received.value === undefined),
    isClaiming: computed(() => claiming.value),
    claim,
  }
}
