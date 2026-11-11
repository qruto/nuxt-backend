<script setup lang="ts">
/**
 * What the `/invite` page shows: an access link's token checked on
 * arrival (read from the fragment and stripped from the address), its
 * state in words, and the way on to sign in while it is valid. The token
 * stays in the tab, and the sign-in hands it over with the code. A code a
 * friend read out is typed instead, whenever no link brought one that
 * works. The token leaves the address on arrival, before the session is
 * known, so it is never in a copied address bar, a history entry or an error
 * report's URL, and the tab keeps it through a reload. A visitor who is
 * signed in already has nothing to redeem: nothing is checked or kept, and
 * the link they opened still admits a friend. A visitor the referral page
 * sent here (`?ref=`) goes back to it once signed in, to claim it there.
 *
 * Internal: the page's body, built on `useInvite`.
 *
 * @internal
 */
import { computed, inject, nextTick, ref, useId, useTemplateRef } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useAccessPhase, useInvite } from '../../composables/use-access'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'
import { useReturnPath } from '../../composables/use-return-path'

// `fromAddress` takes the link's token off the address, waits for the session, then checks or forgets it.
const invite = useInvite({ fromAddress: true })
const { phase } = useAccessPhase()
const { t, errorMessage } = useLabels('auth')
const waitlistPath = useBackendPagePath('waitlist')
const home = useReturnPath()
const auth = inject(ConvexAuthStateKey, null)
const signedIn = computed(() => auth != null && auth.isAuthenticated.value)
const codeId = useId()
const code = ref('')
const checked = invite.linkChecked
// Whether a ticket was asked about at all: a link brought one, the tab kept one, or a code was typed.
const asked = invite.asked
const continueLink = useTemplateRef<HTMLAnchorElement>('continueLink')

async function redeem() {
  const typed = code.value.trim()
  if (invite.isPending.value || !typed) return
  await invite.check(typed)
  // The form goes once the code checks: focus moves on to the way in, never back to the page's start.
  if (state.value !== 'valid') return
  await nextTick()
  continueLink.value?.focus()
}

/** The `data-state` of the panel: what the person reads now. */
const state = computed(() => {
  if (!checked.value || invite.isPending.value) return 'checking'
  if (signedIn.value) return 'member'
  if (invite.error.value) return 'error'
  if (!asked.value) return 'blank'
  return invite.status.value ?? 'unknown'
})

const MESSAGES = {
  'checking': 'invitePage.checking',
  'member': 'invitePage.member',
  'blank': 'invitePage.blank',
  'valid': 'invitePage.valid',
  'expired': 'invitePage.expired',
  'used-up': 'invitePage.usedUp',
  'revoked': 'invitePage.revoked',
  'unknown': 'invitePage.unknown',
} as const

const message = computed(() => (state.value === 'error' ? errorMessage(invite.error.value) : t(MESSAGES[state.value as keyof typeof MESSAGES])))
/** A code typed by hand: offered once arrival is checked, whenever no link brought one that works; it stays while a typed code is checked. */
const typing = computed(() => checked.value && state.value !== 'member' && state.value !== 'valid')
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
      ref="continueLink"
      data-auth="invite-continue"
      :href="invite.signInTo.value ?? undefined"
    >
      {{ t('invitePage.continue') }}
    </a>
    <a
      v-else-if="state === 'member'"
      data-auth="invite-home"
      :href="home"
    >
      {{ t('invitePage.home') }}
    </a>
    <form
      v-if="typing"
      data-auth="invite-form"
      novalidate
      @submit.prevent="redeem"
    >
      <label
        data-auth="label-invite-code"
        :for="codeId"
      >
        {{ t('invitePage.typeCode') }}
      </label>
      <input
        :id="codeId"
        v-model="code"
        data-auth="input-invite-code"
        name="invite-code"
        type="text"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        required
      >
      <button
        type="submit"
        data-auth="invite-check"
        :aria-disabled="invite.isPending.value || undefined"
      >
        {{ t('invitePage.check') }}
      </button>
      <p
        v-if="phase === 'early-access' && waitlistPath"
        data-auth="invite-waitlist"
      >
        {{ t('invitePage.noInvite') }}
        <a :href="waitlistPath">{{ t('invitePage.joinWaitlist') }}</a>
      </p>
    </form>
  </section>
</template>
