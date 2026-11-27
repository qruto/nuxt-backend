<script setup lang="ts">
import { computed } from 'vue'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'
import type { WaitlistPlaceProps } from '../../parts'
import { useWaitlistFormView } from './waitlist-form'

/**
 * A person's place on the waitlist: "You're #48 of 1,204", or, where the
 * waitlist keeps rank private, the day they joined, how far their friends
 * moved them and the next wave; the honest words about how people are
 * admitted, what their link does for them
 * (`WaitlistShare`), and Leave. It follows the list live. No names and no
 * leaderboards are ever shown. `<WaitlistForm>`'s last step, and the body of
 * the `/waitlist` page.
 */
defineOptions({ name: 'WaitlistPlace' })
const props = defineProps<WaitlistPlaceProps>()
const view = useWaitlistFormView()

const { t, errorMessage, locale } = useLabels('waitlist', view.labels)
const loginPath = useBackendPagePath('login')
const place = computed(() => props.waitlist.place.value)
const number = (value: number) => value.toLocaleString(locale.value)
const day = (at: number) => new Date(at).toLocaleDateString(locale.value, { dateStyle: 'long' })
// A wave opens on the UTC day the administrator picked, wherever the person reads it.
const utcDay = (at: number) => new Date(at).toLocaleDateString(locale.value, { dateStyle: 'long', timeZone: 'UTC' })
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** The credit in the largest unit it fills: days, else hours, else minutes (a rule may give less than a day a friend). */
function creditLine(credit: number): string | null {
  if (credit >= DAY_MS) return t('credit', { count: Math.floor(credit / DAY_MS) })
  if (credit >= HOUR_MS) return t('creditHours', { count: Math.floor(credit / HOUR_MS) })
  if (credit >= MINUTE_MS) return t('creditMinutes', { count: Math.floor(credit / MINUTE_MS) })
  return null
}

/**
 * Where rank is private, the person's own facts instead of a place: the
 * day they joined, how far friends moved them, and the planned wave.
 */
const facts = computed(() => {
  const standing = place.value
  if (standing?.status !== 'waiting' || standing.position || !standing.joinedAt) return []
  const lines = [t('joinedOn', { date: day(standing.joinedAt) })]
  const credit = creditLine(standing.credit ?? 0)
  if (credit) lines.push(credit)
  const wave = standing.wave
  if (wave?.included) lines.push(t('waveIn'))
  else if (wave?.friendsShort) lines.push(t('waveShort', { count: wave.friendsShort }))
  if (wave?.opensAt) lines.push(t('waveOpens', { date: utcDay(wave.opensAt) }))
  return lines
})

/** What the person reads first, by where they stand. */
const headline = computed(() => {
  const standing = place.value
  if (standing?.status === 'waiting') return standing.position ? t('placed', { position: number(standing.position), total: number(standing.total) }) : t('placedUnknown')
  if (standing?.status === 'admitted') return t('admitted')
  if (standing?.status === 'declined') return t('declined')
  return standing?.status === 'joined' ? t('joined') : ''
})
</script>

<template>
  <section
    data-waitlist="place"
    :data-state="place?.status ?? 'unknown'"
    :aria-busy="place === undefined || undefined"
  >
    <p
      v-if="headline"
      :data-waitlist="place?.status === 'waiting' ? 'position' : place?.status"
      role="status"
      aria-live="polite"
    >
      {{ headline }}
    </p>
    <a
      v-if="place?.status === 'admitted'"
      data-waitlist="sign-up"
      :href="loginPath ?? undefined"
    >
      {{ t('signUp') }}
    </a>
    <!-- Mounted, empty, before the facts arrive, so the first ones are heard too. -->
    <div
      data-waitlist="facts"
      role="status"
      aria-live="polite"
    >
      <p
        v-for="line in facts"
        :key="line"
        data-waitlist="fact"
      >
        {{ line }}
      </p>
    </div>
    <template v-if="place?.status === 'waiting'">
      <p data-waitlist="disclosure">
        {{ t('disclosure') }}
      </p>
      <WaitlistShare :waitlist="waitlist" />
    </template>
    <p
      v-if="waitlist.error.value"
      data-waitlist="error"
      role="alert"
    >
      {{ errorMessage(waitlist.error.value) }}
    </p>
    <button
      v-if="place && place.status !== 'joined'"
      type="button"
      data-waitlist="leave"
      :aria-disabled="waitlist.isPending.value ? 'true' : undefined"
      @click="waitlist.leave"
    >
      {{ waitlist.isPending.value ? t('leaving') : t('leave') }}
    </button>
  </section>
</template>
