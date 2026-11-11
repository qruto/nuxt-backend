import { tryOnMounted } from '@vueuse/core'
import { computed, ref, type ComputedRef } from 'vue'
import { tryUseNuxtApp } from '#imports'
import { DELIVER_AHEAD_DAYS } from '../../../convex/integrations/billing/gift-rules.js'
import { usePageClock } from './pricing-bindings'

// The days a gift may go out on, as a new gift (`useGiftForm`) and a
// rescheduled one (`useGiftList`) read them alike: from today in the
// purchaser's own calendar to a year ahead, the server's window, and the
// morning of the day picked, in the purchaser's time zone.

const DAY_MS = 24 * 60 * 60 * 1000
/** The hour of the day picked a dated gift goes out at, in the purchaser's time zone. */
const DELIVERY_HOUR = 9

/** A day as an input of type `date` writes it, in UTC. */
const isoDay = (at: number) => new Date(at).toISOString().slice(0, 10)

/** The same, in the runtime's own time zone: the purchaser's, in their browser. */
function localDay(at: number): string {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Whether a value is a day as an input of type `date` writes it: `YYYY-MM-DD`. */
export function isGiftDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** The moment a dated gift goes out: `DELIVERY_HOUR` on `day` (`YYYY-MM-DD`), in the runtime's own time zone. */
export function giftDeliveryTime(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date!, DELIVERY_HOUR).getTime()
}

/** The first and the last day a gift may be dated for, `YYYY-MM-DD`: a date input's `min` and `max`. */
export interface GiftDays {
  firstDay: ComputedRef<string>
  lastDay: ComputedRef<string>
}

/**
 * The days a gift may be dated for. Today on the page's clock: while
 * hydrating, the server's, in UTC, so the date input's bounds read as the
 * server rendered them; once the page is the browser's (mounted, or entered
 * by a client-side visit), the purchaser's own today, whose 09:00 is theirs
 * too. A UTC day would be yesterday east of UTC, and its 09:00 the evening
 * before far west of it. The last day is a year after the first, which
 * still falls inside the server's window (`DELIVER_AHEAD_DAYS`, 366) from now.
 */
export function useGiftDays(): GiftDays {
  const clock = usePageClock()
  const ownCalendar = ref(import.meta.client && !tryUseNuxtApp()?.isHydrating)
  tryOnMounted(() => {
    ownCalendar.value = true
  })
  const firstDay = computed(() => (ownCalendar.value ? localDay(clock.value) : isoDay(clock.value)))
  return {
    firstDay,
    lastDay: computed(() => isoDay(Date.parse(firstDay.value) + (DELIVER_AHEAD_DAYS - 1) * DAY_MS)),
  }
}
