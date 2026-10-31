<script setup lang="ts">
import type { AuthFormCodeProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/** `<AuthForm>`'s code step: the note that says where the code went, the code field and the button that verifies it. */
defineOptions({ name: 'AuthFormCode' })
defineProps<AuthFormCodeProps>()
const view = useAuthFormView('AuthFormCode')
const { t } = view.labels
</script>

<template>
  <form
    data-auth="step-verify-code"
    @submit.prevent="flow.verifyCode()"
  >
    <!-- A polite status: the step change is silent otherwise, and the address is the one thing worth hearing before typing the code. -->
    <p
      :id="view.sentId"
      data-auth="sent-note"
      role="status"
      aria-live="polite"
    >
      {{ t('sent', { email: flow.email.value }) }}
    </p>
    <label data-auth="label-otp">
      {{ t('code') }}
      <input
        v-model="flow.otp.value"
        data-auth="input-otp"
        v-bind="flow.bind.codeInput"
      >
    </label>
    <button
      data-auth="submit"
      v-bind="flow.bind.submit"
    >
      {{ flow.isPending.value ? t('verifying') : t('verify') }}
    </button>
    <button
      data-auth="back"
      v-bind="flow.bind.back"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
