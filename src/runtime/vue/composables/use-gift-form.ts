import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue'
import { navigateTo, useRoute, useRouter, useState } from '#imports'
import type { PricedGiftLength, PricedPack, PricedPlan } from '../../../convex/integrations/billing/types/records.js'
import { useAuthSession } from '../utils/auth-session'
import { useActiveLocale } from '../utils/active-locale'
import { failureOf, type BackendError } from '../utils/backend-error'
import { onSite } from '../utils/pricing-bindings'
import { formatBillingAmount } from './billing-format'
import { useBackendPagePath } from './use-backend-page-path'
import { useGifts } from './use-gifts'
import { usePricing } from './use-pricing'

/** What a gift holds: a credit pack, or a plan for a number of months (a pass). */
export type GiftKind = 'pack' | 'pass'

/** The fields a refusal of a gift can name, as the form marks them. */
export type GiftField = 'recipientEmail' | 'message' | 'deliverAt'

/** The longest note a gift carries, as the server takes it. */
export const GIFT_MESSAGE_MAX = 500

/** How many days ahead a gift may be dated, as the server takes it (a year and a day, so a year ahead always fits). */
const DELIVER_AHEAD_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000

/** Options for {@link useGiftForm}. */
export interface UseGiftFormOptions {
  /**
   * Where the purchaser returns once paid: a path on the site or a full URL
   * on its origin. Default: the page the form is on, with `?sent=1`, which
   * the form reads back as {@link UseGiftFormReturn.sent}.
   */
  successUrl?: string
  /** Open the checkout in the same tab (default `true`); `false` opens a new one. */
  redirect?: boolean
}

/** The gift as chosen: what it is and what it costs. */
export interface GiftChoice {
  kind: GiftKind
  /** The pack's catalog key, or the plan's for a pass. */
  key: string
  /** The pack's or the plan's name, as the provider lists it. */
  name: string
  /** For a pass, how many months it holds the plan. */
  months?: number
  /** What it costs, in the currency's smallest unit. */
  amount: number
  /** Lower-case ISO 4217 code. */
  currency: string
  /** That price, formatted in the visitor's locale. */
  price: string
}

/** What {@link useGiftForm} returns. */
export interface UseGiftFormReturn {
  /** What the gift holds; starts as a pass when the address names a plan (`?plan=`), else a pack. */
  kind: Ref<GiftKind>
  /** The kinds on sale: `pack` with a pack to give, `pass` with a giftable plan. */
  kinds: ComputedRef<GiftKind[]>
  /** The credit packs on sale, in catalog order. */
  packs: ComputedRef<PricedPack[]>
  /** The plans a pass can be bought for: paid, on sale, with gift lengths (`gift: { months }` in the catalog). */
  plans: ComputedRef<PricedPlan[]>
  /** The pack chosen, by key: the address's `?pack=`, else the first on sale. */
  pack: Ref<string>
  /** The plan chosen for a pass, by key: the address's `?plan=`, else the first giftable. */
  plan: Ref<string>
  /** The pass's length in months: the address's `?months=`, else the plan's first length. */
  months: Ref<number>
  /** The lengths the chosen plan is gifted for, each at its live price: `PricedPlan.gift.lengths`. */
  lengths: ComputedRef<PricedGiftLength[]>
  /** Who receives it. */
  recipientEmail: Ref<string>
  /** A plain-text note of at most {@link GIFT_MESSAGE_MAX} characters, no links, shown to them in the app. */
  message: Ref<string>
  /** The day the notice goes out, `YYYY-MM-DD`; `''` sends it once paid. */
  deliverOn: Ref<string>
  /** The first day the delivery date takes (today), `YYYY-MM-DD`: a date input's `min`. */
  firstDay: ComputedRef<string>
  /** The last day it takes, a year ahead: a date input's `max`. */
  lastDay: ComputedRef<string>
  /** The gift as chosen, with its price; `null` until something on sale is chosen. */
  choice: ComputedRef<GiftChoice | null>
  /** `true` once the session says someone is signed in: a visitor signs in before paying. */
  isSignedIn: ComputedRef<boolean>
  /** `true` until the pricing has loaded. */
  isLoading: ComputedRef<boolean>
  /** `true` while the checkout opens. */
  isPending: ComputedRef<boolean>
  /** Why the last send failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /** The field that refusal names, to mark it invalid, else `null`. */
  invalidField: ComputedRef<GiftField | null>
  /** `true` after the purchaser came back paid (`?sent=1`, taken off the address), until the next send. */
  sent: Ref<boolean>
  /**
   * Send the gift: a visitor goes to the sign-in page and back to this form
   * with the choice kept (`?pack=`, or `?plan=` and `?months=`); a signed-in
   * person goes to the checkout of `useGifts().send`, paying in the
   * pricing's currency. Resolves `true` once the checkout opened, `false`
   * when there was nothing to send or it went to sign in first. Never
   * rejects: a refusal lands in `error`.
   */
  send: () => Promise<boolean>
}

/** A day as an input of type `date` writes it, in UTC. */
const isoDay = (at: number) => new Date(at).toISOString().slice(0, 10)

/**
 * The gift form without its markup: a credit pack or a plan pass with its
 * length (the lengths the plan is gifted for, at their live prices), the
 * recipient, a note and a delivery day, and the send, which signs a
 * visitor in and brings them back, then opens the purchaser's checkout
 * over `useGifts().send`. The purchaser comes back with `?sent=1`, read as
 * `sent`. What `<GiftForm>` renders, and the packaged `/gifts` page shows.
 *
 * @experimental
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const gift = useGiftForm()
 * </script>
 * <template>
 *   <p v-if="gift.sent.value">Paid. It goes out on the day you picked.</p>
 *   <form @submit.prevent="gift.send()">
 *     <select v-model="gift.pack.value">
 *       <option v-for="pack in gift.packs.value" :key="pack.key" :value="pack.key">{{ pack.name }}</option>
 *     </select>
 *     <input v-model="gift.recipientEmail.value" type="email" required>
 *     <button :aria-disabled="gift.isPending.value || undefined">
 *       Send {{ gift.choice.value?.price }}
 *     </button>
 *   </form>
 * </template>
 * ```
 */
export function useGiftForm(options: UseGiftFormOptions = {}): UseGiftFormReturn {
  const route = useRoute()
  const router = useRouter()
  const gifts = useGifts()
  const pricing = usePricing({ actions: false })
  const auth = useAuthSession()
  const login = useBackendPagePath('login')
  const locale = useActiveLocale()
  const query = (name: string) => (typeof route.query[name] === 'string' ? route.query[name] as string : undefined)

  const packs = computed(() => pricing.packs.value ?? [])
  const plans = computed(() => (pricing.plans.value ?? []).filter(plan => !plan.free && !plan.retired && (plan.gift?.lengths.length ?? 0) > 0))
  const kinds = computed<GiftKind[]>(() => [...(packs.value.length > 0 ? ['pack' as const] : []), ...(plans.value.length > 0 ? ['pass' as const] : [])])

  // What the person (or the address) picked; what the form holds is that
  // when it is on sale, else the first that is. Derived, never written by a
  // watcher: a server render that read the pricing after setup and the
  // browser's hydration then hold the same choice.
  const asked = Number(query('months'))
  const picked = {
    kind: ref<GiftKind>(query('plan') ? 'pass' : 'pack'),
    pack: ref(query('pack') ?? ''),
    plan: ref(query('plan') ?? ''),
    months: ref(Number.isInteger(asked) && asked > 0 ? asked : 0),
  }
  const kind = computed<GiftKind>({
    get: () => (kinds.value.length === 0 || kinds.value.includes(picked.kind.value) ? picked.kind.value : kinds.value[0]!),
    set: (value) => { picked.kind.value = value },
  })
  const pack = computed({
    get: () => (packs.value.some(entry => entry.key === picked.pack.value) ? picked.pack.value : packs.value[0]?.key ?? ''),
    set: (value) => { picked.pack.value = value },
  })
  const plan = computed({
    get: () => (plans.value.some(entry => entry.key === picked.plan.value) ? picked.plan.value : plans.value[0]?.key ?? ''),
    set: (value) => { picked.plan.value = value },
  })
  const recipientEmail = ref('')
  const message = ref('')
  const deliverOn = ref('')
  const sent = ref(false)
  const failure = ref<BackendError | null>(null)
  const pending = ref(false)

  const chosenPlan = computed(() => plans.value.find(entry => entry.key === plan.value))
  const lengths = computed(() => chosenPlan.value?.gift?.lengths ?? [])
  const months = computed({
    get: () => (lengths.value.some(length => length.months === picked.months.value) ? picked.months.value : lengths.value[0]?.months ?? 0),
    set: (value) => { picked.months.value = value },
  })

  const choice = computed<GiftChoice | null>(() => {
    if (kind.value === 'pack') {
      const chosen = packs.value.find(entry => entry.key === pack.value)
      return chosen ? { kind: 'pack', key: chosen.key, name: chosen.name, amount: chosen.amount, currency: chosen.currency, price: formatBillingAmount(chosen.amount, chosen.currency, locale()) } : null
    }
    const length = lengths.value.find(entry => entry.months === months.value)
    return chosenPlan.value && length
      ? { kind: 'pass', key: chosenPlan.value.key, name: chosenPlan.value.name, months: length.months, amount: length.amount, currency: length.currency, price: formatBillingAmount(length.amount, length.currency, locale()) }
      : null
  })

  // Today on the server's clock, carried to the browser: the date input's bounds read the same on both.
  const today = useState('backend:gift-form:today', () => isoDay(Date.now()))
  const lastDay = computed(() => isoDay(Date.parse(today.value) + (DELIVER_AHEAD_DAYS - 1) * DAY_MS))

  // Back from a paid checkout: say so once, and take the flag off the address.
  onMounted(() => {
    if (route.query.sent === undefined) return
    sent.value = true
    const { sent: _sent, ...rest } = route.query
    void router.replace({ path: route.path, query: rest, hash: route.hash })
  })

  /** This page again, with the choice in its address: where a visitor comes back after signing in. */
  const back = () => {
    const kept = { ...route.query }
    delete kept.pack
    delete kept.plan
    delete kept.months
    delete kept.sent
    const chosen = choice.value
    const extra = chosen?.kind === 'pass' ? { plan: chosen.key, months: String(chosen.months) } : chosen ? { pack: chosen.key } : {}
    return router.resolve({ path: route.path, query: { ...kept, ...extra } }).fullPath
  }

  /** Where the checkout returns: the option's, else this page with `?sent=1`. */
  const successUrl = () => {
    if (options.successUrl) return onSite(options.successUrl)
    if (typeof window === 'undefined') return undefined
    return onSite(router.resolve({ path: route.path, query: { ...route.query, sent: '1' } }).fullPath)
  }

  const send = async (): Promise<boolean> => {
    const chosen = choice.value
    if (!chosen || pending.value) return false
    if (!auth.isAuthenticated.value) {
      if (login.value) await navigateTo(`${login.value}?redirect=${encodeURIComponent(back())}`)
      return false
    }
    pending.value = true
    failure.value = null
    sent.value = false
    try {
      const note = message.value.trim()
      const returnTo = successUrl()
      await gifts.send(chosen.key, {
        recipientEmail: recipientEmail.value.trim(),
        ...(note ? { message: note } : {}),
        // The morning of the day picked, in UTC: a day that is today sends it at once.
        ...(deliverOn.value ? { deliverAt: Date.parse(`${deliverOn.value}T09:00:00Z`) } : {}),
        ...(chosen.kind === 'pass' ? { months: chosen.months } : {}),
        ...(pricing.currency.value ? { currency: pricing.currency.value } : {}),
        ...(returnTo ? { successUrl: returnTo } : {}),
        redirect: options.redirect !== false,
      })
      return true
    }
    catch (error) {
      failure.value = gifts.error.value ?? failureOf(error)
      return false
    }
    finally {
      pending.value = false
    }
  }

  return {
    kind,
    kinds,
    packs,
    plans,
    pack,
    plan,
    months,
    lengths,
    recipientEmail,
    message,
    deliverOn,
    firstDay: computed(() => today.value),
    lastDay,
    choice,
    isSignedIn: computed(() => auth.isAuthenticated.value),
    isLoading: pricing.isLoading,
    isPending: computed(() => pending.value),
    error: computed(() => failure.value),
    invalidField: computed(() => {
      const field = (failure.value?.data as { field?: unknown } | undefined)?.field
      return field === 'recipientEmail' || field === 'message' || field === 'deliverAt' ? field : null
    }),
    sent,
    send,
  }
}
