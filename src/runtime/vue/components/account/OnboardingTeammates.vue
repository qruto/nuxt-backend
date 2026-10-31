<script setup lang="ts">
import OnboardingStepActions from './OnboardingStepActions.vue'
import { computed, ref, useId } from 'vue'
import { busyAttributes } from '../../a11y'
import { useWorkspace } from '../../composables/use-workspace'
import type { OnboardingTeammatesProps } from '../../parts'

/** `<OnboardingFlow>`'s teammates step: invite people to the workspace by email, one after another. */
defineOptions({ name: 'OnboardingTeammates' })
const props = defineProps<OnboardingTeammatesProps>()
const { t, errorMessage } = props.onboarding.labels
const workspace = useWorkspace()
const id = useId()

const email = ref('')
const invited = ref<string[]>([])
const message = ref('')
const pending = computed(() => workspace.isPending.value)
const failure = computed(() => (workspace.error.value ? errorMessage(workspace.error.value) : null))

async function send(): Promise<void> {
  const address = email.value.trim()
  if (!address || pending.value) return
  try {
    await workspace.invite({ email: address })
  }
  catch {
    // The reason is on screen from `workspace.error`; the address stays to be corrected.
    return
  }
  invited.value = [...invited.value, address]
  message.value = t('teammates.sent', { email: address })
  email.value = ''
}
</script>

<template>
  <div data-onboarding="teammates">
    <h2
      :id="`${id}-title`"
      data-onboarding="step-title"
    >
      {{ t('teammates.heading') }}
    </h2>
    <p data-onboarding="intro">
      {{ t('teammates.intro') }}
    </p>
    <form
      data-onboarding="invite"
      @submit.prevent="send"
    >
      <label data-onboarding="label">
        {{ t('teammates.email') }}
        <input
          v-model="email"
          data-onboarding="input-email"
          type="email"
          autocomplete="off"
          inputmode="email"
        >
      </label>
      <button
        type="submit"
        data-onboarding="send"
        v-bind="busyAttributes(pending)"
      >
        {{ pending ? t('teammates.sending') : t('teammates.send') }}
      </button>
    </form>
    <section
      v-if="invited.length"
      data-onboarding="invited-list"
      :aria-labelledby="`${id}-list`"
    >
      <p
        :id="`${id}-list`"
        data-onboarding="list-title"
      >
        {{ t('teammates.list') }}
      </p>
      <ul data-onboarding="invited">
        <li
          v-for="address in invited"
          :key="address"
          data-onboarding="invited-item"
        >
          {{ address }}
        </li>
      </ul>
    </section>
    <p
      v-if="failure"
      data-onboarding="error"
      role="alert"
    >
      {{ failure }}
    </p>
    <p
      role="status"
      aria-live="polite"
      data-onboarding="status"
    >
      {{ message }}
    </p>
    <OnboardingStepActions :onboarding="onboarding" />
  </div>
</template>
