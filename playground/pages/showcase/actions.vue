<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const echo = useAction(api.demo.echo)

const text = ref('Hello, Convex!')
const delay = ref(800)
const failRate = ref(0)
const pending = ref(false)
const result = ref<{ reversed: string, length: number, receivedAt: string } | null>(null)
const error = ref<string | null>(null)
const elapsed = ref<number | null>(null)

async function run() {
  pending.value = true
  error.value = null
  result.value = null
  elapsed.value = null
  const start = Date.now()
  try {
    result.value = await echo({ text: text.value, delayMs: delay.value, failRate: failRate.value })
    elapsed.value = Date.now() - start
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Action failed'
    elapsed.value = Date.now() - start
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      tag="useAction"
      title="Server actions"
    >
      <code>useAction</code> runs a Convex action — non-reactive, but free to call
      third-party APIs or do async side effects. Configure delay and fail rate to
      exercise the pending and error paths.
    </PageHeader>

    <div class="layout">
      <LabPanel
        label="input"
        title="Configuration"
      >
        <label class="field">
          <span>text</span>
          <input
            v-model="text"
            type="text"
          >
        </label>
        <div class="row">
          <label class="field">
            <span>delayMs</span>
            <input
              v-model.number="delay"
              type="number"
              min="0"
              max="5000"
              step="100"
            >
          </label>
          <label class="field">
            <span>failRate (0–1)</span>
            <input
              v-model.number="failRate"
              type="number"
              min="0"
              max="1"
              step="0.1"
            >
          </label>
        </div>
        <LabButton
          variant="signal"
          :loading="pending"
          @click="run"
        >
          {{ pending ? `Running… (~${delay}ms)` : 'Run action' }}
        </LabButton>
      </LabPanel>

      <LabPanel
        label="output"
        title="Result"
        aria-live="polite"
        :tone="error ? 'err' : result ? 'ok' : 'neutral'"
      >
        <template #actions>
          <span
            v-if="elapsed !== null"
            class="elapsed mono"
          >{{ elapsed }}ms</span>
        </template>

        <div
          v-if="pending"
          class="state"
        >
          <span class="spinner big" />
          <span>waiting for server…</span>
        </div>
        <div
          v-else-if="result"
          class="ok-wrap"
        >
          <StatusPill tone="ok">
            success
          </StatusPill>
          <StateReadout
            :value="result"
            tone="ok"
            label="action return value"
          />
        </div>
        <div
          v-else-if="error"
          class="err-wrap"
        >
          <StatusPill tone="err">
            error
          </StatusPill>
          <p class="err-msg mono">
            {{ error }}
          </p>
          <p class="err-hint">
            Set failRate to 0 and run again to recover.
          </p>
        </div>
        <div
          v-else
          class="state idle"
        >
          Click <em>Run action</em> to call the server.
        </div>
      </LabPanel>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 820px; }
.layout { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }

.field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.85rem; }
.field span { font-family: var(--mono); font-size: 0.72rem; color: var(--ink-dim); }
input[type='text'], input[type='number'] {
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
  transition: border-color var(--transition), box-shadow var(--transition);
}
input:focus { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-dim); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }

.elapsed { font-size: 0.7rem; color: var(--ink-dim); }
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 130px;
  color: var(--ink-dim);
  font-size: 0.85rem;
}
.state.idle { font-style: italic; }
.ok-wrap, .err-wrap { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; }
.err-msg { margin: 0; font-size: 0.82rem; color: var(--err); word-break: break-word; }
.err-hint { margin: 0; font-size: 0.76rem; color: var(--ink-dim); }

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--edge);
  border-top-color: var(--signal);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner.big { width: 26px; height: 26px; border-width: 2px; }

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}

@media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
</style>
