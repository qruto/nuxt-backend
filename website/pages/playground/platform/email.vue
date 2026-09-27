<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '#backend/api'
import { errorText } from '../../../utils/errorText'
import { isAllowedTestEmail, OUTCOME_TEST_EMAILS, TEST_EMAIL_HELP } from '../../../utils/testEmail'

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
// Even here we only send to Resend test inboxes — never a real address
// (email.sendTest checks it again on the server).
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
    emailError.value = errorText(cause, 'Send failed')
  }
  finally { emailPending.value = false }
}

// A complaint is a flag on top of the delivery status (the mail *was*
// delivered, then marked as spam), so it gets its own readout.
const complained = computed(() => delivery.data.value?.complained === true)

const deliveryTone = computed(() => {
  if (delivery.isError.value) return 'err'
  if (complained.value) return 'warn'
  if (delivery.isDelivered.value) return 'ok'
  return 'warn'
})

// Every Resend outcome inbox is testable here (+label aliases work too). This is
// the page for bounces and complaints — accounts use sandbox identities.
const presets = OUTCOME_TEST_EMAILS

// ── Sandbox inbox ─────────────────────────────────────────────────
// A sandbox address's mail from the last hour — welcome, email-change and
// invitation links included — since nobody can open its real mailbox. Yours
// by default; during an email change, the new address's. Shown as text: a
// message's HTML is never rendered.
const { user } = useAuth()
const inboxAddress = ref('')
watch(() => user.value?.email, (email) => {
  if (email && !inboxAddress.value) inboxAddress.value = email
}, { immediate: true })
const inbox = useSandboxInbox(inboxAddress)

function receivedAgo(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60_000))
  return minutes === 0 ? 'just now' : `${minutes} min ago`
}

// ── Marketing: segment → contact → broadcast (admin) ──────────────
const createSegment = useAction(api.email.createSegment)
const addContact = useAction(api.email.addContact)
const createBroadcast = useAction(api.email.createBroadcast)
const sendBroadcast = useAction(api.email.sendBroadcast)
const marketingMsg = ref<string | null>(null)
const marketingPending = ref(false)

async function runMarketing() {
  marketingPending.value = true
  marketingMsg.value = null
  try {
    const segment = await createSegment({ name: 'Showcase segment' }) as { id: string }
    await addContact({ segmentId: segment.id, email: 'delivered@resend.dev', firstName: 'Test' })
    const broadcast = await createBroadcast({
      segmentId: segment.id,
      from: 'onboarding@resend.dev',
      subject: 'Product update',
      html: '<p>Hello from a nuxt-backend broadcast.</p>',
    }) as { id: string }
    await sendBroadcast({ broadcastId: broadcast.id })
    marketingMsg.value = `Broadcast ${broadcast.id} sent to segment ${segment.id}.`
  }
  catch (e) { marketingMsg.value = errorText(e, 'Marketing failed') }
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
      Sends go to Resend's test inboxes only.
    </PageHeader>

    <LabPanel
      label="transactional"
      title="Send & track"
      tone="ok"
    >
      <LabField
        label="recipient"
        hint="test inboxes drive the outcome"
        :error="recipientValid ? null : TEST_EMAIL_HELP"
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
            variant="primary"
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
          tone="warn"
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
        <StatusPill
          v-if="complained"
          tone="warn"
          dot
        >
          complained
        </StatusPill>
        <span class="mono id">id {{ lastEmailId }}</span>
      </p>
      <p
        v-else-if="emailSkipped"
        class="hint"
      >
        Skipped — set <code>EMAIL_API_KEY</code> to enable delivery.
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

    <LabPanel
      label="sandbox inbox"
      title="Sandbox inbox"
    >
      <p class="hint">
        A sandbox address's mail from the last hour, read with
        <code>useSandboxInbox</code> — the playground's accounts are addresses
        nobody can open, so email-change and invitation links land here. Yours
        by default; during an email change, enter the new one.
      </p>
      <LabField label="address">
        <input
          v-model="inboxAddress"
          class="input"
          autocomplete="off"
          spellcheck="false"
          placeholder="delivered+…@resend.dev"
        >
      </LabField>
      <ul
        v-if="inbox.messages.value?.length"
        class="mail-list"
      >
        <li
          v-for="(message, index) in inbox.messages.value"
          :key="`${message.receivedAt}-${index}`"
        >
          <details>
            <summary>
              <span class="subj">{{ message.subject || '(no subject)' }}</span>
              <span class="mono when">{{ receivedAgo(message.receivedAt) }}</span>
            </summary>
            <pre class="mail">{{ message.text ?? 'This message has no text version.' }}</pre>
          </details>
        </li>
      </ul>
      <p
        v-else
        class="hint"
        style="margin-top: 0.7rem"
      >
        {{ inbox.isLoading.value ? 'Checking the inbox…' : 'Nothing in the last hour.' }}
      </p>
    </LabPanel>

    <div class="grid-2">
      <LabPanel
        label="marketing"
        title="Segments & broadcasts"
      >
        <p
          class="hint"
          style="margin-bottom: 0.85rem"
        >
          Segment → contact → broadcast via the Resend SDK, one click (test
          recipient only). Contacts live in the provider account, outside test
          mode, so these are <code>admin.action</code>s.
        </p>
        <RoleBoundary role="admin">
          <LabButton
            variant="primary"
            :loading="marketingPending"
            @click="runMarketing"
          >
            Create segment & send broadcast
          </LabButton>
          <p
            v-if="marketingMsg"
            class="msg mono"
          >
            {{ marketingMsg }}
          </p>
          <template #fallback>
            <p class="hint">
              Admin only — the guards page shows how <code>RoleBoundary</code>
              and <code>admin.*</code> decide.
            </p>
          </template>
        </RoleBoundary>
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
              tone="ok"
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

    <LabPanel
      label="templates"
      title="Template customization"
    >
      <p class="hint">
        Every OTP this deployment sends uses a custom template — the transport
        stays the packaged one, only the message changes. From
        <code>backend/auth.ts</code>:
      </p>
      <pre class="cmd"><code>integrations: {
  emailTemplates: {
    otp: ({ email, otp, type }) => ({
      to: email,
      subject: `Your nuxt-backend playground ${'${type}'} code`,
      text: `Your code: ${'${otp}'} …`,
    }),
  },
}</code></pre>
      <p class="hint">
        Request a sign-in code from <NuxtLink to="/login">/login</NuxtLink>:
        the sandbox inbox there shows the subject carrying the override. The
        packaged defaults this replaces are all rendered on
        <NuxtLink to="/playground/platform/email-templates">Email templates</NuxtLink>.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.cmd {
  margin: 0.5rem 0; padding: 0.7rem 0.85rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-family: var(--mono); font-size: 0.72rem; line-height: 1.55;
  overflow-x: auto; white-space: pre;
}
.presets { margin-top: 0.6rem; gap: 0.4rem; }
.preset {
  font-family: var(--mono); font-size: 0.68rem; padding: 0.3rem 0.6rem; border-radius: 99px;
  border: 0; background: var(--sink); box-shadow: var(--inset-sm); color: var(--ink-dim); cursor: pointer;
}
.preset:hover { color: var(--ok); }

.lifecycle { display: flex; align-items: center; gap: 0.6rem; margin: 1.2rem 0 0.4rem; flex-wrap: wrap; }
.track { width: 22px; height: 2px; border-radius: 2px; background: var(--edge-hi); }

.status-line { display: flex; align-items: center; gap: 0.6rem; margin: 0.9rem 0 0; }
.id { font-size: 0.72rem; color: var(--ink-faint); word-break: break-all; }
.err-text { color: var(--err); font-size: 0.8rem; margin: 0.9rem 0 0; }
.msg { color: var(--ok); font-size: 0.76rem; margin: 0.85rem 0 0; word-break: break-all; }

.feed { list-style: none; margin: 0.9rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.78rem; color: var(--ink-dim); }
.feed li { display: flex; align-items: center; gap: 0.5rem; }
.to { color: var(--ink); }
.subj { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mail-list { list-style: none; margin: 0.9rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.78rem; }
.mail-list summary { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; cursor: pointer; color: var(--ink); }
.when { flex: none; font-size: 0.68rem; color: var(--ink-faint); }
.mail {
  margin: 0.5rem 0 0.2rem; padding: 0.7rem 0.85rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-family: var(--mono); font-size: 0.72rem; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word; max-height: 16rem; overflow-y: auto;
}
</style>
