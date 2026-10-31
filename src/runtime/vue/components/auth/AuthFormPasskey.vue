<script setup lang="ts">
import type { AuthFormPasskeyProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/** The passkey button of `<AuthForm>`'s first step, marked "Last used" when this browser last signed in with one. */
defineOptions({ name: 'AuthFormPasskey' })
const props = defineProps<AuthFormPasskeyProps>()
const view = useAuthFormView('AuthFormPasskey')
const { t } = view.labels
const lastUsed = () => props.flow.lastMethod.value === 'passkey'
</script>

<template>
  <div data-auth="passkey">
    <button
      data-auth="passkey-sign-in"
      v-bind="flow.bind.passkeyButton"
    >
      {{ flow.isPending.value ? t('passkeyWaiting') : t('passkeySignIn') }}<span
        v-if="lastUsed()"
        :id="view.lastUsedId"
        data-auth="last-used"
        aria-hidden="true"
      >{{ t('lastUsed') }}</span>
    </button>
  </div>
</template>
