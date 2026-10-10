<script setup lang="ts">
import { outcomeSignal, type Signal } from '~/utils/signal'

const state = usePanelState()
const panel = usePanel()

const TRANSPORT = [
  { name: 'EMAIL_API_KEY', unset: 'Email sends are skipped, and sign-in codes print in the dev terminal (NUXT_BACKEND_LOG_OTP=1).' },
  { name: 'EMAIL_FROM', unset: 'The provider\'s onboarding sender is used.' },
  { name: 'EMAIL_TEST_MODE', unset: 'Test mode stays on: only the provider\'s test addresses receive mail.' },
  { name: 'EMAIL_WEBHOOK_SECRET', unset: 'Delivery events are rejected, so statuses stop at "sent".' },
] as const

/** The packaged auth-email templates, overridable in auth.ts (`integrations.emailTemplates`). */
const TEMPLATES = [
  ['otp', 'Sign-in, verification and change-email codes'],
  ['welcome', 'Right after sign-up (unless the app sends its own)'],
  ['verify', 'Email-verification link'],
  ['changeEmail', 'Confirmation to the current address'],
  ['deleteAccount', 'Account-deletion confirmation'],
  ['invite', 'Workspace invitation'],
] as const

const transport = computed(() => {
  const env = state.info?.env
  return TRANSPORT.map(entry => ({
    ...entry,
    here: env?.visible.optional[entry.name] === true,
    deployed: env?.deployment?.names ? env.deployment.names.optional[entry.name] === true : null,
  }))
})
function transportSignal(entry: { name: string, here: boolean, deployed: boolean | null }): Signal {
  const set = entry.deployed ?? entry.here
  if (set) return 'ok'
  return entry.name === 'EMAIL_API_KEY' || entry.name === 'EMAIL_WEBHOOK_SECRET' ? 'warn' : 'off'
}

const deliveries = computed(() => (state.snapshot?.webhooks ?? []).filter(row => row.service === 'email'))

const emailId = ref('')
const lookup = computed(() => state.snapshot?.emailLookup)
function lookUp() {
  if (emailId.value.trim()) panel.lookupEmail(emailId.value)
}
const lookupSignal = computed<Signal>(() => {
  const status = lookup.value?.status
  if (!status) return 'off'
  if (status === 'delivered') return 'ok'
  if (status === 'bounced' || status === 'complained' || status === 'failed') return 'err'
  return 'warn'
})
</script>

<template>
  <PanelCard title="Transport">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open email.ts in the editor"
        @click="openBackendFile('email.ts')"
      >
        email.ts
      </NButton>
    </template>
    <div
      v-for="entry of transport"
      :key="entry.name"
      class="flex items-center gap-2 text-xs flex-wrap"
    >
      <Led :signal="transportSignal(entry)" />
      <span class="font-mono">{{ entry.name }}</span>
      <span
        v-if="entry.deployed ?? entry.here"
        class="op65"
      >set{{ entry.deployed ? ' on the deployment' : ' here' }}</span>
      <span
        v-else
        class="op65"
      >{{ entry.unset }}</span>
    </div>
    <div class="text-xs op50">
      Values never cross to this panel, so test mode's value is not shown: it is on unless set to <code>false</code>.
    </div>
  </PanelCard>

  <PanelCard title="Delivery status of one email">
    <form
      class="flex items-center gap-2"
      @submit.prevent="lookUp()"
    >
      <NTextInput
        v-model="emailId"
        placeholder="Email id, as send returns it"
        icon="carbon-search"
        class="flex-1"
      />
      <NButton
        n="xs"
        type="submit"
      >
        Look up
      </NButton>
    </form>
    <div
      v-if="lookup"
      class="flex items-center gap-2 text-xs"
    >
      <SignalBadge :signal="lookupSignal">
        {{ lookup.isLoading ? 'looking…' : lookup.found ? lookup.status : 'not found' }}
      </SignalBadge>
      <span class="font-mono op65">{{ lookup.emailId }}</span>
    </div>
  </PanelCard>

  <PanelCard title="Recent delivery events">
    <div
      v-if="!deliveries.length"
      class="op50"
    >
      None recorded. Sign in to the inspected app to read the delivery log; events arrive once the provider's webhook
      points at <code>/email/events</code>.
    </div>
    <div
      v-for="row of deliveries"
      :key="`${row.deliveryId}:${row.receivedAt}`"
      class="flex items-center gap-2 text-xs"
    >
      <Led :signal="outcomeSignal(row.outcome)" />
      <span class="font-mono">{{ row.type ?? '—' }}</span>
      <span class="op65">{{ row.outcome }}</span>
      <span class="op50 ml-auto font-mono">{{ new Date(row.receivedAt).toLocaleTimeString() }}</span>
    </div>
  </PanelCard>

  <PanelCard title="Templates">
    <template #actions>
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open auth.ts, where templates are overridden"
        @click="openBackendFile('auth.ts')"
      >
        auth.ts
      </NButton>
    </template>
    <div
      v-for="[name, when] of TEMPLATES"
      :key="name"
      class="flex items-center gap-2 text-xs"
    >
      <span class="font-mono w-28">{{ name }}</span>
      <span class="op65">{{ when }}</span>
    </div>
    <div class="text-xs op50">
      Override any of them in <code>auth.ts</code> (<code>integrations.emailTemplates</code>) without replacing the transport.
    </div>
  </PanelCard>
</template>
