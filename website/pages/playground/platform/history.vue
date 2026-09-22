<script setup lang="ts">
import { computed, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

// The stable billing-history surface, live-verified in one place: the
// packaged <BillingHistory> / <UsageHistory> / <CreditsLowBanner> on top,
// and beside them the composables they are built on. Every row is read from
// the provider's own ledger (orders API, events API) through getOrders /
// getInvoiceUrl / getUsageHistory — this package mirrors nothing locally, so
// what renders here is what the invoice will say.
const credits = useCredits('credits')

// The banner renders only while balance < threshold, so a visitor with a
// healthy sandbox balance can push the threshold past it to see the nudge —
// and lower it to watch the banner withdraw.
const threshold = ref(1000)

// The raw composables: the same deployment functions the components bind to,
// held in separate instances so paging the readout never moves the component.
const orders = useOrders({ limit: 5 })
const usage = useUsage({ meter: 'credits', limit: 5 })

const ordersState = computed(() => ({
  orders: orders.orders.value,
  page: orders.page.value,
  total: orders.total.value,
  pageCount: orders.pageCount.value,
  hasMore: orders.hasMore.value,
  hasPrevious: orders.hasPrevious.value,
  isLoading: orders.isLoading.value,
  error: orders.error.value,
}))

const usageState = computed(() => ({
  events: usage.events.value,
  page: usage.page.value,
  total: usage.total.value,
  pageCount: usage.pageCount.value,
  units: usage.units.value,
  hasMore: usage.hasMore.value,
  hasPrevious: usage.hasPrevious.value,
  isLoading: usage.isLoading.value,
  error: usage.error.value,
}))

// `invoice(id, { open: false })` hands the URL back instead of opening it —
// the readout shows what the provider returned; the component's own button
// is the one that opens the PDF.
const invoiceReadout = ref<{ orderId: string, url: string | null } | null>(null)
const invoicePending = ref<string | null>(null)
async function fetchInvoice(orderId: string) {
  invoicePending.value = orderId
  try {
    invoiceReadout.value = { orderId, url: await orders.invoice(orderId, { open: false }) }
  }
  finally { invoicePending.value = null }
}

// What the packaged components report through their emits.
const notice = ref<string | null>(null)
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useOrders · useUsage · BillingHistory · UsageHistory · CreditsLowBanner"
      title="Billing history"
      live
    >
      The customer-facing history surface: past charges with their invoice
      links, metered consumption event by event, and the low-balance nudge.
      Nothing is mirrored locally — every row is the provider's own record, so
      the list can never disagree with what the customer was billed.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="balance"
        :value="credits.balance.value ?? '—'"
        tone="ok"
        :loading="credits.isLoading.value"
        hint="useCredits('credits') · live"
      />
      <MetricCard
        label="orders"
        :value="orders.total.value ?? orders.orders.value?.length ?? '—'"
        :loading="orders.isLoading.value && orders.orders.value === undefined"
        hint="useOrders · provider total"
      />
      <MetricCard
        label="units on page"
        :value="usage.units.value ?? '—'"
        :loading="usage.isLoading.value && usage.events.value === undefined"
        hint="useUsage · credits meter"
      />
    </div>

    <LabPanel
      label="CreditsLowBanner"
      title="Low-balance nudge"
      tone="warn"
    >
      <div class="row">
        <LabField
          label="threshold"
          hint="the banner renders while balance < threshold"
        >
          <input
            v-model.number="threshold"
            class="input"
            type="number"
            min="0"
            style="width: 8rem"
          >
        </LabField>
        <span class="hint">
          balance <span class="mono">{{ credits.balance.value ?? '…' }}</span>
          {{ (credits.balance.value ?? Infinity) < threshold ? '<' : '≥' }}
          threshold <span class="mono">{{ threshold }}</span>
          → {{ (credits.balance.value ?? Infinity) < threshold ? 'shown' : 'hidden' }}
        </span>
      </div>
      <div class="bk-history banner-slot">
        <CreditsLowBanner
          meter="credits"
          pack="credits100"
          :threshold="threshold"
          :redirect="false"
          @dismissed="notice = 'Banner dismissed for this component instance — it returns on the next page load while the balance is still low.'"
          @topped-up="url => notice = `Top-up checkout opened: ${url}`"
          @error="message => notice = message"
        />
        <p
          v-if="(credits.balance.value ?? Infinity) >= threshold"
          class="hint"
        >
          Nothing to show — the balance is healthy at this threshold. Raise the
          threshold above the balance to see the nudge.
        </p>
      </div>
      <p class="hint">
        Without a <code>threshold</code> prop the banner reads
        <code>appConfig.backend.billing.lowCreditsThreshold</code>; with
        <code>pack</code> the action is a real top-up checkout, without it a
        link to the pricing page.
      </p>
    </LabPanel>

    <div class="grid-2">
      <LabPanel
        label="BillingHistory"
        title="Past charges"
        tone="ok"
      >
        <div class="bk-history">
          <BillingHistory
            :limit="5"
            :redirect="false"
            @invoice="url => notice = `Invoice opened: ${url}`"
            @error="message => notice = message"
          />
        </div>
        <p class="hint">
          Reads <code>getOrders</code> and <code>getInvoiceUrl</code> from the
          scaffolded <code>billing.ts</code>. An invoice button appears only
          once the provider has finalized one — offering it earlier would open
          a 404.
        </p>
      </LabPanel>

      <LabPanel
        label="UsageHistory"
        title="Metered consumption"
        tone="ok"
      >
        <div class="bk-history">
          <UsageHistory
            meter="credits"
            :limit="5"
          />
        </div>
        <p class="hint">
          The events the metered AI page ingested when it spent credits, from
          <code>getUsageHistory</code> — the same records that drew the balance
          above down. Run a metered call on
          <NuxtLink to="/playground/platform/ai">Metered AI</NuxtLink>, then
          page here.
        </p>
      </LabPanel>
    </div>

    <p
      v-if="notice"
      class="hint"
    >
      {{ notice }}
    </p>

    <div class="grid-2">
      <LabPanel
        label="useOrders()"
        title="Raw state"
        variant="well"
      >
        <template #actions>
          <LabButton
            variant="secondary"
            size="sm"
            :disabled="!orders.hasPrevious.value || orders.isLoading.value"
            @click="orders.previous()"
          >
            Previous
          </LabButton>
          <LabButton
            variant="secondary"
            size="sm"
            :disabled="!orders.hasMore.value || orders.isLoading.value"
            @click="orders.next()"
          >
            Next
          </LabButton>
          <LabButton
            variant="secondary"
            size="sm"
            :loading="orders.isLoading.value"
            @click="orders.refresh()"
          >
            Refresh
          </LabButton>
        </template>
        <StateReadout
          :value="ordersState"
          :tone="orders.error.value ? 'err' : 'ok'"
        />
        <div
          v-if="orders.orders.value?.length"
          class="row invoice-row"
        >
          <span class="hint">invoice(id, { open: false }) →</span>
          <LabButton
            v-for="order in orders.orders.value"
            :key="order.id"
            variant="secondary"
            size="sm"
            :loading="invoicePending === order.id"
            @click="fetchInvoice(order.id)"
          >
            {{ order.invoiceNumber ?? order.id.slice(0, 8) }}
          </LabButton>
        </div>
        <StateReadout
          v-if="invoiceReadout"
          class="invoice-out"
          label="invoice"
          :value="invoiceReadout"
          :tone="invoiceReadout.url ? 'ok' : 'warn'"
        />
      </LabPanel>

      <LabPanel
        label="useUsage({ meter: 'credits' })"
        title="Raw state"
        variant="well"
      >
        <template #actions>
          <LabButton
            variant="secondary"
            size="sm"
            :disabled="!usage.hasPrevious.value || usage.isLoading.value"
            @click="usage.previous()"
          >
            Previous
          </LabButton>
          <LabButton
            variant="secondary"
            size="sm"
            :disabled="!usage.hasMore.value || usage.isLoading.value"
            @click="usage.next()"
          >
            Next
          </LabButton>
          <LabButton
            variant="secondary"
            size="sm"
            :loading="usage.isLoading.value"
            @click="usage.refresh()"
          >
            Refresh
          </LabButton>
        </template>
        <StateReadout
          :value="usageState"
          :tone="usage.error.value ? 'err' : 'ok'"
        />
        <p class="hint readout-note">
          Signed-out visitors and backends without these functions get an
          empty list, never an error — <code>error</code> only fills when a
          load actually failed. Loads happen in the browser only.
        </p>
      </LabPanel>
    </div>
  </div>
</template>

<style scoped>
.banner-slot { margin: 0.9rem 0; }
.invoice-row { margin-top: 0.8rem; }
.invoice-out { margin-top: 0.6rem; }
.readout-note { margin-top: 0.8rem; }

/* The site's `.bk-depth` token bridge (app.css) covers the auth, pricing and
   settings hooks; the history trio is bridged here with the same tokens so
   the packaged components sit on the titanium like everything else. */
.bk-history :deep([data-history='root']),
.bk-history :deep([data-usage='root']),
.bk-history :deep([data-credits='banner']) {
  --bk-accent: var(--ok);
  --bk-on-accent: var(--on-ok);
  --bk-muted: var(--ink-dim);
  --bk-edge: var(--edge);
  --bk-surface: var(--surface);
  --bk-error: var(--err);
  --bk-ok: var(--ok);
  --bk-warn: var(--warn);
  --bk-radius: var(--r-sm);
}
/* Lists and the banner are wells carved into the panel; the packaged 1px
   edge would double the outline, so it goes. */
.bk-history :deep([data-history='list']),
.bk-history :deep([data-usage='list']),
.bk-history :deep([data-credits='banner']) {
  border: 0;
  background: var(--sink);
  box-shadow: var(--inset-sm);
}
.bk-history :deep([data-history='invoice']),
.bk-history :deep([data-history='pager'] button),
.bk-history :deep([data-usage='pager'] button) {
  border: 0; border-radius: var(--r-sm); cursor: pointer;
  background: var(--grad-surface); color: var(--ink);
  box-shadow: var(--raise-sm); font: inherit; font-size: 0.76rem; font-weight: 600;
  padding: 0.34rem 0.7rem;
}
.bk-history :deep([data-history='pager'] button:disabled),
.bk-history :deep([data-usage='pager'] button:disabled) { opacity: 0.5; cursor: not-allowed; }
.bk-history :deep([data-credits='action']) {
  border: 0; box-shadow: var(--elev-1), var(--glow-ok-soft); cursor: pointer;
}
.bk-history :deep([data-credits='dismiss']) {
  border: 0; background: transparent; cursor: pointer; color: var(--ink-dim);
}
.bk-history :deep([data-history='header']),
.bk-history :deep([data-usage='header']) {
  font-family: var(--display); font-size: 1rem; font-weight: 600;
}
</style>
