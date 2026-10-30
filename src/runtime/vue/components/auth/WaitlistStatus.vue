<script setup lang="ts">
/**
 * What the `/waitlist` page shows: the person's place, read from the signed
 * token in the address's fragment (kept there, so the link can be
 * bookmarked), live as the list moves. A link that was not signed here, or
 * an entry that is gone, reads as a dead link.
 *
 * Internal: the page's body, built on `useWaitlist`; the place is the
 * `WaitlistPlace` part, so an app's same-named component shows it here too.
 *
 * @internal
 */
import { computed, onMounted, ref } from 'vue'
import { useLabels } from '../../composables/use-labels'
import { useWaitlist } from '../../composables/use-waitlist'

const waitlist = useWaitlist({ ref: null })
const { t } = useLabels('waitlist')
const asked = ref(false)
const hadToken = ref(false)

onMounted(() => {
  const token = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim()
  if (token) {
    hadToken.value = true
    waitlist.status(token)
  }
  asked.value = true
})

/** The `data-state` of the page: what the person reads now. */
const state = computed(() => {
  // Leave took the entry: the flow went back to its first step.
  if (hadToken.value && waitlist.step.value === 'join') return 'left'
  if (!asked.value || waitlist.isLoading.value) return 'checking'
  // No token in the address, or one that names no entry: the link does not work.
  return waitlist.place.value === undefined ? 'unknown' : 'ready'
})
</script>

<template>
  <section
    data-waitlist="page"
    :data-state="state"
    :aria-busy="state === 'checking' || undefined"
  >
    <p
      v-if="state === 'checking'"
      data-waitlist="status"
      role="status"
      aria-live="polite"
    >
      {{ t('page.checking') }}
    </p>
    <p
      v-else-if="state === 'unknown'"
      data-waitlist="status"
      role="alert"
    >
      {{ t('page.unknown') }}
    </p>
    <p
      v-else-if="state === 'left'"
      data-waitlist="status"
      role="status"
      aria-live="polite"
    >
      {{ t('left') }}
    </p>
    <WaitlistPlace
      v-else
      :waitlist="waitlist"
    />
  </section>
</template>
