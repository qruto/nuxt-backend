<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// The unified webhook story: registerBackendRoutes mounts one endpoint per
// service; the component verifies signatures and this feed logs every event
// (billing via the webhookEvents wrapper, email via the setupEmail hooks).
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
      tag="registerBackendRoutes · events"
      title="Webhooks"
      live
    >
      One HTTP mount per service — <code>backend/http.ts</code> passes billing
      and email to <code>registerBackendRoutes</code>, signatures are verified
      by the components, and both feeds land in this activity stream.
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
        <code>npx nuxt-backend doctor</code> probes both routes and fails when
        one isn't mounted.
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
          Delivery lands as an <code>email.delivered</code> event below;
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
      label="feed · live"
      title="Webhook activity"
      variant="well"
    >
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

.feed { display: flex; flex-direction: column; gap: 0.45rem; }
.feed-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.78rem; }
.feed-type { color: var(--ink); font-size: 0.72rem; }
.feed-summary { color: var(--ink-dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-time { color: var(--ink-faint); font-size: 0.68rem; }

.msg { margin: 0.6rem 0 0; font-size: 0.8rem; }
.msg.err { color: var(--err); }
</style>
