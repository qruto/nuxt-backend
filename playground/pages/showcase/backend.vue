<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// --- Account (Better Auth, passwordless) ------------------------------------
const { user, changeEmail, deleteAccount, signOut } = useAuth()
const newEmail = ref('')
const accountMsg = ref<string | null>(null)
async function doChangeEmail() {
  accountMsg.value = null
  try {
    await changeEmail(newEmail.value.trim())
    accountMsg.value = `Confirmation sent to ${user.value?.email}.`
    newEmail.value = ''
  }
  catch (e) { accountMsg.value = e instanceof Error ? e.message : 'Failed' }
}
async function doDelete() {
  if (!confirm('Send an account-deletion confirmation email?')) return
  accountMsg.value = null
  try {
    await deleteAccount()
    accountMsg.value = 'Deletion confirmation email sent.'
  }
  catch (e) { accountMsg.value = e instanceof Error ? e.message : 'Failed' }
}

// --- Billing (Polar): subscription, checkout, portal, plan switch -----------
const billing = useBilling()
const products = computed(() => Object.entries(billing.products.value ?? {}))
const plan = computed(() => (billing.isSubscribed.value ? 'Pro' : 'Free'))
const syncEntitlements = useAction(api.billing.syncEntitlements)

// --- Feature gate & prepaid credits -----------------------------------------
const features = useFeatures()
const credits = useCredits()
const consumeCredit = useAction(api.billing.consumeCredit)
async function spendCredit() {
  if (credits.meterId.value) await consumeCredit({ meterId: credits.meterId.value })
}
// The one-time credit pack (configured under the `credits` key); top up by checking
// out for it. Subscription plans exclude the pack.
const creditPackId = computed(() => billing.products.value?.credits?.id)
const subscribable = computed(() => products.value.filter(([key]) => key !== 'credits'))

// --- Discounts (admin) ------------------------------------------------------
const createDiscount = useAction(api.billing.createDiscount)
const discountPercent = ref(20)
const discountCode = ref<string | null>(null)
const discountPending = ref(false)
async function makeDiscount() {
  discountPending.value = true
  try {
    const d = await createDiscount({ name: `Launch ${discountPercent.value}%`, percent: discountPercent.value })
    discountCode.value = d.code ?? d.id
  }
  finally { discountPending.value = false }
}

// --- Transactional email (Resend) + live delivery status --------------------
const sendEmail = useAction(api.email.sendTest)
const emailTo = ref('delivered@resend.dev')
const emailPending = ref(false)
const lastEmailId = ref<string | undefined>()
const emailSkipped = ref(false)
const emailError = ref<string | null>(null)
const delivery = useEmailStatus(lastEmailId)
const sentEmails = useQuery(api.email.listSentEmails)

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
  finally {
    emailPending.value = false
  }
}

// --- Marketing email (Resend SDK): audience → contact → broadcast -----------
const createAudience = useAction(api.email.createAudience)
const addContact = useAction(api.email.addContact)
const createBroadcast = useAction(api.email.createBroadcast)
const sendBroadcast = useAction(api.email.sendBroadcast)
const audienceId = ref<string | null>(null)
const broadcastId = ref<string | null>(null)
const marketingMsg = ref<string | null>(null)
const marketingPending = ref(false)

async function runMarketing() {
  marketingPending.value = true
  marketingMsg.value = null
  try {
    const audience = await createAudience({ name: 'Showcase audience' }) as { id: string }
    audienceId.value = audience.id
    await addContact({ audienceId: audience.id, email: 'delivered@resend.dev', firstName: 'Test' })
    const broadcast = await createBroadcast({
      audienceId: audience.id,
      from: 'onboarding@resend.dev',
      subject: 'Product update',
      html: '<p>Hello from a nuxt-backend broadcast.</p>',
    }) as { id: string }
    broadcastId.value = broadcast.id
    await sendBroadcast({ broadcastId: broadcast.id })
    marketingMsg.value = `Broadcast ${broadcast.id} sent to audience ${audience.id}.`
  }
  catch (e) { marketingMsg.value = e instanceof Error ? e.message : 'Marketing failed' }
  finally { marketingPending.value = false }
}

// --- Webhook activity feed (Polar events) -----------------------------------
const webhookEvents = useQuery(api.billing.listWebhookEvents)

// --- Live aggregate count ---------------------------------------------------
const messageCount = useCount(api.aggregates.countMessages)

// --- Search -----------------------------------------------------------------
const term = ref('')
const { results, isLoading } = useSearch(api.search.searchMessages, term, { debounce: 200 })

// --- Durable workflow -------------------------------------------------------
const startWorkflow = useMutation(api.workflows.startDemoWorkflow)
const workflowId = ref<string | null>(null)
const workflowPending = ref(false)
const workflowStatus = useWorkflowStatus(api.workflows.getWorkflowStatus, workflowId)

async function runWorkflow() {
  workflowPending.value = true
  try {
    workflowId.value = await startWorkflow({ label: new Date().toLocaleTimeString() })
  }
  finally {
    workflowPending.value = false
  }
}

const workflowTone = computed(() => {
  switch (workflowStatus.value?.type) {
    case 'completed': return 'ok'
    case 'failed': return 'err'
    case 'inProgress': return 'signal'
    default: return 'muted'
  }
})
const workflowLabel = computed(() => {
  if (!workflowId.value) return 'idle'
  return workflowStatus.value?.type ?? 'starting…'
})

// --- Rate limiter -----------------------------------------------------------
const ping = useMutation(api.rateLimiter.ping)
const pingPending = ref(false)
const pingAllowed = ref(0)
const pingBlocked = ref(0)
const pingRetryAfter = ref<number | null>(null)

async function runPing() {
  pingPending.value = true
  try {
    const { ok, retryAfter } = await ping({})
    if (ok) {
      pingAllowed.value++
      pingRetryAfter.value = null
    }
    else {
      pingBlocked.value++
      pingRetryAfter.value = retryAfter ?? null
    }
  }
  finally {
    pingPending.value = false
  }
}

function highlight(text: string): string {
  const q = term.value.trim()
  if (!q) return text
  return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '«$1»')
}

const deliveryTone = computed(() => {
  if (delivery.isError.value) return 'err'
  if (delivery.isDelivered.value) return 'ok'
  return 'signal'
})
</script>

<template>
  <div class="page">
    <PageHeader
      tag="auth · polar · resend · workflow · rate-limiter · search"
      title="Batteries-included SaaS backend"
      live
    >
      Auth, billing, and email are wired to each other: the Better Auth user is
      the billing customer, Resend handles every transactional + marketing email,
      and Polar drives subscriptions, prepaid credits and discounts. Unconfigured
      features degrade gracefully instead of erroring.
    </PageHeader>

    <!-- Account -->
    <LabPanel
      label="auth · better-auth"
      title="account (passwordless)"
      tone="signal"
    >
      <p class="hint">
        Signed in as <strong>{{ user?.name }}</strong>
        <span class="mono"> &lt;{{ user?.email }}&gt;</span>. Passkey + email-OTP only —
        change-email and delete-account are confirmed via Resend.
      </p>
      <div class="email-row">
        <input
          v-model="newEmail"
          placeholder="new email address"
          autocomplete="off"
          spellcheck="false"
        >
        <LabButton
          variant="signal"
          :disabled="!newEmail.trim()"
          @click="doChangeEmail"
        >
          Change email
        </LabButton>
      </div>
      <div
        class="row"
        style="margin-top: 0.6rem"
      >
        <LabButton
          variant="ghost"
          @click="signOut"
        >
          Sign out
        </LabButton>
        <LabButton
          variant="ghost"
          @click="doDelete"
        >
          Delete account
        </LabButton>
      </div>
      <p
        v-if="accountMsg"
        class="email-state ok"
      >
        {{ accountMsg }}
      </p>
    </LabPanel>

    <div class="stats">
      <LabPanel
        label="aggregate"
        title="messages count"
        tone="signal"
      >
        <p class="metric">
          {{ messageCount }}
        </p>
        <p class="hint">
          Kept in sync by a trigger on every write.
        </p>
      </LabPanel>

      <LabPanel
        label="polar"
        title="subscription"
        tone="signal"
      >
        <p class="metric">
          {{ plan }}
        </p>
        <p class="hint">
          {{ billing.subscription.value === undefined ? 'loading…' : billing.isSubscribed.value ? 'active' : 'no active subscription' }}
        </p>
      </LabPanel>
    </div>

    <!-- Billing -->
    <LabPanel
      label="billing · polar"
      title="plans, checkout & portal"
      tone="signal"
    >
      <p class="hint">
        Products from your Polar org. <code>&lt;CheckoutLink&gt;</code> opens the
        embedded checkout (7-day trial); <code>&lt;CustomerPortalLink&gt;</code>
        manages the subscription. Both link to the Better Auth user automatically.
      </p>
      <p
        v-if="products.length === 0"
        class="email-state"
      >
        No products — set <code>POLAR_ORGANIZATION_TOKEN</code> and create products in Polar.
      </p>
      <div
        v-else
        class="row"
      >
        <CheckoutLink
          v-for="[key, product] in subscribable"
          :key="key"
          :products="product ? [product.id] : []"
          :trial-interval-count="7"
          trial-interval="day"
          class="link-btn"
        >
          {{ product?.name ?? key }}
        </CheckoutLink>
      </div>
      <div
        class="row"
        style="margin-top: 0.6rem"
      >
        <CustomerPortalLink class="link-btn ghost">
          Manage subscription
        </CustomerPortalLink>
        <LabButton
          v-if="billing.isSubscribed.value"
          variant="ghost"
          @click="billing.cancel()"
        >
          Cancel
        </LabButton>
      </div>
    </LabPanel>

    <div class="stats">
      <!-- Feature gate -->
      <LabPanel
        label="features"
        title="feature gate"
        tone="signal"
      >
        <p class="hint">
          <code>useFeatures().has()</code> reads webhook-synced benefit grants.
        </p>
        <p
          class="email-state"
          :class="features.has('premium') ? 'ok' : ''"
        >
          <StatusPill :tone="features.has('premium') ? 'ok' : 'muted'">
            {{ features.has('premium') ? 'premium unlocked' : 'premium locked' }}
          </StatusPill>
        </p>
        <LabButton
          variant="ghost"
          @click="syncEntitlements({})"
        >
          Sync entitlements
        </LabButton>
      </LabPanel>

      <!-- Prepaid credits -->
      <LabPanel
        label="credits"
        title="prepaid credits"
        tone="signal"
      >
        <p class="hint">
          <code>useCredits()</code> balance; top up with a one-time pack, spend
          server-side.
        </p>
        <p
          class="metric"
          style="font-size: 1.4rem"
        >
          {{ credits.balance.value ?? '—' }}
        </p>
        <div class="row">
          <CheckoutLink
            v-if="creditPackId"
            :products="[creditPackId]"
            class="link-btn"
          >
            Buy credits
          </CheckoutLink>
          <LabButton
            variant="signal"
            :disabled="!credits.meterId.value"
            @click="spendCredit"
          >
            Spend 1 credit
          </LabButton>
        </div>
      </LabPanel>
    </div>

    <!-- Discounts -->
    <LabPanel
      label="discounts · polar"
      title="create coupon"
      tone="neutral"
    >
      <p class="hint">
        Create a percentage discount via the Polar SDK. Customers can apply codes
        at checkout.
      </p>
      <div class="email-row">
        <input
          v-model.number="discountPercent"
          type="number"
          min="1"
          max="100"
        >
        <LabButton
          variant="signal"
          :loading="discountPending"
          @click="makeDiscount"
        >
          Create {{ discountPercent }}% off
        </LabButton>
      </div>
      <p
        v-if="discountCode"
        class="email-state ok mono"
      >
        code/id: {{ discountCode }}
      </p>
    </LabPanel>

    <!-- Transactional email -->
    <LabPanel
      label="email · resend"
      title="transactional + live status"
      tone="signal"
    >
      <p class="hint">
        Delivered through the nested Resend component. <code>useEmailStatus</code>
        tracks delivery live (advances on Resend webhooks). Defaults to Resend's
        <code>delivered@resend.dev</code> test inbox.
      </p>
      <div class="email-row">
        <input
          v-model="emailTo"
          placeholder="delivered@resend.dev"
          autocomplete="off"
          spellcheck="false"
        >
        <LabButton
          variant="signal"
          :loading="emailPending"
          @click="sendTestEmail"
        >
          {{ emailPending ? 'Sending…' : 'Send' }}
        </LabButton>
      </div>
      <p
        v-if="lastEmailId"
        class="email-state"
      >
        <StatusPill :tone="deliveryTone">
          {{ delivery.status.value ?? 'queued' }}
        </StatusPill>
        <span class="mono">id {{ lastEmailId }}</span>
      </p>
      <p
        v-else-if="emailSkipped"
        class="email-state"
      >
        Skipped — set <code>RESEND_API_KEY</code> to enable delivery.
      </p>
      <p
        v-else-if="emailError"
        class="email-state err mono"
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
          <span class="mono">{{ e.to }}</span> — {{ e.subject }}
        </li>
      </ul>
    </LabPanel>

    <!-- Marketing email -->
    <LabPanel
      label="marketing · resend"
      title="audiences & broadcasts"
      tone="neutral"
    >
      <p class="hint">
        Audience → contact → broadcast via the Resend SDK, one click. Uses the
        test recipient only.
      </p>
      <LabButton
        variant="signal"
        :loading="marketingPending"
        @click="runMarketing"
      >
        Create audience, add contact & send broadcast
      </LabButton>
      <p
        v-if="marketingMsg"
        class="email-state ok mono"
      >
        {{ marketingMsg }}
      </p>
    </LabPanel>

    <!-- Webhook activity feed -->
    <LabPanel
      label="webhooks"
      title="event activity feed"
      tone="neutral"
    >
      <p class="hint">
        Live feed of Polar webhook events. Resend events advance email status above.
      </p>
      <ul
        v-if="webhookEvents && webhookEvents.length"
        class="feed"
      >
        <li
          v-for="ev in webhookEvents"
          :key="ev._id"
        >
          <StatusPill tone="signal">
            {{ ev.source }}
          </StatusPill>
          <span class="mono">{{ ev.type }}</span> — {{ ev.summary }}
        </li>
      </ul>
      <p
        v-else
        class="email-state"
      >
        No events yet — configure webhooks (<code>POLAR_WEBHOOK_SECRET</code>) and
        subscribe to trigger some.
      </p>
    </LabPanel>

    <div class="stats">
      <LabPanel
        label="workflow"
        title="durable run"
        tone="signal"
      >
        <p class="hint">
          A durable workflow: an email step, a 4s pause, then a result. Survives
          restarts; watched live via <code>useWorkflowStatus</code>.
        </p>
        <div class="row">
          <LabButton
            variant="signal"
            :loading="workflowPending"
            @click="runWorkflow"
          >
            {{ workflowPending ? 'Starting…' : 'Start workflow' }}
          </LabButton>
          <StatusPill :tone="workflowTone">
            {{ workflowLabel }}
          </StatusPill>
        </div>
        <p
          v-if="workflowStatus?.type === 'completed'"
          class="email-state ok mono"
        >
          {{ workflowStatus.result }}
        </p>
      </LabPanel>

      <LabPanel
        label="rate-limiter"
        title="demoPing · 5/min"
        tone="signal"
      >
        <p class="hint">
          A token bucket of 5 / minute per user. Click rapidly to drain it — the
          endpoint returns <code>retryAfter</code> instead of throwing.
        </p>
        <div class="row">
          <LabButton
            variant="signal"
            :loading="pingPending"
            @click="runPing"
          >
            Ping
          </LabButton>
          <StatusPill tone="ok">
            {{ pingAllowed }} ok
          </StatusPill>
          <StatusPill :tone="pingBlocked ? 'err' : 'muted'">
            {{ pingBlocked }} blocked
          </StatusPill>
        </div>
        <p
          v-if="pingRetryAfter != null"
          class="email-state err"
        >
          Throttled — retry in {{ Math.ceil(pingRetryAfter / 1000) }}s.
        </p>
      </LabPanel>
    </div>

    <LabPanel
      label="migrations"
      title="online & batched"
      tone="neutral"
    >
      <p class="hint">
        Safe, online, batched schema migrations. The
        <code>backfillMessagesCount</code> migration seeds the aggregate
        idempotently. Run from the CLI:
      </p>
      <pre class="cmd">npx convex run migrations:run '{ "fn": "migrations:backfillMessagesCount" }'</pre>
    </LabPanel>

    <LabPanel
      label="search"
      title="search.searchMessages"
      tone="signal"
      flush
    >
      <form
        class="input-row"
        @submit.prevent
      >
        <input
          v-model="term"
          placeholder="Search messages as you type…"
          autocomplete="off"
        >
        <span
          v-if="isLoading"
          class="spinner"
        />
      </form>

      <div class="results">
        <div
          v-if="!term.trim()"
          class="results-state"
        >
          <span class="empty-glyph">⌕</span>
          <p>Type to search the full-text index.</p>
        </div>
        <div
          v-else-if="results.length === 0 && !isLoading"
          class="results-state"
        >
          <p>No matches for “{{ term }}”.</p>
        </div>
        <template v-else>
          <div
            v-for="m in results"
            :key="m._id"
            class="result fade-up"
          >
            <strong>{{ m.author }}</strong>
            <p class="result-text">
              {{ highlight(m.text) }}
            </p>
          </div>
        </template>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.page { max-width: 680px; }

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.metric {
  margin: 0;
  font-family: var(--mono);
  font-size: 2rem;
  font-weight: 700;
  color: var(--signal);
  line-height: 1.1;
}
.hint { margin: 0 0 0.6rem; font-size: 0.72rem; color: var(--ink-dim); line-height: 1.5; }
.hint code, .email-state code {
  font-family: var(--mono);
  font-size: 0.92em;
  color: var(--signal);
}

.row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.link-btn {
  display: inline-block;
  padding: 0.45rem 0.8rem;
  border-radius: var(--radius);
  background: var(--signal);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}
.link-btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--edge); }

.feed {
  margin: 0.7rem 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.74rem;
  color: var(--ink-dim);
}
.feed li { display: flex; align-items: center; gap: 0.4rem; }

.email-row { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.email-row input {
  flex: 1;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
}
.email-row input:focus { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-dim); }
.email-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.7rem 0 0;
  font-size: 0.78rem;
  color: var(--ink-dim);
  word-break: break-all;
}
.email-state.ok { color: var(--ok); }
.email-state.err { color: var(--err); }
.mono { font-family: var(--mono); }

.cmd {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--ink);
  font-family: var(--mono);
  font-size: 0.72rem;
  overflow-x: auto;
  white-space: pre;
}

.input-row { display: flex; align-items: center; border-bottom: 1px solid var(--edge); }
.input-row input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: var(--ink);
  font-size: 0.875rem;
  outline: none;
}
.input-row input::placeholder { color: var(--ink-faint); }

.results {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 200px;
  padding: 1rem;
}
.results-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 0.5rem;
  color: var(--ink-dim);
  font-size: 0.85rem;
}
.empty-glyph { font-size: 1.75rem; opacity: 0.3; }
.results-state p { margin: 0; }

.result { padding: 0.5rem 0.6rem; border-radius: 6px; background: var(--signal-dim); }
.result strong { font-size: 0.78rem; font-weight: 600; }
.result-text { margin: 0.15rem 0 0; font-size: 0.85rem; line-height: 1.45; word-break: break-word; }

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 0.75rem;
  border: 2px solid var(--edge);
  border-top-color: var(--signal);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
</style>
