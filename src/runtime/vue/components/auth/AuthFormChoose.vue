<script setup lang="ts">
import type { AuthFormChooseProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s first step: the passkey button (`AuthFormPasskey`) and
 * "Continue with email code", the way this browser last signed in marked
 * "Last used", and "Lost your passkey?" for a passkey-only account. A
 * browser without WebAuthn gets the code alone.
 */
defineOptions({ name: 'AuthFormChoose' })
const props = defineProps<AuthFormChooseProps>()
const view = useAuthFormView('AuthFormChoose')
const { t } = view.labels
const lastUsed = () => props.flow.lastMethod.value === 'email-otp'
</script>

<template>
  <section data-auth="step-choose">
    <template v-if="view.passkeys.value !== false">
      <AuthFormPasskey :flow="flow" />
      <div data-auth="divider">
        {{ t('divider') }}
      </div>
    </template>
    <button
      data-auth="otp-start"
      type="button"
      :aria-disabled="flow.isPending.value ? 'true' : undefined"
      :aria-describedby="lastUsed() ? view.lastUsedId : undefined"
      @click="flow.goTo('request-code')"
    >
      {{ t('emailCode') }}<span
        v-if="lastUsed()"
        :id="view.lastUsedId"
        data-auth="last-used"
        aria-hidden="true"
      >{{ t('lastUsed') }}</span>
    </button>
    <!-- A passkey-only account that lost its passkey. -->
    <button
      data-auth="lost-passkey"
      type="button"
      :aria-disabled="flow.isPending.value ? 'true' : undefined"
      @click="flow.goTo('recover')"
    >
      {{ t('lostPasskey') }}
    </button>
  </section>
</template>
