<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'
import { isAllowedTestEmail, OUTCOME_TEST_EMAILS } from '../../../utils/testEmail'

definePageMeta({ middleware: 'auth' })

// ── Transactional send + live delivery status ─────────────────────
const sendEmail = useAction(api.email.sendTest)
const emailTo = ref('delivered@resend.dev')
const emailPending = ref(false)
const lastEmailId = ref<string | undefined>()
const emailSkipped = ref(false)
const emailError = ref<string | null>(null)
const delivery = useEmailStatus(lastEmailId)
const sentEmails = useQuery(api.email.listSentEmails)
// Even here we only send to Resend test inboxes — never a real address.
const recipientValid = computed(() => isAllowedTestEmail(emailTo.value))

async function sendTestEmail() {
  emailPending.value = true
  emailSkipped.value = false
  emailError.value = null
  try {
    const id = await sendEmail({ to: emailTo.value.trim() || undefined })
    if (id) lastEmailId.value = id
    else emailSkipped.value = true
  }
  catch (cause) {
    emailError.value = cause instanceof Error ? cause.message : 'Send failed'
  }
  finally { emailPending.value = false }
}

const deliveryTone = computed(() => {
  if (delivery.isError.value) return 'err'
  if (delivery.isDelivered.value) return 'ok'
  return 'info'
})

// Every Resend outcome inbox is testable here (+label aliases work too). This is
// the page for bounce / complaint / suppression — sign-up stays delivered-only.
const presets = OUTCOME_TEST_EMAILS

// ── Marketing: audience → contact → broadcast ─────────────────────
const createAudience = useAction(api.email.createAudience)
const addContact = useAction(api.email.addContact)
const createBroadcast = useAction(api.email.createBroadcast)
const sendBroadcast = useAction(api.email.sendBroadcast)
const marketingMsg = ref<string | null>(null)
const marketingPending = ref(false)

async function runMarketing() {
  marketingPending.value = true
  marketingMsg.value = null
  try {
    const audience = await createAudience({ name: 'Showcase audience' }) as { id: string }
    await addContact({ audienceId: audience.id, email: 'delivered@resend.dev', firstName: 'Test' })
    const broadcast = await createBroadcast({
      audienceId: audience.id,
      from: 'onboarding@resend.dev',
      subject: 'Product update',
      html: '<p>Hello from a nuxt-backend broadcast.</p>',
    }) as { id: string }
    await sendBroadcast({ broadcastId: broadcast.id })
    marketingMsg.value = `Broadcast ${broadcast.id} sent to audience ${audience.id}.`
  }
  catch (e) { marketingMsg.value = e instanceof Error ? e.message : 'Marketing failed' }
  finally { marketingPending.value = false }
}

// ── Webhook activity feed (Polar + Resend events) ─────────────────
const webhookEvents = useQuery(api.billing.listWebhookEvents)
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useEmailStatus · Resend"
      title="Email"
      live
    >
      Transactional + marketing email through the nested Resend component.
      <code>useEmailStatus</code> tracks delivery live as Resend webhooks land.
      Sends default to Resend's test inboxes.
    </PageHeader>

    <LabPanel
      label="transactional"
      title="Send & track"
      tone="accent"
    >
      <LabField
        label="recipient"
        hint="test inboxes drive the outcome"
        :error="recipientValid ? null : 'Resend test inboxes only (delivered / bounced / complained / suppressed).'"
      >
        <div class="row">
          <input
            v-model="emailTo"
            class="input"
            autocomplete="off"
            spellcheck="false"
            style="flex: 1; min-width: 12rem"
          >
          <LabButton
            variant="signal"
            :loading="emailPending"
            :disabled="!recipientValid"
            @click="sendTestEmail"
          >
            {{ emailPending ? 'Sending…' : 'Send' }}
          </LabButton>
        </div>
      </LabField>
      <div class="row presets">
        <button
          v-for="p in presets"
          :key="p"
          type="button"
          class="preset"
          @click="emailTo = p"
        >
          {{ p.split('@')[0] }}
        </button>
      </div>

      <!-- The signature status element: delivery state as colored rings. -->
      <div class="lifecycle">
        <StatusRing
          tone="info"
          :pulse="!!lastEmailId && !delivery.isDelivered.value && !delivery.isError.value"
        >
          sent
        </StatusRing>
        <span class="track" />
        <StatusRing :tone="delivery.isDelivered.value ? 'ok' : 'muted'">
          delivered
        </StatusRing>
        <span class="track" />
        <StatusRing :tone="delivery.isError.value ? 'err' : 'muted'">
          bounced
        </StatusRing>
      </div>

      <p
        v-if="lastEmailId"
        class="status-line"
      >
        <StatusRing :tone="deliveryTone">
          {{ delivery.status.value ?? 'queued' }}
        </StatusRing>
        <span class="mono id">id {{ lastEmailId }}</span>
      </p>
      <p
        v-else-if="emailSkipped"
        class="hint"
      >
        Skipped — set <code>RESEND_API_KEY</code> to enable delivery.
      </p>
      <p
        v-else-if="emailError"
        class="err-text mono"
      >
        {{ emailError }}
      </p>

      <ul
        v-if="sentEmails && sentEmails.length"
        class="feed"
      >
        <li
          v-for="e in sentEmails"
          :key="e._id"
        >
          <span class="mono to">{{ e.to }}</span>
          <span class="subj">{{ e.subject }}</span>
        </li>
      </ul>
    </LabPanel>

    <div class="grid-2">
      <LabPanel
        label="marketing"
        title="Audiences & broadcasts"
      >
        <p
          class="hint"
          style="margin-bottom: 0.85rem"
        >
          Audience → contact → broadcast via the Resend SDK, one click (test
          recipient only).
        </p>
        <LabButton
          variant="signal"
          :loading="marketingPending"
          @click="runMarketing"
        >
          Create audience & send broadcast
        </LabButton>
        <p
          v-if="marketingMsg"
          class="msg mono"
        >
          {{ marketingMsg }}
        </p>
      </LabPanel>

      <LabPanel
        label="webhooks"
        title="Event feed"
        variant="well"
      >
        <ul
          v-if="webhookEvents && webhookEvents.length"
          class="feed"
        >
          <li
            v-for="ev in webhookEvents"
            :key="ev._id"
          >
            <StatusPill
              tone="signal"
              :dot="false"
            >
              {{ ev.source }}
            </StatusPill>
            <span class="mono">{{ ev.type }}</span>
          </li>
        </ul>
        <p
          v-else
          class="hint"
        >
          No events yet — configure webhooks and subscribe to trigger some.
        </p>
      </LabPanel>
    </div>
  </div>
</template>

<style scoped>
.presets { margin-top: 0.6rem; gap: 0.4rem; }
.preset {
  font-family: var(--mono); font-size: 0.68rem; padding: 0.3rem 0.6rem; border-radius: 99px;
  border: 0; background: var(--sink); box-shadow: var(--inset-sm); color: var(--ink-dim); cursor: pointer;
}
.preset:hover { color: var(--accent); }

.lifecycle { display: flex; align-items: center; gap: 0.6rem; margin: 1.2rem 0 0.4rem; flex-wrap: wrap; }
.track { width: 22px; height: 2px; border-radius: 2px; background: var(--edge-hi); }

.status-line { display: flex; align-items: center; gap: 0.6rem; margin: 0.9rem 0 0; }
.id { font-size: 0.72rem; color: var(--ink-faint); word-break: break-all; }
.err-text { color: var(--err); font-size: 0.8rem; margin: 0.9rem 0 0; }
.msg { color: var(--ok); font-size: 0.76rem; margin: 0.85rem 0 0; word-break: break-all; }

.feed { list-style: none; margin: 0.9rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.78rem; color: var(--ink-dim); }
.feed li { display: flex; align-items: center; gap: 0.5rem; }
.to { color: var(--accent-soft); }
.subj { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
