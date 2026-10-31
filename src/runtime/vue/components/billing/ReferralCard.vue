<script setup lang="ts">
import { computed, ref, shallowRef, useId } from 'vue'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { useReferrals } from '../../composables/use-referrals'
import { useAuthSession } from '../../utils/auth-session'

/**
 * A person's referral link, with copy and share buttons and the disclosure of
 * the reward: the link is `/r/<code>` on this site, made the first time
 * the card is read. The share text says what both sides get, as endorsement
 * rules ask; pass `shareText` to say it your own way (keep the incentive in
 * it). Beneath, the friends the link brought by state, and the person's
 * choice to carry their code on the pages they share. Nothing renders for a
 * signed-out visitor. Words come from the `referral` labels;
 * `useReferrals()` is its logic, for a card of your own.
 *
 * @example
 * ```vue
 * <ReferralCard />
 * ```
 */
defineOptions({ name: 'ReferralCard' })
const props = withDefaults(defineProps<{
  /** The text shared beside the link. Default: what both sides get, from the `referral` labels. */
  shareText?: string
  /** Copy for this card, over `appConfig.backend.labels.referral` and the translations. */
  labels?: LabelOverrides<BackendLabels['referral']>
}>(), { shareText: undefined, labels: undefined })
const emit = defineEmits({
  /** The link and its text were copied. */
  copied: (_link: string) => true,
  /** The browser's share sheet was opened with the link. */
  shared: (_link: string) => true,
  /** Something failed: the words the card shows. */
  error: (_message: string) => true,
})
defineSlots<Record<string, never>>()

const { isAuthenticated } = useAuthSession()
const signedOut = computed(() => !isAuthenticated.value)
const referrals = useReferrals()
const { t, errorMessage } = useLabels('referral', () => props.labels)
const id = useId()

const text = computed(() => props.shareText ?? referrals.shareText.value)
// A refused share-pages choice says so beside its box; `error` holds it too,
// but it is no reason to take the link away.
const sharingError = ref<string | null>(null)
const sharingFailure = shallowRef<unknown>(null)
const readFailed = computed(() => referrals.error.value !== null && referrals.error.value !== sharingFailure.value)
const state = computed(() => (readFailed.value ? 'error' : referrals.isLoading.value || !referrals.link.value ? 'loading' : 'ready'))
const yourReward = computed(() => {
  const referrer = referrals.program.value?.referrer
  if (!referrer) return null
  return t('yourReward', {
    reward: referrer.kind === 'pack' ? referrer.name : t('sharerMonths', { count: referrer.months }),
    days: referrals.program.value?.holdDays ?? 0,
  })
})

async function copy() {
  if (await referrals.copy() && referrals.link.value) emit('copied', referrals.link.value)
}
async function share() {
  if (await referrals.share() && referrals.link.value) emit('shared', referrals.link.value)
}
async function toggleSharing(event: Event) {
  const box = event.target as HTMLInputElement
  sharingError.value = null
  try {
    await referrals.setSharePages(box.checked)
  }
  catch (failure) {
    sharingFailure.value = referrals.error.value
    // The choice stays as it was stored: the box shows it again.
    box.checked = referrals.sharePages.value
    sharingError.value = errorMessage(failure) || t('failed')
    emit('error', sharingError.value)
  }
}
</script>

<template>
  <section
    v-if="!signedOut"
    data-referral="root"
    :data-state="state"
    :aria-busy="state === 'loading' || undefined"
    :aria-labelledby="`${id}-title`"
  >
    <h3
      :id="`${id}-title`"
      data-referral="title"
    >
      {{ t('title') }}
    </h3>
    <p
      v-if="state === 'loading'"
      data-referral="loading"
      role="status"
    >
      {{ t('loading') }}
    </p>
    <p
      v-else-if="state === 'error'"
      data-referral="error"
      role="alert"
    >
      {{ t('failed') }}
    </p>
    <template v-else>
      <p data-referral="intro">
        {{ t('intro') }}
      </p>
      <p
        v-if="yourReward"
        data-referral="reward"
      >
        {{ yourReward }}
      </p>
      <label data-referral="link-label">
        {{ t('linkLabel') }}
        <input
          data-referral="link"
          type="text"
          readonly
          :value="referrals.link.value ?? ''"
          :aria-describedby="`${id}-text`"
        >
      </label>
      <p
        :id="`${id}-text`"
        data-referral="text"
      >
        {{ text }}
      </p>
      <div data-referral="actions">
        <button
          type="button"
          data-referral="copy"
          @click="copy"
        >
          {{ referrals.copied.value ? t('copied') : t('copy') }}
        </button>
        <button
          v-if="referrals.canShare.value"
          type="button"
          data-referral="share"
          @click="share"
        >
          {{ t('share') }}
        </button>
      </div>
      <ul
        v-if="referrals.referrals.value && (referrals.referrals.value.claimed + referrals.referrals.value.held + referrals.referrals.value.rewarded) > 0"
        data-referral="counts"
        role="status"
      >
        <li
          v-if="referrals.referrals.value.claimed > 0"
          data-referral="count-claimed"
        >
          {{ t('claimed', { count: referrals.referrals.value.claimed }) }}
        </li>
        <li
          v-if="referrals.referrals.value.held > 0"
          data-referral="count-held"
        >
          {{ t('held', { count: referrals.referrals.value.held }) }}
        </li>
        <li
          v-if="referrals.referrals.value.rewarded > 0"
          data-referral="count-rewarded"
        >
          {{ t('rewarded', { count: referrals.referrals.value.rewarded }) }}
        </li>
      </ul>
      <label data-referral="sharing">
        <input
          type="checkbox"
          data-referral="sharing-input"
          :checked="referrals.sharePages.value"
          :aria-describedby="`${id}-sharing-note`"
          @change="toggleSharing"
        >
        {{ t('sharePages') }}
      </label>
      <p
        :id="`${id}-sharing-note`"
        data-referral="sharing-note"
      >
        {{ t('sharePagesNote') }}
      </p>
      <p
        v-if="sharingError"
        data-referral="sharing-error"
        role="alert"
      >
        {{ sharingError }}
      </p>
    </template>
  </section>
</template>
