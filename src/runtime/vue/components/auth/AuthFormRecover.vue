<script setup lang="ts">
import type { AuthFormRecoverProps } from '../../parts'
import { fieldState, useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s recovery step, for a passkey-only account that lost its
 * passkey: the address and the recovery code. A code that checks signs the
 * person in on the passkey offer, where a new passkey must be saved.
 */
defineOptions({ name: 'AuthFormRecover' })
defineProps<AuthFormRecoverProps>()
const view = useAuthFormView('AuthFormRecover')
const { t } = view.labels
</script>

<template>
  <form
    data-auth="step-recover"
    @submit.prevent="flow.recover()"
  >
    <p data-auth="recover-note">
      {{ t('recoverIntro') }}
    </p>
    <label data-auth="label-email">
      {{ t('email') }}
      <input
        v-model="flow.email.value"
        data-auth="input-email"
        v-bind="flow.bind.emailInput"
      >
    </label>
    <label data-auth="label-recovery-code">
      {{ t('recoveryCode') }}
      <input
        v-model="flow.recoveryCode.value"
        data-auth="input-recovery-code"
        type="text"
        autocomplete="off"
        spellcheck="false"
        required
        v-bind="fieldState(flow, view, 'recoveryCode')"
      >
    </label>
    <button
      data-auth="submit"
      v-bind="flow.bind.submit"
    >
      {{ flow.isPending.value ? t('recovering') : t('recover') }}
    </button>
    <button
      data-auth="back"
      v-bind="flow.bind.back"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
