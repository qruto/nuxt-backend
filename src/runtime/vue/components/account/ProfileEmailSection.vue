<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { ProfileEmailSectionProps } from '../../parts'
import { useProfileView } from './profile-settings'

/**
 * `<ProfileSettings>`'s email change, by a code from each address: the new
 * address, then the code sent to the current one, then the code sent to the
 * new one.
 */
defineOptions({ name: 'ProfileEmailSection' })
const props = defineProps<ProfileEmailSectionProps>()
const view = useProfileView('ProfileEmailSection')
const { t } = view.labels
const hintId = `${view.id}-hint`

/** The code step on screen: where the code went, its submit words and what it runs; `null` on the first step. */
const codeStep = computed(() => {
  const step = props.emailChange.step.value
  if (step === 'confirm-current') {
    return { sentTo: (view.context.value.user?.email as string | undefined) ?? t('currentAddress'), submit: t('confirm'), pending: t('confirming'), run: view.confirmCurrent, hint: t('confirmHint') }
  }
  if (step === 'verify-new') {
    return { sentTo: props.emailChange.newEmail.value.trim(), submit: t('changeEmail'), pending: t('verifying'), run: view.verifyNew, hint: t('verifyHint') }
  }
  return null
})
</script>

<template>
  <form
    v-if="codeStep"
    data-profile="section-email"
    :data-step="emailChange.step.value"
    @submit.prevent="codeStep.run()"
  >
    <label data-profile="label-code">
      {{ t('codeSentTo', { email: codeStep.sentTo }) }}
      <input
        v-model="emailChange.otp.value"
        data-profile="input-code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        required
        v-bind="view.fieldState('otp', hintId)"
      >
    </label>
    <p
      :id="hintId"
      data-profile="hint"
    >
      {{ codeStep.hint }}
    </p>
    <button
      data-profile="submit"
      type="submit"
      v-bind="busyAttributes(emailChange.isPending.value)"
    >
      {{ emailChange.isPending.value ? codeStep.pending : codeStep.submit }}
    </button>
    <button
      data-profile="cancel"
      type="button"
      v-bind="busyAttributes(emailChange.isPending.value)"
      @click="view.cancelChange()"
    >
      {{ t('cancel') }}
    </button>
  </form>
  <form
    v-else
    data-profile="section-email"
    :data-step="emailChange.step.value"
    @submit.prevent="view.startChange()"
  >
    <label data-profile="label-email">
      {{ t('newEmail') }}
      <input
        v-model="emailChange.newEmail.value"
        data-profile="input-email"
        type="email"
        autocomplete="email"
        spellcheck="false"
        required
        v-bind="view.fieldState('email', hintId)"
      >
    </label>
    <p
      :id="hintId"
      data-profile="hint"
    >
      {{ t('emailHint') }}
    </p>
    <button
      data-profile="submit"
      type="submit"
      v-bind="busyAttributes(emailChange.isPending.value)"
    >
      {{ emailChange.isPending.value ? t('changing') : t('changeEmail') }}
    </button>
  </form>
</template>
