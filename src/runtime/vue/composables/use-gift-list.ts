import { computed, type ComputedRef, ref, type Ref, toValue, type MaybeRefOrGetter } from 'vue'
import { formatBillingDate } from './billing-format'
import type { ReceivedGift, SentGift } from './use-billing'
import { useGifts } from './use-gifts'
import { type LabelGroupOverrides, refusalText, useLabels } from './use-labels'
import { usePricing } from './use-pricing'
import { useReauthentication } from './use-reauthentication'
import { useWorkspace } from './use-workspace'
import { giftDeliveryTime, isGiftDay, useGiftDays } from '../utils/gift-days'
import { useMeterUnit } from '../utils/meter-unit'

/** One gift the person received, as the page shows it. */
export interface ReceivedGiftView {
  id: string
  /** Who sent it: a name, never an address. */
  sender: string
  /** What it is: the pack's name, or "3 months of Pro". */
  what: string
  message?: string
  /** `'paid'` (waiting for them) or `'claimed'`. */
  status: ReceivedGift['status']
  statusText: string
  /** Delivered on, in the reader's language. */
  dateText: string
  claimable: boolean
}

/** One gift the person sent, as the page shows it, and what they may still do to it. */
export interface SentGiftView {
  id: string
  what: string
  recipient: string
  message?: string
  status: SentGift['status']
  statusText: string
  /** The date that matters for its state: when it arrives, when it was delivered or received. */
  dateText: string
  canResend: boolean
  canChange: boolean
  canReschedule: boolean
  canCancel: boolean
}

/** Where the lists stand. */
export type GiftListState = 'loading' | 'empty' | 'ready' | 'pending' | 'error'

/**
 * How a claim went: `'claimed'`, the server confirmed it (the credits or
 * the plan arrive reactively); `'opened'`, the provider's $0 checkout opened
 * in a new tab for a pack that asks for checkout fields, the last step
 * before the gift lands.
 */
export type GiftClaimOutcome = 'claimed' | 'opened'

/** Options for {@link useGiftList}. */
export interface UseGiftListOptions {
  /** Copy for the list, over `appConfig.backend.labels.gift` and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'gift'> | undefined>
}

/** What the gifts page's markup binds to. */
export interface UseGiftListReturn {
  state: ComputedRef<GiftListState>
  received: ComputedRef<ReceivedGiftView[]>
  sent: ComputedRef<SentGiftView[]>
  /** The workspaces a received gift can go into: the ones the person manages. Empty when there is nothing to choose. */
  workspaces: ComputedRef<Array<{ id: string, name: string }>>
  /** The workspace chosen to receive into, per gift; `''` is the personal workspace. */
  target: Ref<Record<string, string>>
  /** Why the last action failed, else why the gifts could not be read, in words, or `null`. */
  error: ComputedRef<string | null>
  /** The outcome of the last action in words, for a polite status. */
  announcement: Ref<string>
  /** The gift an action is running for, or `null`. */
  busy: Ref<string | null>
  /**
   * Receive one gift into the workspace in `target` (the personal one by
   * default), announcing it: `claimedPass` for a plan pass, `claimed` for a
   * pack, `claimOpened` when the last step opened in a new tab. Resolves
   * that outcome, or `null` when another action was running or the claim
   * was refused (in `error`).
   */
  claim: (giftId: string) => Promise<GiftClaimOutcome | null>
  resend: (giftId: string) => Promise<void>
  changeRecipient: (giftId: string, recipientEmail: string) => Promise<boolean>
  /**
   * Move a scheduled gift's delivery, the way a new gift is dated: a day
   * (`YYYY-MM-DD`, as a date input between `firstDay` and `lastDay`
   * writes it) goes out at 09:00 the purchaser's time, as `useGiftForm`
   * sends one; a moment (a `datetime-local` value, a `Date`) goes out
   * then. A day now or past delivers it at once; one past the server's
   * year ahead is refused (`invalid_input` on `deliverAt`, in `error`).
   * Resolves whether it went through.
   */
  reschedule: (giftId: string, deliverAt: string | Date) => Promise<boolean>
  /**
   * The first day a reschedule takes, `YYYY-MM-DD`: a date input's `min`.
   * Today in the purchaser's own calendar once the page is on screen, as
   * `useGiftForm().firstDay` reads it.
   */
  firstDay: ComputedRef<string>
  /** The last day it takes, a year after the first, inside the server's window: a date input's `max`. */
  lastDay: ComputedRef<string>
  cancel: (giftId: string) => Promise<void>
  labels: ReturnType<typeof useLabels<'gift'>>
}

/**
 * The gift lists without their markup: what a person received and sent,
 * with names, dates and states in their language, and every action over
 * `useGifts()`, a cancel behind a recent sign-in. Actions never reject:
 * their outcome is `announcement`, their refusal `error`, both in words.
 * `<GiftList>`, on the `/gifts` page, is this with the package's markup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const list = useGiftList()
 * </script>
 * <template>
 *   <article v-for="gift in list.received.value" :key="gift.id">
 *     {{ gift.what }}, from {{ gift.sender }}
 *     <button v-if="gift.claimable" @click="list.claim(gift.id)">Receive</button>
 *   </article>
 * </template>
 * ```
 */
export function useGiftList(options: UseGiftListOptions = {}): UseGiftListReturn {
  const gifts = useGifts()
  const workspace = useWorkspace()
  const pricing = usePricing()
  const labels = useLabels('gift', () => toValue(options.labels))
  const unit = useMeterUnit()
  const { t, locale } = labels
  const { withReauthentication } = useReauthentication()
  // The days a gift may be dated for, as a new gift reads them.
  const { firstDay, lastDay } = useGiftDays()

  const target = ref<Record<string, string>>({})
  const announcement = ref('')
  const busy = ref<string | null>(null)
  const failure = ref<string | null>(null)

  const nameOf = (key: string | undefined): string => {
    if (!key) return ''
    const named = [...(pricing.plans.value ?? []), ...(pricing.packs.value ?? [])].find(entry => entry.key === key)
    return named?.name ?? key
  }
  const whatOf = (gift: { pack?: string, plan?: string, months?: number, item?: string }): string =>
    gift.plan && gift.months ? t('itemPass', { count: gift.months, plan: nameOf(gift.plan) }) : t('itemPack', { name: nameOf(gift.pack ?? gift.item) })
  const date = (at: number | undefined): string => (at === undefined ? '' : formatBillingDate(at, { dateStyle: 'medium' }, locale.value))

  const received = computed<ReceivedGiftView[]>(() => (gifts.received.value ?? []).map(gift => ({
    id: gift.id,
    sender: gift.purchaserName || t('someone'),
    what: whatOf(gift),
    ...(gift.message ? { message: gift.message } : {}),
    status: gift.status,
    statusText: t(gift.status === 'claimed' ? 'status.claimed' : 'status.paid'),
    dateText: date(gift.deliveredAt ?? gift.paidAt ?? gift.createdAt),
    claimable: gift.status === 'paid',
  })))

  const sent = computed<SentGiftView[]>(() => (gifts.sent.value ?? []).map((gift) => {
    const open = gift.status === 'scheduled' || gift.status === 'delivered'
    return {
      id: gift.id,
      what: whatOf(gift),
      recipient: gift.recipientEmail,
      ...(gift.message ? { message: gift.message } : {}),
      status: gift.status,
      statusText: t(`status.${gift.status}`),
      dateText: gift.status === 'scheduled'
        ? t('deliverOn', { date: date(gift.deliverAt) })
        : gift.status === 'claimed' ? t('claimedOn', { date: date(gift.claimedAt) }) : gift.status === 'delivered' ? t('deliveredOn', { date: date(gift.deliveredAt) }) : t('sentOn', { date: date(gift.createdAt) }),
      canResend: gift.status === 'delivered',
      canChange: open,
      canReschedule: gift.status === 'scheduled',
      canCancel: open,
    }
  }))

  // Only a workspace the person manages takes a gift; a person with one workspace has nothing to choose.
  const workspaces = computed(() => workspace.workspaces.value.length > 1 ? workspace.workspaces.value.map(entry => ({ id: entry.id, name: entry.name })) : [])

  const state = computed<GiftListState>(() => {
    if (gifts.isLoading.value) return 'loading'
    if (gifts.error.value && received.value.length === 0 && sent.value.length === 0) return 'error'
    if (gifts.isPending.value) return 'pending'
    return received.value.length === 0 && sent.value.length === 0 ? 'empty' : 'ready'
  })

  /** Run one action for one gift: its outcome in words for a polite status (the label `done` names, or picks from the result), its refusal in words for an alert. */
  async function act<T>(giftId: string, done: string | ((result: T) => string), call: () => Promise<T>): Promise<T | undefined> {
    if (busy.value !== null) return undefined
    busy.value = giftId
    failure.value = null
    announcement.value = ''
    try {
      const result = await call()
      // A claim's words name what the credits count (`{unit}`).
      announcement.value = t((typeof done === 'function' ? done(result) : done) as never, { unit: unit.word(null) })
      return result
    }
    catch (error) {
      failure.value = refusalText(labels, error, t('actionFailed'))
      return undefined
    }
    finally {
      busy.value = null
    }
  }

  return {
    state,
    received,
    sent,
    workspaces,
    target,
    error: computed(() => failure.value ?? (gifts.error.value ? labels.errorMessage(gifts.error.value) : null)),
    announcement,
    busy,
    labels,
    claim: async (giftId) => {
      const pass = gifts.received.value?.find(gift => gift.id === giftId)?.plan !== undefined
      const outcome = await act<GiftClaimOutcome>(
        giftId,
        result => (result === 'opened' ? 'claimOpened' : pass ? 'claimedPass' : 'claimed'),
        async () => (await gifts.claim(giftId, target.value[giftId] ? { workspaceId: target.value[giftId] } : {}) ? 'claimed' : 'opened'),
      )
      return outcome ?? null
    },
    resend: async (giftId) => {
      await act(giftId, 'resent', () => gifts.resend(giftId))
    },
    changeRecipient: async (giftId, recipientEmail) => {
      const done = await act(giftId, 'recipientChanged', () => gifts.changeRecipient(giftId, recipientEmail.trim()).then(() => true))
      return done === true
    },
    reschedule: async (giftId, deliverAt) => {
      // A day goes out on its morning, the purchaser's time, as a new gift's does; a moment goes out then.
      const at = typeof deliverAt === 'string' && isGiftDay(deliverAt) ? new Date(giftDeliveryTime(deliverAt)) : new Date(deliverAt)
      const done = await act(giftId, 'rescheduled', () => gifts.reschedule(giftId, at).then(() => true))
      return done === true
    },
    firstDay,
    lastDay,
    // A cancel moves money back: the person confirms a recent sign-in first.
    cancel: async (giftId) => {
      await act(giftId, 'canceled', () => withReauthentication(() => gifts.cancel(giftId)))
    },
  }
}
