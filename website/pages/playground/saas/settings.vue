<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const workspace = useOrganization()
const billing = useBilling()
const credits = useCredits()
const consumeCredit = useAction(api.billing.consumeCredit)

// --- Workspace ------------------------------------------------------------

const newName = ref('')
const creating = ref(false)
const msg = ref<{ text: string, ok: boolean } | null>(null)

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

async function createWorkspace() {
  msg.value = null
  creating.value = true
  try {
    unwrapAuth(await workspace.create({ name: newName.value.trim(), slug: slugify(newName.value) }))
    msg.value = { text: `Workspace “${newName.value.trim()}” created.`, ok: true }
    newName.value = ''
  }
  catch (e) {
    msg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
  finally { creating.value = false }
}

// --- Billing summary --------------------------------------------------------

const products = computed(() => billing.products.value ?? {})
const planName = computed(() => {
  const productId = billing.subscription.value?.productId
  if (!productId) return 'Free'
  return Object.values(products.value).find(p => p?.id === productId)?.name ?? 'Unknown plan'
})
// Polar's subscription payload is loosely typed on the client.
const periodEnd = computed(() => {
  const raw = billing.subscription.value?.currentPeriodEnd
  return typeof raw === 'string' || typeof raw === 'number' ? new Date(raw).toLocaleDateString() : null
})
const cancelAtPeriodEnd = computed(() => billing.subscription.value?.cancelAtPeriodEnd === true)

const canceling = ref(false)
async function cancelPlan() {
  msg.value = null
  canceling.value = true
  try {
    await billing.cancel()
    msg.value = { text: 'Subscription set to cancel at period end.', ok: true }
  }
  catch (e) {
    msg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
  finally { canceling.value = false }
}

// --- Credits ----------------------------------------------------------------

const PACKS = ['credits100', 'credits500'] as const
const spending = ref(false)
const topUpPending = ref<string | null>(null)

async function spendCredit() {
  if (!credits.meterId.value) return
  msg.value = null
  spending.value = true
  try {
    await consumeCredit({ meterId: credits.meterId.value })
  }
  catch (e) {
    msg.value = { text: e instanceof Error ? e.message : 'Failed', ok: false }
  }
  finally { spending.value = false }
}

async function buyPack(key: string) {
  const id = products.value[key]?.id
  if (!id) return
  topUpPending.value = key
  try {
    await credits.topUp(id, { redirect: true })
  }
  finally { topUpPending.value = null }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useOrganization · useBilling · useCredits"
      title="Settings"
    >
      Workspace, plan and credits in one place — the billing entity is the
      active workspace, so switching workspaces switches the subscription.
    </PageHeader>

    <LabPanel
      label="workspace"
      title="Workspaces"
      tone="accent"
    >
      <div class="ws-list">
        <div
          v-for="ws in workspace.organizations.value"
          :key="ws.id"
          class="ws-row"
          :class="{ active: ws.id === workspace.current.value?.id }"
        >
          <SignalDot
            :tone="ws.id === workspace.current.value?.id ? 'ok' : 'accent'"
            :pulse="false"
          />
          <span class="ws-name">{{ ws.name }}</span>
          <span class="ws-slug mono">{{ ws.slug }}</span>
          <StatusPill
            v-if="ws.id === workspace.current.value?.id"
            tone="ok"
            dot
          >
            active
          </StatusPill>
          <LabButton
            v-else
            variant="ghost"
            size="sm"
            @click="workspace.setActive(ws.id)"
          >
            Switch
          </LabButton>
        </div>
      </div>

      <LabField
        label="new workspace"
        hint="you can own several — each with its own plan"
      >
        <div class="row">
          <input
            v-model="newName"
            class="input"
            placeholder="Acme Inc"
            autocomplete="off"
            spellcheck="false"
            style="flex: 1"
          >
          <LabButton
            variant="signal"
            :loading="creating"
            :disabled="!newName.trim()"
            @click="createWorkspace"
          >
            Create
          </LabButton>
        </div>
      </LabField>
    </LabPanel>

    <LabPanel
      label="subscription"
      title="Plan & billing"
    >
      <div class="grid-auto">
        <MetricCard
          label="plan"
          :value="planName"
          :tone="billing.isSubscribed.value ? 'ok' : 'neutral'"
          :loading="billing.isLoading.value"
          :hint="periodEnd ? `renews ${periodEnd}` : 'no active subscription'"
        />
        <MetricCard
          label="status"
          :value="billing.subscription.value?.status ?? 'free'"
          :tone="cancelAtPeriodEnd ? 'warn' : 'neutral'"
          :hint="cancelAtPeriodEnd ? 'cancels at period end' : 'auto-renewing'"
        />
      </div>
      <div
        class="row"
        style="margin-top: 1rem"
      >
        <NuxtLink
          to="/playground/saas/pricing"
          class="pricing-link"
        >
          View plans
        </NuxtLink>
        <template v-if="billing.isSubscribed.value">
          <CustomerPortalLink class="portal-btn">
            Billing portal
          </CustomerPortalLink>
          <LabButton
            variant="danger"
            :loading="canceling"
            :disabled="cancelAtPeriodEnd"
            @click="cancelPlan"
          >
            Cancel plan
          </LabButton>
        </template>
      </div>
    </LabPanel>

    <LabPanel
      label="credits"
      title="Credits"
      variant="well"
    >
      <div class="grid-auto">
        <MetricCard
          label="balance"
          :value="credits.balance.value ?? '—'"
          tone="accent"
          :loading="credits.isLoading.value"
          hint="available units"
        />
        <MetricCard
          label="credited"
          :value="credits.credited.value ?? '—'"
          tone="ok"
          hint="granted total"
        />
        <MetricCard
          label="consumed"
          :value="credits.consumed.value ?? '—'"
          hint="spent so far"
        />
      </div>
      <div
        class="row"
        style="margin-top: 1rem"
      >
        <LabButton
          variant="signal"
          :loading="spending"
          :disabled="!credits.meterId.value || (credits.balance.value ?? 0) <= 0"
          @click="spendCredit"
        >
          Spend 1 credit
        </LabButton>
        <LabButton
          v-for="pack in PACKS"
          :key="pack"
          variant="ghost"
          :loading="topUpPending === pack"
          :disabled="!products[pack]"
          @click="buyPack(pack)"
        >
          Buy {{ products[pack]?.name ?? pack }}
        </LabButton>
        <LabButton
          variant="ghost"
          @click="credits.refresh()"
        >
          Refresh
        </LabButton>
      </div>
    </LabPanel>

    <p
      v-if="msg"
      class="msg"
      :class="{ ok: msg.ok, err: !msg.ok }"
    >
      {{ msg.text }}
    </p>
  </div>
</template>

<style scoped>
.ws-list { display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 1rem; }
.ws-row {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.7rem; border-radius: var(--r-sm);
  background: var(--surface); box-shadow: var(--raise-sm);
}
.ws-row.active { box-shadow: var(--raise); }
.ws-name { font-weight: 600; font-size: 0.85rem; }
.ws-slug { flex: 1; font-size: 0.7rem; color: var(--ink-faint); }

.pricing-link, .portal-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 0.9rem; border-radius: var(--r-sm);
  font-size: 0.82rem; font-weight: 600; text-decoration: none; cursor: pointer;
  background: var(--surface); color: var(--ink); box-shadow: var(--raise-sm);
  transition: box-shadow var(--transition);
}
.pricing-link:hover, .portal-btn:hover { box-shadow: var(--raise); }
.pricing-link { background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent); }

.msg { margin: 0; font-size: 0.8rem; }
.msg.ok { color: var(--ok); }
.msg.err { color: var(--err); }
</style>
