import type { ReceivedGift } from '../../composables/use-billing'
import type { UseCreditsReturn } from '../../composables/use-credits'
import type { PricedPack } from '../../composables/use-pricing'
import type { DeletionNoticeSlotContext } from '../../composables/use-deletion-notice'
import type { LiveAnnouncement } from '../../composables/use-announcements'

export type { DeletionNoticeSlotContext } from '../../composables/use-deletion-notice'

/**
 * The notices, most important first: an administrator's visit (whose
 * account this is outweighs anything else the page says), the app's
 * maintenance, a failed payment, a scheduled deletion, low credits, a gift
 * to claim, then the announcements an administrator published.
 */
export const NOTICE_ORDER = ['impersonation', 'maintenance', 'past-due', 'deletion', 'low-credits', 'gift', 'announcement'] as const

/** A notice of `<BackendNotices>`, by its slot's name. */
export type BackendNotice = (typeof NOTICE_ORDER)[number]

/** What the `impersonation` slot receives. */
export interface ImpersonationNoticeContext {
  /** The account visited, as the session names it. */
  name: string
  /** When the visit ends, epoch ms, or `null` when the session does not say. */
  endsAt: number | null
  /** `true` while the visit is ending. */
  isPending: boolean
  /** End the visit, then reload at the admin console. */
  stop: () => Promise<void>
}

/** What the `maintenance` slot receives. */
export interface MaintenanceNoticeContext {
  /** What the notice says: the administrator's message, else the default sentence. */
  message: string
}

/** What the `past-due` slot receives. */
export interface PastDueNoticeContext {
  /** What the notice says, from the `pastDue` labels. */
  message: string
  /** Open the billing portal, where the payment method is updated. */
  portal: () => Promise<void>
  /** `true` while the portal opens. */
  isPending: boolean
}

/** What the `low-credits` slot receives. */
export interface LowCreditsNoticeContext {
  credits: UseCreditsReturn
  /** Remaining credits (the notice only renders once this is known). */
  balance: number
  /** The balance the notice appears below. */
  threshold: number
  /** Where the default action sends the customer when no pack is preselected. */
  pricingPath: string
  /** The pack the action buys: the smallest that covers the shortfall. */
  preselected: PricedPack | undefined
  /** Whether a top-up checkout is in flight. */
  pending: boolean
  /** Buy the preselected pack (no-op without one). */
  topUp: () => Promise<void>
  /** Hide the notice for the rest of the session. */
  dismiss: () => void
}

/** What the `gift` slot receives. */
export interface GiftNoticeContext {
  /** The gifts waiting to be received. */
  gifts: ReceivedGift[]
  /** Receive one gift by its id. */
  claim: (giftId: string) => Promise<void>
  /** Whether a claim runs. */
  isPending: boolean
}

/** What the `announcement` slot receives. */
export interface AnnouncementNoticeContext {
  /** The live announcements the person has not dismissed, the newest first. */
  announcements: LiveAnnouncement[]
  /** Dismiss one by its id: it goes at once, and stays dismissed for the person. */
  dismiss: (id: string) => Promise<void>
  /** Whether a dismissal is saved. */
  isPending: boolean
}

/**
 * `<BackendNotices>`' slots, one per notice: each replaces that notice and
 * receives its state and actions. An empty slot (`<template #gift />`) turns
 * the notice off.
 */
export interface BackendNoticesSlots {
  /** An administrator's visit: whose account, when the visit ends, and `stop()`. */
  'impersonation': (context: ImpersonationNoticeContext) => unknown
  /** The maintenance switch is on: the administrator's `message`. */
  'maintenance': (context: MaintenanceNoticeContext) => unknown
  /** A renewal payment failed and is retried, for a billing manager: `message`, `portal()` and `isPending`. */
  'past-due': (context: PastDueNoticeContext) => unknown
  /** The account's deletion waits out its grace period: the `deletion`, its `message` with the date, `keep()`, `isPending` and `error`. */
  'deletion': (context: DeletionNoticeSlotContext) => unknown
  /** The credit balance is under the threshold: `balance`, `topUp()` and `dismiss()`. */
  'low-credits': (context: LowCreditsNoticeContext) => unknown
  /** Gifts addressed to the person wait: `gifts`, `claim(giftId)` and `isPending`. */
  'gift': (context: GiftNoticeContext) => unknown
  /** Announcements an administrator published: `announcements`, `dismiss(id)` and `isPending`. */
  'announcement': (context: AnnouncementNoticeContext) => unknown
}

/** Whether an app's slot turns its notice off: an empty slot renders nothing. */
export function turnedOff(slot: ((context: never) => unknown) | undefined, context: unknown): boolean {
  if (!slot) return false
  const nodes = (slot as (context: unknown) => unknown)(context)
  return Array.isArray(nodes) && nodes.length === 0
}
