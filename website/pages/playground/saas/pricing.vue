<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const billing = useBilling()
const credits = useCredits()
const features = useFeatures()
const events = useQuery(api.billing.listWebhookEvents)

// The demo catalog: three monthly plans that each grant prepaid credits, plus
// two one-time top-up packs. Names and prices resolve live from the Polar
// products configured in `backend/billing.ts`.
const PLANS = [
  { key: 'starter', credits: 50, blurb: 'For trying things out.', features: [] },
  { key: 'pro', credits: 200, blurb: 'For products finding their feet.', features: ['premium'] },
  { key: 'ultra', credits: 500, blurb: 'Everything, unlocked.', features: ['premium', 'ultra'] },
] as const
const PACKS = [
  { key: 'credits100', credits: 100 },
  { key: 'credits500', credits: 500 },
] as const

const products = computed(() => billing.products.value ?? {})

// Polar's product payload is loosely typed on the client — dig out the fixed
// monthly price defensively.
function priceOf(key: string): string {
  const prices = products.value[key]?.prices as Array<{ priceAmount?: number }> | undefined
  const amount = prices?.[0]?.priceAmount
  return amount == null ? '—' : `€${(amount / 100).toFixed(0)}`
}

const currentPlan = computed(() =>
  PLANS.find(plan => products.value[plan.key]?.id === billing.subscription.value?.productId))
const planLabel = computed(() =>
  billing.isLoading.value ? '…' : currentPlan.value?.key ?? 'free')

const pending = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

async function run(key: string, fn: () => Promise<unknown>) {
  errorMsg.value = null
  pending.value = key
  try {
    await fn()
  }
  catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Something went wrong'
  }
  finally { pending.value = null }
}

// Same-tab redirect checkout: Polar sends the customer back to this page and
// the webhook-synced cache flips the UI live.
function subscribe(key: string) {
  const id = products.value[key]?.id
  if (id) run(key, () => billing.checkout(id, { redirect: true }))
}
function switchPlan(key: string) {
  const id = products.value[key]?.id
  if (id) run(key, () => billing.changePlan(id))
}
function buyPack(key: string) {
  const id = products.value[key]?.id
  if (id) run(key, () => credits.topUp(id, { redirect: true }))
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
      tag="useBilling · useCredits · useFeatures"
      title="Pricing"
      live
    >
      A real pricing page on the stack: three monthly plans, each granting
      prepaid credits, and one-time top-up packs. Checkout redirects to Polar
      and back; entitlements sync through webhooks into a reactive cache.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="current plan"
        :value="planLabel"
        :tone="billing.isSubscribed.value ? 'ok' : 'neutral'"
        :loading="billing.isLoading.value"
        :hint="billing.isSubscribed.value ? 'active subscription' : 'no active subscription'"
      />
      <MetricCard
        label="credits"
        :value="credits.balance.value ?? '—'"
        tone="accent"
        :loading="credits.isLoading.value"
        hint="prepaid balance"
      />
    </div>

    <LabPanel
      label="plans · polar"
      title="Choose a plan"
      tone="accent"
    >
      <p
        v-if="Object.keys(products).length === 0"
        class="hint"
      >
        No products — set <code>BILLING_ACCESS_TOKEN</code> and configure the
        catalog in <code>backend/billing.ts</code>.
      </p>
      <div
        v-else
        class="plans"
      >
        <div
          v-for="plan in PLANS"
          :key="plan.key"
          class="plan well"
          :class="{ current: currentPlan?.key === plan.key }"
        >
          <div class="plan-head">
            <span class="plan-name">{{ products[plan.key]?.name ?? plan.key }}</span>
            <StatusPill
              v-if="currentPlan?.key === plan.key"
              tone="ok"
              dot
            >
              current
            </StatusPill>
          </div>
          <div class="plan-price">
            {{ priceOf(plan.key) }}<span class="per">/mo</span>
          </div>
          <p class="plan-blurb">
            {{ plan.blurb }}
          </p>
          <ul class="plan-perks">
            <li>
              <Icon
                name="credits"
                :size="14"
              />
              {{ plan.credits }} credits / month
            </li>
            <li
              v-for="feature in plan.features"
              :key="feature"
            >
              <Icon
                name="check"
                :size="14"
              />
              {{ feature }} access
            </li>
          </ul>
          <LabButton
            v-if="currentPlan?.key === plan.key"
            variant="danger"
            :loading="pending === plan.key"
            @click="run(plan.key, () => billing.cancel())"
          >
            Cancel plan
          </LabButton>
          <LabButton
            v-else-if="billing.isSubscribed.value"
            variant="signal"
            :loading="pending === plan.key"
            @click="switchPlan(plan.key)"
          >
            Switch to {{ products[plan.key]?.name ?? plan.key }}
          </LabButton>
          <LabButton
            v-else
            variant="signal"
            :loading="pending === plan.key"
            :disabled="billing.isLoading.value"
            @click="subscribe(plan.key)"
          >
            Subscribe
          </LabButton>
        </div>
      </div>

      <div
        class="row"
        style="margin-top: 1rem"
      >
        <StatusPill
          :tone="features.has('premium') ? 'ok' : 'muted'"
          dot
        >
          premium
        </StatusPill>
        <StatusPill
          :tone="features.has('ultra') ? 'ok' : 'muted'"
          dot
        >
          ultra
        </StatusPill>
        <template v-if="billing.isSubscribed.value">
          <CustomerPortalLink class="portal-btn">
            Manage subscription
          </CustomerPortalLink>
        </template>
        <LabButton
          variant="ghost"
          @click="credits.refresh()"
        >
          Refresh entitlements
        </LabButton>
      </div>
      <p
        v-if="errorMsg"
        class="msg err"
      >
        {{ errorMsg }}
      </p>
    </LabPanel>

    <LabPanel
      label="credits · one-time"
      title="Top up credits"
    >
      <div class="row">
        <LabButton
          v-for="pack in PACKS"
          :key="pack.key"
          variant="signal"
          :loading="pending === pack.key"
          :disabled="!products[pack.key]"
          @click="buyPack(pack.key)"
        >
          {{ products[pack.key]?.name ?? pack.key }} · {{ priceOf(pack.key) }}
        </LabButton>
        <span class="hint">One-time checkout — units land on the Credits meter.</span>
      </div>
    </LabPanel>

    <LabPanel
      label="webhooks · live"
      title="Billing activity"
      variant="well"
    >
      <p
        v-if="!events?.length"
        class="hint"
      >
        No events yet — subscribe or top up and watch Polar's webhooks arrive.
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
          <SignalDot
            :tone="event.source === 'auth' ? 'accent' : 'ok'"
            :pulse="false"
          />
          <span class="feed-type mono">{{ event.type }}</span>
          <span class="feed-summary">{{ event.summary }}</span>
          <span class="feed-time mono">{{ timeAgo(event.createdAt) }}</span>
        </div>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.85rem; }
.plan { padding: 1.1rem; display: flex; flex-direction: column; gap: 0.6rem; }
.plan.current { box-shadow: var(--inset), 0 0 0 2px var(--accent); }
.plan-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.plan-name { font-family: var(--display); font-size: 1.05rem; font-weight: 600; }
.plan-price { font-family: var(--display); font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; }
.plan-price .per { font-size: 0.85rem; font-weight: 500; color: var(--ink-dim); margin-left: 0.15rem; }
.plan-blurb { margin: 0; font-size: 0.78rem; color: var(--ink-dim); }
.plan-perks { list-style: none; margin: 0 0 0.4rem; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }
.plan-perks li { display: flex; align-items: center; gap: 0.45rem; font-size: 0.8rem; color: var(--ink); }
.plan-perks li :deep(svg) { color: var(--accent); flex-shrink: 0; }

.portal-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 0.9rem; border-radius: var(--r-sm);
  font-size: 0.82rem; font-weight: 600; text-decoration: none; cursor: pointer;
  background: var(--surface); color: var(--ink); box-shadow: var(--raise-sm);
  transition: box-shadow var(--transition);
}
.portal-btn:hover { box-shadow: var(--raise); }

.msg { margin: 0.85rem 0 0; font-size: 0.8rem; }
.msg.err { color: var(--err); }

.feed { display: flex; flex-direction: column; gap: 0.45rem; }
.feed-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.78rem; }
.feed-type { color: var(--ink); font-size: 0.72rem; }
.feed-summary { color: var(--ink-dim); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.feed-time { color: var(--ink-faint); font-size: 0.68rem; }
</style>
