<script setup lang="ts">
/**
 * What the `/invite` page shows: an access link's token checked on
 * arrival (read from the fragment and stripped from the address), its
 * state in words, and the way on to sign in while it is valid. The token
 * stays in the tab, and the sign-in hands it over with the code.
 *
 * Internal: the page's body, built on `useInvite`.
 *
 * @internal
 */
import { computed, onMounted, ref } from 'vue'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useInvite } from '../../composables/use-access'
import { useLabels } from '../../composables/use-labels'

const invite = useInvite()
const { t, errorMessage } = useLabels('auth')
const loginPath = useBackendPagePath('login')
const checked = ref(false)

onMounted(async () => {
  await invite.check()
  checked.value = true
})

/** The `data-state` of the panel: what the person reads now. */
const state = computed(() => (!checked.value || invite.isPending.value ? 'checking' : invite.error.value ? 'error' : invite.status.value ?? 'unknown'))

const MESSAGES = {
  'checking': 'invitePage.checking',
  'valid': 'invitePage.valid',
  'expired': 'invitePage.expired',
  'used-up': 'invitePage.usedUp',
  'revoked': 'invitePage.revoked',
  'unknown': 'invitePage.unknown',
} as const

const message = computed(() => (state.value === 'error' ? errorMessage(invite.error.value) : t(MESSAGES[state.value as keyof typeof MESSAGES])))
</script>

<template>
  <section
    data-auth="invite"
    :data-state="state"
    :aria-busy="state === 'checking' || undefined"
  >
    <p
      data-auth="invite-status"
      :role="state === 'error' ? 'alert' : 'status'"
      aria-live="polite"
    >
      {{ message }}
    </p>
    <a
      v-if="state === 'valid'"
      data-auth="invite-continue"
      :href="loginPath ?? undefined"
    >
      {{ t('invitePage.continue') }}
    </a>
  </section>
</template>
