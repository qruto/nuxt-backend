<script setup lang="ts">
import { outcomeSignal, type Signal } from '~/utils/signal'

const state = usePanelState()
const panel = usePanel()

const TRANSPORT = [
  { name: 'EMAIL_API_KEY', unset: 'Email sends are skipped, and sign-in codes print in the dev terminal on a development deployment.' },
  { name: 'EMAIL_FROM', unset: 'The provider\'s onboarding sender is used.' },
  { name: 'EMAIL_WEBHOOK_SECRET', unset: 'Delivery events are rejected, so statuses stop at "sent".' },
] as const

// The packaged emails, as the dev deployment renders them (`email:previewEmails`):
// read when the tab opens, and again on a language change or a refresh.
const previews = computed(() => state.emailPreviews)
const locale = ref<string>()
const scheme = ref<'light' | 'dark'>('light')
const width = ref<'wide' | 'narrow'>('wide')
const selected = ref<string>()
const preview = computed(() => previews.value?.previews.find(entry => entry.key === selected.value) ?? previews.value?.previews[0])
const templateOptions = computed(() => (previews.value?.previews ?? []).map(entry => ({ label: entry.key, value: entry.key })))
const localeOptions = computed(() => (previews.value?.locales ?? []).map(code => ({ label: code, value: code })))
const sent = computed(() => (state.emailPreviewSend?.key === preview.value?.key ? state.emailPreviewSend : null))
function loadPreviews() {
  void panel.loadEmailPreviews(locale.value)
}
onMounted(loadPreviews)
watch(locale, loadPreviews)
function sendPreview() {
  if (preview.value) void panel.sendEmailPreview(preview.value.key, previews.value?.locale)
}

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

const feed = computed(() => state.snapshot?.webhookFeed)
const deliveries = computed(() => (state.snapshot?.webhooks ?? []).filter(row => row.service === 'email'))

const emailId = ref('')
const lookup = computed(() => state.snapshot?.emailLookup)
function lookUp() {
  if (emailId.value.trim()) panel.lookupEmail(emailId.value)
}
const lookupSignal = computed<Signal>(() => {
  if (lookup.value?.error) return 'err'
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
        {{ lookup.isLoading ? 'looking…' : lookup.error ?? (lookup.found ? lookup.status : 'not found') }}
      </SignalBadge>
      <span class="font-mono op65">{{ lookup.emailId }}</span>
    </div>
  </PanelCard>

  <PanelCard title="Recent delivery events">
    <WebhookFeedNotice v-if="feed === 'admins-only' || feed === 'unavailable'" />
    <div
      v-else-if="!deliveries.length"
      class="op50"
    >
      None recorded. Events arrive once the provider's webhook points at <code>/email/events</code>.
    </div>
    <div
      v-for="row of deliveries"
      :key="`${row.outcome}:${row.deliveryId}:${row.receivedAt}`"
      class="flex items-center gap-2 text-xs"
    >
      <Led :signal="outcomeSignal(row.outcome)" />
      <span class="font-mono">{{ row.type ?? '—' }}</span>
      <span class="op65">{{ row.outcome }}{{ row.count && row.count > 1 ? ` ×${row.count}` : '' }}</span>
      <span class="op50 ml-auto font-mono">{{ new Date(row.receivedAt).toLocaleTimeString() }}</span>
    </div>
  </PanelCard>

  <PanelCard title="Templates">
    <template #actions>
      <NSelectTabs
        v-model="scheme"
        n="xs"
        :options="[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]"
      />
      <NSelectTabs
        v-model="width"
        n="xs"
        :options="[{ label: 'Wide', value: 'wide' }, { label: 'Phone', value: 'narrow' }]"
      />
      <NButton
        n="xs"
        icon="carbon-renew"
        title="Render the previews again"
        :disabled="state.emailPreviewsLoading"
        @click="loadPreviews()"
      />
      <NButton
        n="xs"
        icon="carbon-launch"
        title="Open email.ts, where templates, messages and the brand are set"
        @click="openBackendFile('email.ts')"
      >
        email.ts
      </NButton>
    </template>
    <div
      v-if="!previews"
      class="text-xs op50"
    >
      {{ state.emailPreviewsLoading ? 'Rendering every email on the dev deployment…' : 'Not rendered yet.' }}
    </div>
    <NTip
      v-else-if="previews.status !== 'ok'"
      n="amber"
      icon="carbon-warning"
    >
      {{ previews.reason }}
    </NTip>
    <template v-else>
      <div
        v-if="localeOptions.length > 1"
        class="flex items-center gap-2 text-xs"
      >
        <span class="op65">Language</span>
        <NSelectTabs
          :model-value="previews.locale"
          n="xs"
          :options="localeOptions"
          @update:model-value="locale = String($event)"
        />
      </div>
      <NSelectTabs
        :model-value="preview?.key"
        n="xs"
        class="flex-wrap"
        :options="templateOptions"
        @update:model-value="selected = String($event)"
      />
      <template v-if="preview">
        <div class="text-xs op65">
          {{ preview.note }}
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span class="op50">to</span>
          <span class="font-mono">{{ preview.to }}</span>
          <span class="op50">subject</span>
          <span class="font-mono">{{ preview.subject }}</span>
        </div>
        <!-- sandbox with no allowances: the email's HTML renders, its scripts never run -->
        <iframe
          class="block border border-base rounded"
          :class="width === 'narrow' ? 'w-[375px]' : 'w-full'"
          style="height: 520px"
          :srcdoc="scheme === 'dark' ? preview.htmlDark : preview.html"
          sandbox=""
          :title="`${preview.key} email preview`"
        />
        <details class="text-xs">
          <summary class="op65 cursor-pointer">
            Text version
          </summary>
          <pre class="whitespace-pre-wrap font-mono op80">{{ preview.text }}</pre>
        </details>
        <div class="flex items-center gap-2 text-xs flex-wrap">
          <NButton
            n="xs"
            icon="carbon-send"
            :disabled="state.emailPreviewSending"
            @click="sendPreview()"
          >
            Send to delivered@resend.dev
          </NButton>
          <span
            v-if="sent"
            class="op65"
          >{{ sent.status === 'sent' ? `Sent to ${sent.to}${sent.emailId ? ` (${sent.emailId})` : ''}: read it with npx nuxt-backend inbox, or in the provider's dashboard.` : sent.reason }}</span>
        </div>
      </template>
    </template>
    <div class="text-xs op50">
      Rendered by the dev deployment from <code>email.ts</code>: your <code>templates</code>, <code>messages</code> and <code>brand</code>, in every language your messages cover.
    </div>
  </PanelCard>
</template>
