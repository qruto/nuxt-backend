<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { AuthFormPasskeyOfferProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s offer to save a passkey after a code sign-in: the person is
 * signed in, and may skip it. After a recovery (`flow.passkeyRequired`) the
 * passkey is the one step left: it can't be skipped, and the recovery code
 * that replaced the used one shows this once.
 */
defineOptions({ name: 'AuthFormPasskeyOffer' })
defineProps<AuthFormPasskeyOfferProps>()
const view = useAuthFormView('AuthFormPasskeyOffer')
const { t } = view.labels
</script>

<template>
  <section data-auth="step-add-passkey">
    <!-- Announced: the visitor is signed in now, and this is an offer, not a wall; after a recovery it is the one step left. -->
    <p
      data-auth="add-passkey-note"
      role="status"
      aria-live="polite"
    >
      {{ flow.passkeyRequired.value ? t('passkeyRequired') : t('passkeyOffer') }}
    </p>
    <p
      v-if="flow.passkeyRequired.value && flow.recoveryCode.value"
      data-auth="recovery-code"
    >
      {{ t('newRecoveryCode', { code: flow.recoveryCode.value }) }}
    </p>
    <button
      data-auth="passkey-add"
      type="button"
      v-bind="busyAttributes(flow.isPending.value)"
      @click="flow.addPasskey()"
    >
      {{ flow.isPending.value ? t('addingPasskey') : t('addPasskey') }}
    </button>
    <button
      v-if="!flow.passkeyRequired.value"
      data-auth="skip"
      type="button"
      v-bind="busyAttributes(flow.isPending.value)"
      @click="flow.skipPasskey()"
    >
      {{ t('skip') }}
    </button>
  </section>
</template>
