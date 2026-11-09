<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLabels } from '../../composables/use-labels'
import type { WaitlistShareProps } from '../../parts'
import { useWaitlistFormView } from './waitlist-form'

/**
 * A waiting person's share link, inside `WaitlistPlace`: what it does for
 * them (with the cap), the incentive disclosed in the words they share, a
 * read-only field with the link, a button that copies the message and the
 * link, and the friends who joined through it. No names, no leaderboards.
 */
defineOptions({ name: 'WaitlistShare' })
const props = defineProps<WaitlistShareProps>()
const view = useWaitlistFormView()

const { t } = useLabels('waitlist', view.labels)
const copied = ref(false)
const place = computed(() => props.waitlist.place.value)

/** The link a friend opens: the form's page with the person's code (`useWaitlist().shareLink`). */
const link = computed(() => props.waitlist.shareLink.value ?? '')

async function copy() {
  try {
    await navigator.clipboard.writeText(`${t('shareText')} ${link.value}`)
    copied.value = true
  }
  catch {
    copied.value = false
  }
}
</script>

<template>
  <section
    v-if="link"
    data-waitlist="share"
  >
    <h3 data-waitlist="share-title">
      {{ t('shareTitle') }}
    </h3>
    <p data-waitlist="share-intro">
      {{ t('shareIntro', { cap: place?.cap ?? 0 }) }} {{ t('shareText') }}
    </p>
    <label data-waitlist="share-label">
      {{ t('shareLink') }}
      <input
        data-waitlist="share-link"
        type="text"
        readonly
        :value="link"
      >
    </label>
    <button
      type="button"
      data-waitlist="copy"
      @click="copy"
    >
      {{ copied ? t('copied') : t('copy') }}
    </button>
    <p
      v-if="place && place.friends > 0"
      data-waitlist="friends"
      role="status"
    >
      {{ t('friends', { count: place.friends }) }}
    </p>
  </section>
</template>
