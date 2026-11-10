<script setup lang="ts">
/**
 * What the `/waitlist` page shows, by the launch phase and the visitor:
 *
 * - a status link (`/waitlist#<token>`): the person's place, read from the
 *   signed token in the fragment, live as the list moves; a link that was
 *   not signed here, or an entry that is gone, says so above the join;
 * - in early access, without one: `<WaitlistForm>`, whose friend's link
 *   opens this page;
 * - invite only: the place a status link holds still stands, and a new
 *   visitor is sent to the invite page;
 * - public: no line, and the way to sign up;
 * - signed in: nothing to wait for.
 *
 * The status token reads the place and leaves the list, so it never stays
 * in the address, beside the link to share: a status link's leaves it on
 * arrival, and the tab keeps it, with a join's, so a reload still shows the
 * place. The email's status link is the way back from another tab.
 *
 * Internal: the page's body, built on `useWaitlist`; the place is the
 * `WaitlistPlace` part and the join `<WaitlistForm>`, so an app's
 * same-named component shows here too.
 *
 * @internal
 */
import { computed, inject, onMounted, ref, watch } from 'vue'
import { ConvexAuthStateKey } from 'nuxt-convex-module/client'
import { useAccessPhase } from '../../composables/use-access'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import { useLabels } from '../../composables/use-labels'
import { useReturnPath } from '../../composables/use-return-path'
import { useWaitlist, type WaitlistPlace } from '../../composables/use-waitlist'
import { takeFragment, tabKeep } from '../../utils/tab-keep'

// The place behind a status link: the link's own, never a friend's code.
const waitlist = useWaitlist({ ref: null })
const { phase, isLoading: phaseLoading } = useAccessPhase()
const { t } = useLabels('waitlist')
const loginPath = useBackendPagePath('login')
const invitePath = useBackendPagePath('invite')
const home = useReturnPath()
const auth = inject(ConvexAuthStateKey, null)
const signedIn = computed(() => auth != null && auth.isAuthenticated.value)
const authLoading = computed(() => auth != null && auth.isLoading.value)
const opened = ref(false)
const hadToken = ref(false)
// The person left the list, here or through the form: the page says so above the join.
const left = ref(false)
// The status token this tab keeps, out of the address.
const kept = tabKeep('nuxt-backend:waitlist')

onMounted(() => {
  // A status link's token leaves the address at once; a reload reads the one the tab keeps.
  const taken = takeFragment()
  if (taken) kept.keep(taken)
  const token = taken ?? kept.read()
  if (token) {
    hadToken.value = true
    waitlist.status(token)
  }
  opened.value = true
})

// Leave took the entry behind the token: a reload must not read it as a dead link.
watch(() => waitlist.step.value, (step, before) => {
  if (before !== 'status' || step !== 'join') return
  left.value = true
  hadToken.value = false
  kept.drop()
})

/** A join made here: its status token kept for the tab, over a dead one. */
function joined(place: WaitlistPlace) {
  left.value = false
  hadToken.value = false
  if (place.token) kept.keep(place.token)
}

/** A place left through the form: the tab no longer keeps it. */
function leftForm() {
  left.value = true
  kept.drop()
}

/** The `data-state` of the page: what the person reads now. */
const state = computed(() => {
  // The fragment is the browser's alone, so the server renders the wait.
  if (!opened.value || authLoading.value || (phase.value === undefined && phaseLoading.value) || (hadToken.value && waitlist.isLoading.value)) return 'checking'
  if (signedIn.value) return 'member'
  // Open to all, the line is over; invite only, a place already held stands.
  if (phase.value === 'public') return 'open'
  if (hadToken.value && waitlist.place.value !== undefined) return 'ready'
  if (phase.value === 'invite-only') return 'closed'
  if (left.value) return 'left'
  // A token that names no entry: the link does not work.
  return hadToken.value ? 'unknown' : 'join'
})
</script>

<template>
  <section
    data-waitlist="page"
    :data-state="state"
    :aria-busy="state === 'checking' || undefined"
  >
    <p
      v-if="state === 'checking'"
      data-waitlist="status"
      role="status"
      aria-live="polite"
    >
      {{ t('page.checking') }}
    </p>
    <WaitlistPlace
      v-else-if="state === 'ready'"
      :waitlist="waitlist"
    />
    <template v-else-if="state === 'member'">
      <p
        data-waitlist="status"
        role="status"
      >
        {{ t('page.member') }}
      </p>
      <a
        data-waitlist="page-continue"
        :href="home"
      >
        {{ t('page.continue') }}
      </a>
    </template>
    <template v-else-if="state === 'open'">
      <p
        data-waitlist="status"
        role="status"
      >
        {{ t('page.open') }}
      </p>
      <a
        v-if="loginPath"
        data-waitlist="page-sign-up"
        :href="loginPath"
      >
        {{ t('signUp') }}
      </a>
    </template>
    <template v-else-if="state === 'closed'">
      <p
        data-waitlist="status"
        role="status"
      >
        {{ t('page.closed') }}
      </p>
      <a
        v-if="invitePath"
        data-waitlist="page-invite"
        :href="invitePath"
      >
        {{ t('page.haveInvite') }}
      </a>
    </template>
    <template v-else>
      <p
        v-if="state === 'unknown'"
        data-waitlist="status"
        role="alert"
      >
        {{ t('page.unknown') }}
      </p>
      <p
        v-else-if="state === 'left'"
        data-waitlist="status"
        role="status"
        aria-live="polite"
      >
        {{ t('left') }}
      </p>
      <WaitlistForm
        source="waitlist"
        @joined="joined"
        @left="leftForm"
      />
    </template>
  </section>
</template>
