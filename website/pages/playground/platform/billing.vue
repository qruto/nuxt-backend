<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const billing = useBilling()
const products = computed(() => Object.entries(billing.products.value ?? {}))
// Subscription plans exclude the one-time credit pack (key `credits`).
const subscribable = computed(() => products.value.filter(([key]) => key !== 'credits'))
const plan = computed(() => (billing.isSubscribed.value ? 'Pro' : 'Free'))
const planHint = computed(() =>
  billing.subscription.value === undefined
    ? 'loading…'
    : billing.isSubscribed.value ? 'active subscription' : 'no active subscription')

const syncEntitlements = useAction(api.billing.syncEntitlements)

// Admin: create a percentage discount via the Polar SDK.
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
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useBilling · CheckoutLink · CustomerPortalLink"
      title="Billing"
      live
    >
      Polar subscriptions linked to the Better Auth user automatically.
      <code>&lt;CheckoutLink&gt;</code> opens the embedded checkout,
      <code>&lt;CustomerPortalLink&gt;</code> manages the subscription, and
      everything is webhook-synced into a reactive cache.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="current plan"
        :value="plan"
        :tone="billing.isSubscribed.value ? 'ok' : 'neutral'"
        :hint="planHint"
      />
      <MetricCard
        label="products configured"
        :value="products.length"
        hint="from your Polar org"
      />
    </div>

    <LabPanel
      label="checkout · polar"
      title="Plans"
      tone="accent"
    >
      <p
        v-if="products.length === 0"
        class="hint"
      >
        No products — set <code>POLAR_ORGANIZATION_TOKEN</code> and create products in Polar.
      </p>
      <template v-else>
        <div class="plans">
          <div
            v-for="[key, product] in subscribable"
            :key="key"
            class="plan well"
          >
            <div class="plan-name">
              {{ product?.name ?? key }}
            </div>
            <CheckoutLink
              :products="product ? [product.id] : []"
              :trial-interval-count="7"
              trial-interval="day"
              class="checkout-btn"
            >
              Start 7-day trial
            </CheckoutLink>
          </div>
        </div>
        <div
          class="row"
          style="margin-top: 1rem"
        >
          <!-- The portal needs a Polar customer; only subscribers have one, so
               gate it (rendering it for a free user throws "Customer not found"
               in its mount hook). -->
          <template v-if="billing.isSubscribed.value">
            <CustomerPortalLink class="portal-btn">
              Manage subscription
            </CustomerPortalLink>
            <LabButton
              variant="danger"
              @click="billing.cancel()"
            >
              Cancel
            </LabButton>
          </template>
          <LabButton
            variant="ghost"
            @click="syncEntitlements({})"
          >
            Sync entitlements
          </LabButton>
        </div>
      </template>
    </LabPanel>

    <LabPanel
      label="discounts · polar"
      title="Create a coupon (admin)"
    >
      <p
        class="hint"
        style="margin-bottom: 0.85rem"
      >
        Create a percentage discount via the Polar SDK. Customers apply codes at
        checkout — also the card-free path for sandbox testing.
      </p>
      <div class="row">
        <LabField label="percent off">
          <input
            v-model.number="discountPercent"
            class="input"
            type="number"
            min="1"
            max="100"
            style="width: 7rem"
          >
        </LabField>
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
        class="code-out mono"
      >
        code / id: {{ discountCode }}
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.85rem; }
.plan { padding: 1rem; display: flex; flex-direction: column; gap: 0.85rem; }
.plan-name { font-family: var(--display); font-size: 1.05rem; font-weight: 600; }

.checkout-btn, .portal-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 0.9rem; border-radius: var(--r-sm);
  font-size: 0.82rem; font-weight: 600; text-decoration: none; cursor: pointer;
  background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent);
  transition: background var(--transition), box-shadow var(--transition);
}
.checkout-btn:hover, .portal-btn:hover { background: var(--accent-press); }
.checkout-btn:active, .portal-btn:active { box-shadow: var(--inset-sm); }
.portal-btn { background: var(--surface); color: var(--ink); box-shadow: var(--raise-sm); }

.code-out { margin: 0.85rem 0 0; font-size: 0.78rem; color: var(--ok); word-break: break-all; }
</style>
