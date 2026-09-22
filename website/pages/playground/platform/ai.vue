<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// The prepaid budget every metered call draws from: the 'credits' meter named
// in backend/billing.ts. Reactive, so the debit shows the instant a call
// reserves it — before the model has even answered.
const credits = useCredits('credits')

// ── Metered action (ai.meteredAction) ─────────────────────────────
// reserve → run → settle: the reservation lands in the reactive cache at
// once, the provider event is ingested only when the handler succeeds, and a
// failed run releases the reservation — nothing charged.
const transform = useAction(api.ai.transform)
const transformText = ref('Meter this sentence')
const simulateFailure = ref(false)
const transforming = ref(false)
const transformResult = ref<{ transformed: string, reversed: string, chargedTo: string, cost: number } | null>(null)
const transformError = ref<string | null>(null)

// The session's settle log — what each run cost, or released.
const settled = ref<Array<{ at: number, cost: number, ok: boolean }>>([])
const settledUnits = computed(() => settled.value.reduce((sum, entry) => sum + (entry.ok ? entry.cost : 0), 0))

async function runTransform() {
  transforming.value = true
  transformResult.value = null
  transformError.value = null
  try {
    const result = await transform({
      text: transformText.value.trim() || 'Meter this sentence',
      fail: simulateFailure.value,
    })
    transformResult.value = result
    settled.value = [{ at: Date.now(), cost: result.cost, ok: true }, ...settled.value].slice(0, 8)
  }
  catch (error) {
    transformError.value = error instanceof Error ? error.message : 'Transform failed'
    // The action costs one credit ('credits' counts events); a failed run
    // released exactly that.
    settled.value = [{ at: Date.now(), cost: 1, ok: false }, ...settled.value].slice(0, 8)
  }
  finally { transforming.value = false }
}

// ── Metered streaming (ai.stream · useAiStream) ───────────────────
// The minimal stream demo also lives on the Credits page; this is the
// dedicated one, with the limiter and budget state beside it.
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
    case 'pending': return 'ok'
    default: return 'muted'
  }
})

// ── Rate limit + budget ───────────────────────────────────────────
// Every metered action and stream checks the `ai` limit per billing entity
// before it reserves (DEFAULT_LIMITS: a token bucket of 30/min, burst 10).
// `rateLimiter.authLimits` reads that bucket live for the caller's entity,
// so each run above drains it here. The optional per-entity credit budget
// (`setupAi({ budget })`, recorded under the `aiBudget` window) is not
// configured on this deployment — the panel says so instead of inventing it.
const limits = useQuery(api.rateLimiter.authLimits)
const aiBucket = computed(() => {
  const entry = limits.value?.ai
  if (!entry) return null
  return {
    value: Math.max(0, Math.floor(entry.value)),
    capacity: entry.config.capacity ?? entry.config.rate,
    rate: entry.config.rate,
    periodSeconds: Math.round(entry.config.period / 1000),
  }
})
const limitState = computed(() => ({
  ai: limits.value?.ai ?? null,
  budget: 'not configured — setupAi({ budget: { units, period } })',
}))

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="ai.meteredAction · ai.stream · useAiStream"
      title="Metered AI"
      live
      experimental
    >
      The rails for selling metered AI features — <code>setupAi</code> wraps an
      action or a token stream so it is rate-limited per billing entity and
      prepaid-credit-metered with reserve → run → settle. A failed run charges
      nothing; usage recording <em>is</em> the provider event. Credits come
      from <NuxtLink to="/playground/platform/credits">Credits</NuxtLink>.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="budget · balance"
        :value="credits.balance.value ?? '—'"
        tone="ok"
        :loading="credits.isLoading.value"
        hint="useCredits('credits') · live"
      />
      <MetricCard
        label="ai bucket"
        :value="aiBucket ? `${aiBucket.value}/${aiBucket.capacity}` : '—'"
        :tone="aiBucket && aiBucket.value === 0 ? 'warn' : 'ok'"
        :hint="aiBucket ? `${aiBucket.rate} per ${aiBucket.periodSeconds}s per billing entity` : 'rateLimiter.authLimits'"
      />
      <MetricCard
        label="settled this session"
        :value="settledUnits"
        unit="credits"
        hint="provider events ingested"
      />
    </div>

    <LabPanel
      label="ai.meteredAction"
      title="Metered transform"
      tone="ok"
    >
      <div class="row">
        <input
          v-model="transformText"
          class="input text-input"
          type="text"
          placeholder="Text to transform"
          @keydown.enter.prevent="runTransform"
        >
        <LabButton
          variant="primary"
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
        tone="warn"
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
          <span class="result-key mono">cost</span>
          <span class="mono">{{ transformResult.cost }} credit · settled</span>
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
      <ul
        v-if="settled.length"
        class="settle-log"
      >
        <li
          v-for="entry in settled"
          :key="entry.at"
          class="fade-up"
        >
          <StatusPill
            :tone="entry.ok ? 'ok' : 'warn'"
            dot
          >
            {{ entry.ok ? `settled ${entry.cost}` : `released ${entry.cost}` }}
          </StatusPill>
          <time class="mono">{{ clock(entry.at) }}</time>
        </li>
      </ul>
      <p class="hint">
        The balance drops the instant the action starts — an atomic cache
        reservation, settled against the provider only after the handler
        returns. At zero the spend throws instead (strictly prepaid), and
        <code>ctx.usage</code> tells the handler who is being charged.
      </p>
    </LabPanel>

    <LabPanel
      label="ai.stream · useAiStream"
      title="Metered streaming"
    >
      <div class="row">
        <input
          v-model="streamPrompt"
          class="input text-input"
          type="text"
          placeholder="Prompt to stream back"
          @keydown.enter.prevent="runStream"
        >
        <LabButton
          variant="primary"
          :loading="echo.isStreaming.value"
          @click="runStream"
        >
          Stream (1 credit)
        </LabButton>
        <LabButton
          variant="secondary"
          :disabled="!echo.isStreaming.value"
          @click="echo.stop()"
        >
          Stop
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
        Tokens stream over HTTP from <code>/ai/stream</code> while persisting
        server-side — reload mid-stream and the text is still here (the
        reactive <code>body</code> query takes over). Credits settle only when
        the stream completes; <em>Stop</em> aborts the driving fetch and the
        server releases the unfinished spend.
        <span
          v-if="echo.streamId.value"
          class="mono"
        >stream {{ echo.streamId.value }}</span>
      </p>
    </LabPanel>

    <LabPanel
      label="rate limit · budget"
      title="What guards a metered call"
      variant="well"
    >
      <div
        v-if="aiBucket"
        class="bucket"
      >
        <span class="mono bucket-name">ai</span>
        <div
          class="meter"
          aria-hidden="true"
        >
          <div
            class="meter-fill"
            :style="{ width: `${(aiBucket.value / Math.max(1, aiBucket.capacity)) * 100}%` }"
          />
        </div>
        <span class="mono bucket-count">{{ aiBucket.value }}/{{ aiBucket.capacity }}</span>
      </div>
      <p
        v-else
        class="hint"
      >
        Sign in to see your billing entity's <code>ai</code> bucket.
      </p>
      <StateReadout
        class="limit-readout"
        label="rateLimiter.authLimits().ai · setupAi budget"
        :value="limitState"
        :tone="aiBucket && aiBucket.value === 0 ? 'warn' : 'ok'"
      />
      <p class="hint">
        Two guards run before a credit is reserved. The <code>ai</code> token
        bucket (seeded in <code>DEFAULT_LIMITS</code>, keyed by billing entity,
        so a workspace shares one) refuses with <code>retryAfter</code> when it
        is empty. The optional budget (<code>setupAi({ budget })</code>) is a
        fixed window over spend <em>value</em> — "500 credits a day per
        workspace", not 500 calls — recorded under the <code>aiBudget</code>
        limit; this deployment leaves it unset. The
        <NuxtLink to="/playground/platform/rate-limit">Rate limiting</NuxtLink>
        page shows the same bucket draining from the other side.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.text-input { flex: 1; min-width: 200px; width: auto; }
.fail-toggle { margin-top: 0.7rem; }

.result {
  margin-top: 0.9rem; padding: 0.7rem 0.85rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.78rem;
}
.result-row { display: flex; gap: 0.7rem; align-items: baseline; }
.result-key { color: var(--ink-faint); font-size: 0.68rem; min-width: 90px; }

.msg { margin: 0.7rem 0 0; font-size: 0.78rem; }
.msg.err { color: var(--err); }

.settle-log { list-style: none; margin: 0.9rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.settle-log li { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; border-radius: var(--r-sm); background: var(--surface); box-shadow: var(--raise-sm); }
.settle-log time { font-size: 0.68rem; color: var(--ink-dim); }

.stream-out {
  margin: 0.9rem 0 0.4rem; padding: 0.8rem 0.9rem; border-radius: var(--r-sm);
  background: var(--sink); box-shadow: var(--inset-sm);
  font-size: 0.8rem; line-height: 1.6; min-height: 3.6rem;
  white-space: pre-wrap; word-break: break-word;
}

.bucket { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.8rem; }
.bucket-name { font-size: 0.75rem; width: 5.5rem; }
.bucket-count { font-size: 0.7rem; color: var(--ink-dim); }
.meter { flex: 1; height: 10px; border-radius: 99px; background: var(--sink); box-shadow: var(--inset-sm); overflow: hidden; }
.meter-fill { height: 100%; background: var(--ok); border-radius: 99px; transition: width 0.3s var(--ease-out); }
.limit-readout { margin-bottom: 0.8rem; }
</style>
