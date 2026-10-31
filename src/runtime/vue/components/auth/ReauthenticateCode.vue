<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { ReauthenticateCodeProps } from '../../parts'
import { useReauthenticateView } from './reauthenticate'

/** `<ReauthenticateDialog>`'s code step: where the code went, the code field, and verify or back. */
defineOptions({ name: 'ReauthenticateCode' })
const props = defineProps<ReauthenticateCodeProps>()
const view = useReauthenticateView('ReauthenticateCode')
const { t } = view.labels

const invalidCode = () => props.flow.error.value?.code === 'invalid_input' && (props.flow.error.value.data as { field?: unknown }).field === 'otp'
const describedBy = () => [view.sentId, ...(invalidCode() && view.describesError() ? [view.errorId] : [])].join(' ')
</script>

<template>
  <form
    data-reauthenticate="step-verify-code"
    @submit.prevent="view.byPerson(flow.verifyCode)()"
  >
    <p
      :id="view.sentId"
      data-reauthenticate="sent-note"
      role="status"
      aria-live="polite"
    >
      {{ t('sent', { email: flow.email.value ?? '' }) }}
    </p>
    <label data-reauthenticate="label-otp">
      {{ t('code') }}
      <input
        v-model="flow.otp.value"
        data-reauthenticate="input-otp"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        required
        :aria-invalid="invalidCode() ? 'true' : undefined"
        :data-invalid="invalidCode() ? '' : undefined"
        :aria-describedby="describedBy()"
      >
    </label>
    <button
      data-reauthenticate="verify"
      type="submit"
      v-bind="busyAttributes(flow.isPending.value)"
    >
      {{ flow.isPending.value ? t('verifying') : t('verify') }}
    </button>
    <button
      data-reauthenticate="back"
      type="button"
      v-bind="busyAttributes(flow.isPending.value)"
      @click="view.byPerson(flow.back)()"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
