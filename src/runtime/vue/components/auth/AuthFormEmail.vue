<script setup lang="ts">
import type { AuthFormEmailProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/** `<AuthForm>`'s email step: the email field and the button that sends a code. The name is asked once the account exists, at `/welcome`. */
defineOptions({ name: 'AuthFormEmail' })
defineProps<AuthFormEmailProps>()
const view = useAuthFormView('AuthFormEmail')
const { t } = view.labels
</script>

<template>
  <form
    data-auth="step-request-code"
    @submit.prevent="flow.sendCode()"
  >
    <!-- The field the browser offers saved passkeys in (the flow's `autofill`). -->
    <label data-auth="label-email">
      {{ t('email') }}
      <input
        v-model="flow.email.value"
        data-auth="input-email"
        v-bind="flow.bind.emailInput"
      >
    </label>
    <!-- Unavailable until the address reads as one; busy while the code is sent. -->
    <button
      data-auth="submit"
      v-bind="flow.bind.submit"
      :disabled="!flow.isPending.value && !flow.emailValid.value"
    >
      {{ flow.isPending.value ? t('sending') : t('sendCode') }}
    </button>
    <button
      data-auth="back"
      v-bind="flow.bind.back"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
