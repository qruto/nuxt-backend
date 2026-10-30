import type { CancellationReason } from './base.js'

// The Revenue view's read (`getRevenue`, analytics): the billing provider's
// own metrics, read live when an administrator asks, in the package's
// neutral words. Nothing here is stored.

/** How the periods of a read are cut: per day, week or month, as the provider counts them (in UTC). */
export type RevenueInterval = 'day' | 'week' | 'month'

/** Every interval a read may ask for. */
export const REVENUE_INTERVALS = ['day', 'week', 'month'] as const satisfies readonly RevenueInterval[]

/**
 * The longest window one read covers, in days: a year and a day, so "the
 * last 12 months" fits whatever the calendar does. The provider's own limits
 * per interval are wider.
 */
export const REVENUE_MAX_DAYS = 366

/** One metric a read returns: money in cents, a count, or a rate as a fraction. */
export type RevenueMetric
  = | 'monthlyRecurringRevenue'
    | 'annualRecurringRevenue'
    | 'revenue'
    | 'netRevenue'
    | 'activeSubscriptions'
    | 'newSubscriptions'
    | 'renewedSubscriptions'
    | 'churnedSubscriptions'
    | 'canceledSubscriptions'
    | 'churnRate'
    | 'checkouts'
    | 'succeededCheckouts'
    | 'checkoutsConversion'
    | 'lifetimeValue'
    | 'costs'
    | 'costPerUser'
    | 'grossMargin'
    | 'grossMarginPercentage'

/**
 * The metrics a read returns, each by its neutral name. Money is in the
 * currency's smallest unit (cents), as the provider counts it, and may carry
 * a fraction of a cent for costs; a rate is a fraction (0.05 is 5%).
 */
export const REVENUE_METRICS = {
  monthlyRecurringRevenue: 'money',
  annualRecurringRevenue: 'money',
  revenue: 'money',
  netRevenue: 'money',
  activeSubscriptions: 'count',
  newSubscriptions: 'count',
  renewedSubscriptions: 'count',
  churnedSubscriptions: 'count',
  canceledSubscriptions: 'count',
  churnRate: 'rate',
  checkouts: 'count',
  succeededCheckouts: 'count',
  checkoutsConversion: 'rate',
  lifetimeValue: 'money',
  costs: 'money',
  costPerUser: 'money',
  grossMargin: 'money',
  grossMarginPercentage: 'rate',
} as const satisfies Record<RevenueMetric, 'money' | 'count' | 'rate'>

/** A value of every metric; `null` where the provider has none (a margin before any cost was reported). */
export type RevenueValues = Record<RevenueMetric, number | null>

/** One period of a read: when it starts, and its values. */
export interface RevenuePeriod extends RevenueValues {
  /** The period's first moment, in epoch milliseconds. */
  at: number
}

/** What one metered feature consumed over a read's window. */
export interface MeterUsage {
  /** The meter's key in the billing catalog: `credits`. */
  meter: string
  /** What it consumed over the whole window, in the meter's own units. */
  total: number
  /** What it consumed in each period. */
  periods: Array<{ at: number, quantity: number }>
}

/** Why people cancelled over the window, and what the cancel flow saved. */
export interface RevenueCancellations {
  /** Cancellations per reason the cancel flow asks about, as the provider counted them. */
  reasons: Record<CancellationReason, number>
  /** The cancel flow's save offers made in the window, and how many of them were accepted. */
  saveOffers: {
    made: number
    accepted: number
    /** The window held more offers than one read counts: the counts cover its oldest ones. */
    truncated: boolean
  }
}

/** What `getRevenue` answers: the provider's metrics over a window, per period and in total. */
export interface RevenueReport {
  /** The window's first moment, in epoch milliseconds: the start of its first UTC day. */
  since: number
  /** The window's end: the end of its last UTC day. */
  until: number
  interval: RevenueInterval
  /** Each metric over the whole window. */
  totals: RevenueValues
  /** Each metric per period, oldest first. */
  periods: RevenuePeriod[]
  cancellations: RevenueCancellations
  /** Usage per meter of the billing catalog, credits included. */
  meters: MeterUsage[]
}

/** What `getRevenue` takes. */
export interface RevenueOptions {
  /** The window's start, in epoch milliseconds: read from the start of its UTC day. */
  since: number
  /** The window's end, in epoch milliseconds: read to the end of its UTC day. Default: now. */
  until?: number
  /** How the periods are cut. Default `day`. */
  interval?: RevenueInterval
}
