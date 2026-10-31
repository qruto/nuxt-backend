<script setup lang="ts">
import type { AuthFormInviteCodeProps } from '../../parts'
import { fieldState, useAuthFormView } from './auth-form'

/** `<AuthForm>`'s invite code step, for a new address while the app is invite only: the code that lets it sign up. */
defineOptions({ name: 'AuthFormInviteCode' })
defineProps<AuthFormInviteCodeProps>()
const view = useAuthFormView('AuthFormInviteCode')
const { t } = view.labels
</script>

<template>
  <form
    data-auth="step-invite-code"
    @submit.prevent="flow.redeemInviteCode()"
  >
    <p
      data-auth="invite-note"
      role="status"
      aria-live="polite"
    >
      {{ t('inviteIntro') }}
    </p>
    <label data-auth="label-invite-code">
      {{ t('inviteCode') }}
      <input
        v-model="flow.inviteCode.value"
        data-auth="input-invite-code"
        type="text"
        autocomplete="off"
        spellcheck="false"
        required
        v-bind="fieldState(flow, view, 'inviteCode')"
      >
    </label>
    <button
      data-auth="submit"
      v-bind="flow.bind.submit"
    >
      {{ flow.isPending.value ? t('checkingInvite') : t('redeemInvite') }}
    </button>
    <button
      data-auth="back"
      v-bind="flow.bind.back"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
