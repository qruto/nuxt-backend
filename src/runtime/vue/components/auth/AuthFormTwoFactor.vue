<script setup lang="ts">
import type { AuthFormTwoFactorProps } from '../../parts'
import { fieldState, useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s second step after a sign-in code, for an account with an
 * authenticator app: the app's six-digit code, or one of the backup codes,
 * and whether this device skips the step for thirty days.
 */
defineOptions({ name: 'AuthFormTwoFactor' })
defineProps<AuthFormTwoFactorProps>()
const view = useAuthFormView('AuthFormTwoFactor')
const { t } = view.labels
</script>

<template>
  <form
    data-auth="step-two-factor"
    @submit.prevent="flow.verifyTwoFactor()"
  >
    <p data-auth="two-factor-note">
      {{ flow.useBackupCode.value ? t('twoFactorBackupIntro') : t('twoFactorIntro') }}
    </p>
    <label data-auth="label-two-factor-code">
      {{ flow.useBackupCode.value ? t('twoFactorBackupCode') : t('twoFactorCode') }}
      <input
        v-model="flow.twoFactorCode.value"
        data-auth="input-two-factor-code"
        type="text"
        :inputmode="flow.useBackupCode.value ? 'text' : 'numeric'"
        :autocomplete="flow.useBackupCode.value ? 'off' : 'one-time-code'"
        :pattern="flow.useBackupCode.value ? undefined : '[0-9 ]*'"
        :maxlength="flow.useBackupCode.value ? 32 : 7"
        spellcheck="false"
        required
        v-bind="fieldState(flow, view, 'twoFactorCode')"
      >
    </label>
    <label data-auth="label-trust-device">
      <input
        v-model="flow.trustDevice.value"
        data-auth="input-trust-device"
        type="checkbox"
      >
      {{ t('twoFactorTrustDevice') }}
    </label>
    <button
      data-auth="submit"
      v-bind="flow.bind.submit"
    >
      {{ flow.isPending.value ? t('twoFactorChecking') : t('twoFactorSubmit') }}
    </button>
    <button
      data-auth="two-factor-switch"
      type="button"
      @click="flow.useBackupCode.value = !flow.useBackupCode.value"
    >
      {{ flow.useBackupCode.value ? t('twoFactorUseApp') : t('twoFactorUseBackup') }}
    </button>
    <button
      data-auth="back"
      v-bind="flow.bind.back"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
