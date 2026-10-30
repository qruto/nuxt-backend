<script setup lang="ts">
import OnboardingStepActions from './OnboardingStepActions.vue'
import { computed, ref, useId, watch } from 'vue'
import { useAccount } from '../../composables/use-account'
import { useAuth } from '../../composables/use-auth'
import type { OnboardingProfileProps } from '../../parts'

/** `<OnboardingFlow>`'s first step: the person's name, and optionally a picture, saved to the account. */
defineOptions({ name: 'OnboardingProfile' })
const props = defineProps<OnboardingProfileProps>()
const { t, errorMessage } = props.onboarding.labels
const auth = useAuth()
const user = computed(() => auth.user.value as { name?: string | null, image?: string | null } | null)
const account = useAccount()
const id = useId()

const name = ref(user.value?.name?.trim() ?? '')
const image = ref(user.value?.image ?? '')
const touched = ref(false)
// The session may land after this step does; fill what the person has not typed yet.
watch(user, (now) => {
  if (touched.value || !now) return
  name.value = now.name?.trim() ?? ''
  image.value = now.image ?? ''
}, { immediate: false })

/** A picture is an `https:` address, or nothing. */
const imageValid = computed(() => {
  const value = image.value.trim()
  if (!value) return true
  try {
    return new URL(value).protocol === 'https:'
  }
  catch {
    return false
  }
})
const showImageError = ref(false)
const failure = computed(() => (account.error.value ? errorMessage(account.error.value) : null))

async function save(): Promise<void> {
  showImageError.value = !imageValid.value
  if (showImageError.value || account.isPending.value) return
  const nextName = name.value.trim()
  const nextImage = image.value.trim()
  const changed = nextName !== (user.value?.name?.trim() ?? '') || nextImage !== (user.value?.image ?? '')
  if (changed) {
    try {
      await account.updateProfile({ ...(nextName ? { name: nextName } : {}), image: nextImage || null })
    }
    catch {
      // The failure is on screen in `account.error`; the person stays on the step.
      return
    }
  }
  await props.onboarding.next()
}
</script>

<template>
  <form
    data-onboarding="profile"
    @submit.prevent="save"
  >
    <h2
      :id="`${id}-title`"
      data-onboarding="step-title"
    >
      {{ t('profile.heading') }}
    </h2>
    <p data-onboarding="intro">
      {{ t('profile.intro') }}
    </p>
    <label data-onboarding="label">
      {{ t('profile.name') }}
      <input
        v-model="name"
        data-onboarding="input-name"
        type="text"
        autocomplete="name"
        maxlength="100"
        @input="touched = true"
      >
    </label>
    <label data-onboarding="label">
      {{ t('profile.image') }}
      <input
        v-model="image"
        data-onboarding="input-image"
        type="url"
        inputmode="url"
        autocomplete="photo"
        :aria-invalid="showImageError ? 'true' : undefined"
        :aria-describedby="`${id}-image-hint`"
        @input="touched = true; showImageError = false"
      >
    </label>
    <p
      :id="`${id}-image-hint`"
      data-onboarding="hint"
      :data-invalid="showImageError ? '' : undefined"
      :role="showImageError ? 'alert' : undefined"
    >
      {{ t('profile.imageHint') }}
    </p>
    <p
      v-if="failure"
      data-onboarding="error"
      role="alert"
    >
      {{ failure }}
    </p>
    <OnboardingStepActions
      :onboarding="onboarding"
      submit
      :pending="account.isPending.value"
    />
  </form>
</template>
