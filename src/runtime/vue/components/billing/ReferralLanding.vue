<script setup lang="ts">
/**
 * What the `/r/<code>` page shows: who invited the visitor and what they
 * get, the way to sign up (which brings them back here to claim), and the
 * claim itself. The code stays in the address; nothing is stored on the
 * device. While the app is not public, a visitor needs a ticket before
 * signing up makes them an account: the page says so, and offers the
 * invite page (carrying the code, so the sign-in it leads to comes back
 * here to claim), the waitlist in early access, and a sign-in for an
 * account that exists.
 *
 * Internal: the page's body, built on `useReferralInvite`.
 *
 * @internal
 */
import { computed } from 'vue'
import { useAccessPhase } from '../../composables/use-access'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'
import { useReferralInvite } from '../../composables/use-referral-invite'

const invite = useReferralInvite()
const { t, errorMessage } = useLabels('referral')
const home = useBackendPagePath('settings')
const invitePath = useBackendPagePath('invite')
const waitlistPath = useBackendPagePath('waitlist')
const { phase } = useAccessPhase()

/** The invite page, carrying this link's code: the sign-in it leads to comes back here to claim. */
const inviteTo = computed(() => (invitePath.value ? `${invitePath.value}?ref=${encodeURIComponent(invite.code.value)}` : null))
/** The visitor needs a ticket first: the app is not public, and nobody is signed in. */
const needsTicket = computed(() => invite.state.value === 'ready' && invite.closed.value === true)
/** A visitor's way in waits for the phase: neither the sign-up nor the ways to a ticket until it is read. */
const phaseUnknown = computed(() => invite.state.value === 'ready' && invite.closed.value === undefined)

const offer = computed(() => invite.preview.value?.program.referred ?? null)
const inviter = computed(() => invite.preview.value?.inviter ?? null)
</script>

<template>
  <section
    data-referral="landing"
    :data-state="invite.state.value"
    :data-closed="needsTicket || undefined"
    :aria-busy="invite.state.value === 'checking' || invite.state.value === 'claiming' || phaseUnknown || undefined"
  >
    <p
      v-if="invite.state.value === 'checking'"
      data-referral="landing-status"
      role="status"
    >
      {{ t('landing.checking') }}
    </p>
    <p
      v-else-if="invite.state.value === 'invalid'"
      data-referral="landing-status"
      role="status"
    >
      {{ t('landing.invalid') }}
    </p>
    <template v-else>
      <p data-referral="landing-from">
        {{ inviter ? t('landing.invitedBy', { inviter }) : t('landing.invited') }}
      </p>
      <p data-referral="landing-offer">
        <template v-if="offer?.kind === 'discount'">
          {{ t('landing.youGet', { name: offer.name }) }}
        </template>
        <template v-else-if="offer?.kind === 'trial'">
          {{ t('landing.youGetTrial', { days: offer.days }) }}
        </template>
        <template v-else>
          {{ t('landing.youGetNothing') }}
        </template>
      </p>
      <template v-if="needsTicket">
        <p data-referral="landing-closed">
          {{ t('landing.closed') }}
        </p>
        <a
          v-if="inviteTo"
          data-referral="landing-invite"
          :href="inviteTo"
        >
          {{ t('landing.haveInvite') }}
        </a>
        <a
          v-if="phase === 'early-access' && waitlistPath"
          data-referral="landing-waitlist"
          :href="waitlistPath"
        >
          {{ t('landing.joinWaitlist') }}
        </a>
        <a
          v-if="invite.signInTo.value"
          data-referral="landing-sign-in"
          :href="invite.signInTo.value"
        >
          {{ t('landing.signIn') }}
        </a>
      </template>
      <a
        v-else-if="invite.state.value === 'ready' && invite.closed.value === false && invite.signInTo.value"
        data-referral="landing-sign-up"
        :href="invite.signInTo.value"
      >
        {{ t('landing.signUp') }}
      </a>
      <button
        v-else-if="invite.state.value === 'claimable'"
        type="button"
        data-referral="landing-claim"
        @click="invite.claim()"
      >
        {{ t('landing.claim') }}
      </button>
      <p
        v-else-if="invite.state.value === 'claiming'"
        data-referral="landing-status"
        role="status"
      >
        {{ t('landing.claiming') }}
      </p>
      <p
        v-else-if="invite.state.value === 'claimed'"
        data-referral="landing-status"
        role="status"
      >
        {{ t('landing.claimed') }}
      </p>
      <p
        v-else-if="invite.state.value === 'own'"
        data-referral="landing-status"
        role="status"
      >
        {{ t('landing.own') }}
      </p>
      <p
        v-else-if="invite.state.value === 'ignored'"
        data-referral="landing-status"
        :role="invite.error.value ? 'alert' : 'status'"
      >
        {{ invite.error.value ? errorMessage(invite.error.value) : t('landing.ignored') }}
      </p>
      <a
        v-if="['claimed', 'ignored', 'own'].includes(invite.state.value) && home"
        data-referral="landing-continue"
        :href="home"
      >
        {{ t('landing.continue') }}
      </a>
    </template>
  </section>
</template>
