<script setup lang="ts">
import { computed } from 'vue'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'
import type { WaitlistPlaceProps } from '../../parts'
import { useWaitlistFormView } from './waitlist-form'

/**
 * A person's place on the waitlist: "You're #48 of 1,204", the honest
 * words about how people are admitted, what their link does for them
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
