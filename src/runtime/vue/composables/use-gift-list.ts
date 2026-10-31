import { computed, type ComputedRef, ref, type Ref, toValue, type MaybeRefOrGetter } from 'vue'
import { formatBillingDate } from './billing-format'
import type { ReceivedGift, SentGift } from './use-billing'
import { useGifts } from './use-gifts'
import { type LabelGroupOverrides, refusalText, useLabels } from './use-labels'
import { usePricing } from './use-pricing'
import { useReauthentication } from './use-reauthentication'
import { useWorkspace } from './use-workspace'

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

/** What the gifts page's markup binds to. */
export interface UseGiftListReturn {
  state: ComputedRef<GiftListState>
  received: ComputedRef<ReceivedGiftView[]>
  sent: ComputedRef<SentGiftView[]>
  /** The workspaces a received gift can go into: the ones the person manages. Empty when there is nothing to choose. */
  workspaces: ComputedRef<Array<{ id: string, name: string }>>
  /** The workspace chosen to receive into, per gift; `''` is the personal workspace. */
  target: Ref<Record<string, string>>
  /** Why the last action failed, in words, or `null`. */
  error: ComputedRef<string | null>
  /** The outcome of the last action in words, for a polite status. */
  announcement: Ref<string>
  /** The gift an action is running for, or `null`. */
  busy: Ref<string | null>
  claim: (giftId: string) => Promise<void>
  resend: (giftId: string) => Promise<void>
  changeRecipient: (giftId: string, recipientEmail: string) => Promise<boolean>
  reschedule: (giftId: string, deliverAt: string) => Promise<boolean>
  cancel: (giftId: string) => Promise<void>
  labels: ReturnType<typeof useLabels<'gift'>>
}

/**
 * The gifts page without its markup: what a person received and sent, with
 * names, dates and states in their language, and every action over
 * `useGifts()`, a cancel behind a recent sign-in. State and actions; the
 * `/gifts` page's `<GiftList>` is this with the package's markup.
 *
 * @internal
 */
export function useGiftList(overrides?: MaybeRefOrGetter<LabelGroupOverrides<'gift'> | undefined>): UseGiftListReturn {
  const gifts = useGifts()
  const workspace = useWorkspace()
  const pricing = usePricing()
  const labels = useLabels('gift', () => toValue(overrides))
  const { t, locale } = labels
  const { withReauthentication } = useReauthentication()

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

  /** Run one action for one gift: its outcome in words for a polite status, its refusal in words for an alert. */
  async function act<T>(giftId: string, done: string, call: () => Promise<T>): Promise<T | undefined> {
    if (busy.value !== null) return undefined
    busy.value = giftId
    failure.value = null
    announcement.value = ''
    try {
      const result = await call()
      announcement.value = t(done as never)
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
    error: computed(() => failure.value),
    announcement,
    busy,
    labels,
    claim: async (giftId) => {
      await act(giftId, 'claimed', () => gifts.claim(giftId, target.value[giftId] ? { workspaceId: target.value[giftId] } : {}))
    },
    resend: async (giftId) => {
      await act(giftId, 'resent', () => gifts.resend(giftId))
    },
    changeRecipient: async (giftId, recipientEmail) => {
      const done = await act(giftId, 'recipientChanged', () => gifts.changeRecipient(giftId, recipientEmail.trim()).then(() => true))
      return done === true
    },
    reschedule: async (giftId, deliverAt) => {
      const done = await act(giftId, 'rescheduled', () => gifts.reschedule(giftId, new Date(deliverAt)).then(() => true))
      return done === true
    },
    // A cancel moves money back: the person confirms a recent sign-in first.
    cancel: async (giftId) => {
      await act(giftId, 'canceled', () => withReauthentication(() => gifts.cancel(giftId)))
    },
  }
}
