<script setup lang="ts">
import { busyAttributes } from '../../a11y'
import type { AuthFormWaitlistedProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s step for a new address while the app is in early access,
 * with no ticket: the address is on the waitlist. It shows the place the
 * code check answered (`flow.waitlist`) once there is one, and offers the
 * invite code step.
 */
defineOptions({ name: 'AuthFormWaitlisted' })
defineProps<AuthFormWaitlistedProps>()
const view = useAuthFormView('AuthFormWaitlisted')
const { t } = view.labels
</script>

<template>
  <section data-auth="step-waitlisted">
    <p
      data-auth="waitlisted-note"
      role="status"
      aria-live="polite"
    >
      {{ flow.waitlist.value ? t('waitlistedPlace', { position: flow.waitlist.value.position, total: flow.waitlist.value.total }) : t('waitlisted') }}
    </p>
    <p
      v-if="flow.waitlist.value"
      data-auth="waitlisted-disclosure"
    >
      {{ t('waitlistedDisclosure') }}
    </p>
    <button
      data-auth="have-invite"
      type="button"
      v-bind="busyAttributes(flow.isPending.value)"
      @click="flow.goTo('invite-code')"
    >
      {{ t('haveInviteCode') }}
    </button>
  </section>
</template>
