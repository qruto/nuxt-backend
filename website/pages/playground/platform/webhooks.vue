<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// Two views of the same inbound traffic: the packaged delivery log records
// EVERY delivery on /billing/events and /email/events with its outcome
// (verification, dedupe, size caps — the fail-closed edge), while the
// consumer feed is the app's own `events` handlers reacting to a few
// high-signal types (billing.ts / email.ts).
const deliveries = useQuery(api.billing.getWebhookDeliveries, { limit: 15 })
const events = useQuery(api.billing.listWebhookEvents)
const sendTest = useAction(api.email.sendTest)

const runtimeConfig = useRuntimeConfig()
const siteUrl = runtimeConfig.public.convex.siteUrl || 'https://<deployment>.convex.site'

const sending = ref(false)
const errorMsg = ref<string | null>(null)

async function triggerEmailEvent() {
  errorMsg.value = null
  sending.value = true
  try {
    await sendTest({})
  }
  catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed'
  }
  finally {
    sending.value = false
  }
}

const OUTCOME_TONES: Record<string, 'ok' | 'signal' | 'warn' | 'err'> = {
  ok: 'ok',
  duplicate: 'signal',
  unknown_type: 'warn',
  invalid_signature: 'err',
  handler_error: 'err',
  oversized: 'err',
  missing_secret: 'err',
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="registerBackendRoutes · getWebhookDeliveries"
      title="Webhooks"
      live
    >
      One HTTP mount per service — <code>backend/http.ts</code> passes billing
      and email to <code>registerBackendRoutes</code>. Every delivery is
      signature-verified, deduped, and logged with its outcome; your
      <code>events</code> handlers react on top.
    </PageHeader>

    <LabPanel
      label="endpoints"
      title="Mounted routes"
      tone="accent"
    >
      <div class="rows">
        <div class="endpoint-row">
          <StatusPill
            tone="ok"
            dot
          >
            billing
          </StatusPill>
          <span class="mono endpoint-url">{{ siteUrl }}/billing/events</span>
          <span class="endpoint-secret mono">BILLING_WEBHOOK_SECRET</span>
        </div>
        <div class="endpoint-row">
          <StatusPill
            tone="ok"
            dot
          >
            email
          </StatusPill>
          <span class="mono endpoint-url">{{ siteUrl }}/email/events</span>
          <span class="endpoint-secret mono">EMAIL_WEBHOOK_SECRET</span>
        </div>
      </div>
      <p class="hint">
        Fail-closed: 503 until the secret is set, 403 on bad signatures, 413
        oversized, 202 for authentic-but-unknown types, 200 on redeliveries.
        <code>npx nuxt-backend doctor</code> probes both routes.
      </p>
    </LabPanel>

    <LabPanel
      label="trigger"
      title="Cause an event"
    >
      <div class="row">
        <LabButton
          variant="signal"
          :loading="sending"
          @click="triggerEmailEvent"
        >
          Send test email
        </LabButton>
        <span class="hint">
          Delivery lands as <code>email.delivered</code> in both feeds below;
          subscribing on the Pricing page produces billing events.
        </span>
      </div>
      <p
        v-if="errorMsg"
        class="msg err"
      >
        {{ errorMsg }}
      </p>
    </LabPanel>

    <LabPanel
      label="delivery log · packaged"
      title="Every delivery, with its outcome"
      variant="well"
    >
      <p class="hint">
        The component's ring-buffer log behind
        <code>billing.functions.getWebhookDeliveries</code> — the same feed
        the doctor and DevTools read. Redeliver a webhook from the provider
        dashboard and watch it land as <code>duplicate</code>.
      </p>
      <p
        v-if="!deliveries?.length"
        class="hint"
      >
        No deliveries yet — trigger one above.
      </p>
      <div
        v-else
        class="feed"
      >
        <div
          v-for="delivery in deliveries"
          :key="`${delivery.service}-${delivery.deliveryId}-${delivery.receivedAt}`"
          class="feed-row"
        >
          <StatusPill
            :tone="delivery.service === 'email' ? 'signal' : 'ok'"
            dot
          >
            {{ delivery.service }}
          </StatusPill>
          <span class="feed-type mono">{{ delivery.type ?? '—' }}</span>
          <StatusPill
            :tone="OUTCOME_TONES[delivery.outcome] ?? 'warn'"
            :dot="false"
          >
            {{ delivery.outcome }}
          </StatusPill>
          <span
            v-if="delivery.note"
            class="feed-summary"
          >{{ delivery.note }}</span>
          <span class="feed-time mono">{{ timeAgo(delivery.receivedAt) }}</span>
        </div>
      </div>
    </LabPanel>

    <LabPanel
      label="events map · consumer"
      title="Your handlers' feed"
      variant="well"
    >
      <p class="hint">
        The app-side view: <code>setupBilling({ events })</code> /
        <code>setupEmail({ events })</code> handlers in
        <code>backend/billing.ts</code> and <code>backend/email.ts</code> log a
        few high-signal types into the app's own table — that's the hook point
        for reacting to billing and email events in your product.
      </p>
      <p
        v-if="!events?.length"
        class="hint"
      >
        No events yet — trigger one above.
      </p>
      <div
        v-else
        class="feed"
      >
        <div
          v-for="event in events"
          :key="event._id"
          class="feed-row"
        >
          <StatusPill
            :tone="event.source === 'email' ? 'signal' : 'ok'"
            dot
          >
            {{ event.source }}
          </StatusPill>
          <span class="feed-type mono">{{ event.type }}</span>
          <span class="feed-summary">{{ event.summary }}</span>
          <span class="feed-time mono">{{ timeAgo(event.createdAt) }}</span>
        </div>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.rows { display: flex; flex-direction: column; gap: 0.45rem; }
.endpoint-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.7rem; border-radius: var(--r-sm);
  background: var(--surface); box-shadow: var(--raise-sm);
  font-size: 0.8rem;
}
.endpoint-url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.endpoint-secret { color: var(--ink-faint); font-size: 0.68rem; }

.feed { display: flex; flex-direction: column; gap: 0.45rem; margin-top: 0.7rem; }
.feed-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.78rem; }
.feed-type { color: var(--ink); font-size: 0.72rem; }
.feed-summary { color: var(--ink-dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-time { color: var(--ink-faint); font-size: 0.68rem; margin-left: auto; }

.msg { margin: 0.6rem 0 0; font-size: 0.8rem; }
.msg.err { color: var(--err); }
</style>
