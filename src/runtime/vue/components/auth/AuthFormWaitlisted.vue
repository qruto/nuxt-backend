<script setup lang="ts">
import { computed } from 'vue'
import { busyAttributes } from '../../a11y'
import type { AuthFormWaitlistedProps } from '../../parts'
import { useAuthFormView } from './auth-form'

/**
 * `<AuthForm>`'s step for a new address while the app is in early access,
 * with no ticket: the address is on the waitlist. It shows the place the
 * code check answered (`flow.waitlist`) where the waitlist shows rank, and
 * offers the invite code step.
 */
defineOptions({ name: 'AuthFormWaitlisted' })
const props = defineProps<AuthFormWaitlistedProps>()
const view = useAuthFormView('AuthFormWaitlisted')
const { t } = view.labels

/** The note: the place where the waitlist shows rank, else that the address is on the list. */
const note = computed(() => {
  const place = props.flow.waitlist.value
  return place?.position ? t('waitlistedPlace', { position: place.position, total: place.total ?? place.position }) : t('waitlisted')
})
</script>

<template>
  <section data-auth="step-waitlisted">
    <p
      data-auth="waitlisted-note"
      role="status"
      aria-live="polite"
    >
      {{ note }}
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
