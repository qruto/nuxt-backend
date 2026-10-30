<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { ReauthenticatePasskeyProps } from '../../parts'
import { useReauthenticateView } from './reauthenticate'

/** `<ReauthenticateDialog>`'s first step: the passkey button, and the button that emails a code. */
defineOptions({ name: 'ReauthenticatePasskey' })
defineProps<ReauthenticatePasskeyProps>()
const view = useReauthenticateView('ReauthenticatePasskey')
const { t } = view.labels
</script>

<template>
  <section data-reauthenticate="step-choose">
    <template v-if="view.passkeys.value !== false">
      <button
        data-reauthenticate="passkey"
        type="button"
        v-bind="busyAttributes(flow.isPending.value)"
        @click="view.byPerson(flow.withPasskey)()"
      >
        {{ flow.isPending.value ? t('passkeyWaiting') : t('passkey') }}
      </button>
      <div data-reauthenticate="divider">
        {{ t('divider') }}
      </div>
    </template>
    <button
      data-reauthenticate="send-code"
      type="button"
      v-bind="busyAttributes(flow.isPending.value)"
      @click="view.byPerson(flow.sendCode)()"
    >
      {{ flow.isPending.value ? t('sending') : t('emailCode') }}
    </button>
  </section>
</template>
