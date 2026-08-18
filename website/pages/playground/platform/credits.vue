<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

const billing = useBilling()
// Name-first resolution: 'credits' is the meter named in backend/billing.ts —
// the client never touches a provider meter id.
const credits = useCredits('credits')
// Explicit gift view — the <GiftClaimBanner> above the metrics demonstrates
// auto-claim; this instance lists and claims manually.
const gifts = useGifts({ autoClaim: false })

const creditPackId = computed(() => billing.products.value?.credits100?.id)

// ── Metered action (ai.meteredAction) ─────────────────────────────
// reserve → run → settle: the debit hits the reactive cache instantly (watch
// the balance drop), and a failed run releases the reservation — no charge.
const transform = useAction(api.ai.transform)
const transformText = ref('Meter this sentence')
const simulateFailure = ref(false)
const transforming = ref(false)
const transformResult = ref<{ transformed: string, reversed: string, chargedTo: string } | null>(null)
const transformError = ref<string | null>(null)

async function runTransform() {
  transforming.value = true
  transformResult.value = null
  transformError.value = null
  try {
    transformResult.value = await transform({
      text: transformText.value.trim() || 'Meter this sentence',
      fail: simulateFailure.value,
    }) as typeof transformResult.value
  }
  catch (error) {
    transformError.value = error instanceof Error ? error.message : 'Transform failed'
  }
  finally { transforming.value = false }
}

// ── Metered streaming (ai.stream · useAiStream) ───────────────────
const echo = useAiStream({ start: api.ai.startEcho, body: api.ai.echoBody })
const streamPrompt = ref('Streamed tokens persist server-side, so a reload mid-stream keeps every word you already received')
const streamError = ref<string | null>(null)

async function runStream() {
  streamError.value = null
  try {
    await echo.start({ prompt: streamPrompt.value.trim() || 'Hello from the metered stream' })
  }
  catch (error) {
    streamError.value = error instanceof Error ? error.message : 'Stream failed'
  }
}

const streamTone = computed(() => {
  switch (echo.status.value) {
    case 'done': return 'ok'
    case 'error':
    case 'timeout': return 'err'
    case 'streaming':
    case 'pending': return 'signal'
    default: return 'muted'
  }
})

// Gift a credit pack to another email — the recipient receives the credits
// (attached automatically if they have an account, claimed on first sign-in
// otherwise; see the GiftClaimBanner above the metrics).
const giftEmail = ref('')
const giftMessage = ref('')
const gifting = ref(false)
const giftNotice = ref('')

async function sendGift() {
  if (!creditPackId.value || !giftEmail.value) return
  gifting.value = true
  giftNotice.value = ''
  try {
    await credits.gift(creditPackId.value, {
      recipientEmail: giftEmail.value,
      message: giftMessage.value || undefined,
    })
    giftNotice.value = `Checkout opened — once paid, ${giftEmail.value} receives the credits.`
    giftEmail.value = ''
    giftMessage.value = ''
  }
  catch (error) {
    giftNotice.value = error instanceof Error ? error.message : String(error)
  }
  finally { gifting.value = false }
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useCredits · useAiStream"
      title="Credits"
      live
    >
      The prepaid-credits model powering metered AI features: a pack or plan
      grants units to a usage meter, metered actions spend them server-side
      (reserve → run → settle), and <code>useCredits</code> reads the live
      balance. Prepaid, so spending is blocked at zero — and a failed run
      charges nothing.
    </PageHeader>

    <GiftClaimBanner class="gift-banner" />

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
        hint="granted at checkout"
      />
      <MetricCard
        label="consumed"
        :value="credits.consumed.value ?? '—'"
        hint="spent so far"
      />
    </div>

    <LabPanel
      label="meter"
      title="Top up"
      tone="accent"
    >
      <div class="row">
        <CheckoutLink
          v-if="creditPackId"
          :product-ids="[creditPackId]"
          class="buy-btn"
        >
          Buy credit pack
        </CheckoutLink>
        <span
          v-else
          class="hint"
        >No credit pack configured (product key <code>credits100</code>).</span>

        <LabButton
          variant="ghost"
          @click="credits.refresh()"
        >
          Refresh
        </LabButton>
      </div>

      <div
        class="meter"
        aria-hidden="true"
      >
        <div
          class="meter-fill"
          :style="{ width: `${Math.min(100, ((credits.balance.value ?? 0) / Math.max(1, credits.credited.value ?? 1)) * 100)}%` }"
        />
      </div>
      <p class="hint">
        meter <code>'credits'</code> → <span class="mono">{{ credits.meterId.value ?? 'not synced yet' }}</span>
        — named in <code>backend/billing.ts</code>, resolved by
        <code>useCredits('credits')</code>.
      </p>
    </LabPanel>

    <LabPanel
      label="ai.meteredAction"
      title="Metered transform"
    >
      <div class="row">
        <input
          v-model="transformText"
          class="text-input"
          type="text"
          placeholder="Text to transform"
        >
        <LabButton
          variant="signal"
          :loading="transforming"
          @click="runTransform"
        >
          Run (1 credit)
        </LabButton>
      </div>
      <LabToggle
        v-model="simulateFailure"
        class="fail-toggle"
        label="Simulate failure"
        hint="the model throws mid-run — the reserved credit is released, nothing charged"
      />
      <div
        v-if="transformResult"
        class="result"
      >
        <div class="result-row">
          <span class="result-key mono">transformed</span>
          <span class="mono">{{ transformResult.transformed }}</span>
        </div>
        <div class="result-row">
          <span class="result-key mono">reversed</span>
          <span class="mono">{{ transformResult.reversed }}</span>
        </div>
        <div class="result-row">
          <span class="result-key mono">charged to</span>
          <span class="mono">{{ transformResult.chargedTo }}</span>
        </div>
      </div>
      <p
        v-if="transformError"
        class="msg err mono"
      >
        {{ transformError }}
      </p>
      <p class="hint">
        The balance above drops the instant the action starts — the debit is an
        atomic cache reservation, settled against the provider only after the
        run succeeds. At zero the spend throws instead (strictly prepaid).
      </p>
    </LabPanel>

    <LabPanel
      label="ai.stream · useAiStream"
      title="Metered streaming"
    >
      <div class="row">
        <input
          v-model="streamPrompt"
          class="text-input"
          type="text"
          placeholder="Prompt to stream back"
        >
        <LabButton
          variant="signal"
          :loading="echo.isStreaming.value"
          @click="runStream"
        >
          Stream (1 credit)
        </LabButton>
        <StatusPill
          :tone="streamTone"
          dot
        >
          {{ echo.status.value }}
        </StatusPill>
      </div>
      <pre class="stream-out mono">{{ echo.text.value || '· · ·' }}</pre>
      <p
        v-if="streamError"
        class="msg err mono"
      >
        {{ streamError }}
      </p>
      <p class="hint">
        Tokens stream over HTTP while persisting server-side — reload
        mid-stream and the text is still here (the reactive
        <code>body</code> query takes over). Credits settle only when the
        stream completes; an interrupted stream never charges.
      </p>
    </LabPanel>

    <LabPanel
      label="gifts"
      title="Gift a credit pack"
    >
      <form
        class="row"
        @submit.prevent="sendGift"
      >
        <input
          v-model="giftEmail"
          class="gift-input"
          type="email"
          placeholder="recipient@example.com"
          required
        >
        <input
          v-model="giftMessage"
          class="gift-input"
          type="text"
          placeholder="Message (optional)"
        >
        <LabButton
          variant="signal"
          type="submit"
          :loading="gifting"
          :disabled="!creditPackId || !giftEmail"
        >
          Gift 100 credits
        </LabButton>
      </form>
      <p
        v-if="giftNotice"
        class="hint"
      >
        {{ giftNotice }}
      </p>
      <p class="hint">
        The recipient gets an email; if they don't have an account yet, the
        gift attaches automatically on their first sign-in
        (<code>useGifts</code> auto-claim).
      </p>
    </LabPanel>

    <LabPanel
      label="useGifts · manual"
      title="Received gifts"
      variant="well"
    >
      <p
        v-if="!gifts.received.value?.length"
        class="hint"
      >
        Nothing yet — gifts sent to your email show up here (the banner above
        auto-claims; this panel is the explicit
        <code>useGifts({ autoClaim: false })</code> view and claim history).
      </p>
      <div
        v-else
        class="gift-rows"
      >
        <div
          v-for="gift in gifts.received.value"
          :key="gift.id"
          class="gift-row"
        >
          <StatusPill
            :tone="gift.status === 'claimed' ? 'ok' : 'signal'"
            dot
          >
            {{ gift.status }}
          </StatusPill>
          <span class="gift-from">from {{ gift.purchaserEmail ?? gift.purchaserName ?? 'someone' }}</span>
          <span
            v-if="gift.message"
            class="gift-note hint"
          >“{{ gift.message }}”</span>
          <LabButton
            v-if="gift.status === 'paid'"
            size="sm"
            variant="signal"
            :loading="gifts.isClaiming.value"
            @click="gifts.claim(gift.id)"
          >
            Claim
          </LabButton>
        </div>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.buy-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.5rem 0.9rem; border-radius: var(--r-sm);
  font-size: 0.82rem; font-weight: 600; text-decoration: none; cursor: pointer;
  background: var(--accent); color: var(--on-accent); box-shadow: var(--raise-accent);
}
.buy-btn:hover { background: var(--accent-press); }

.meter { height: 12px; border-radius: 99px; background: var(--sink); box-shadow: var(--inset-sm); overflow: hidden; margin: 1.1rem 0 0.6rem; }
.meter-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.3s var(--ease-out); }

.text-input {
  flex: 1; min-width: 200px; padding: 0.5rem 0.7rem; border-radius: var(--r-sm);
  border: 1px solid var(--line); background: var(--sink); color: inherit; font-size: 0.85rem;
}

.fail-toggle { margin-top: 0.7rem; }

.result {
  margin-top: 0.9rem; padding: 0.7rem 0.85rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem;
}
.result-row { display: flex; gap: 0.7rem; align-items: baseline; }
.result-key { color: var(--ink-faint); font-size: 0.68rem; min-width: 90px; }

.stream-out {
  margin: 0.9rem 0 0.4rem; padding: 0.8rem 0.9rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-size: 0.8rem; line-height: 1.6; min-height: 3.6rem;
  white-space: pre-wrap; word-break: break-word;
}

.msg { margin: 0.7rem 0 0; font-size: 0.78rem; }
.msg.err { color: var(--err); }

.gift-input {
  flex: 1; min-width: 180px; padding: 0.5rem 0.7rem; border-radius: var(--r-sm);
  border: 1px solid var(--line); background: var(--sink); color: inherit; font-size: 0.85rem;
}

.gift-rows { display: flex; flex-direction: column; gap: 0.45rem; }
.gift-row { display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; }
.gift-from { font-weight: 600; }
.gift-note { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.gift-banner :deep([data-gift='item']) {
  display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;
  padding: 0.7rem 0.9rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
}
.gift-banner :deep([data-gift='claim']) {
  padding: 0.4rem 0.8rem; border-radius: var(--r-sm); border: none; cursor: pointer;
  background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: 0.8rem;
}
</style>
