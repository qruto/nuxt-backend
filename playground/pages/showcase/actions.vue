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
    result.value = await echo({
      text: text.value,
      delayMs: delay.value,
      failRate: failRate.value,
    })
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
    <header class="page-header">
      <div class="api-tag">useAction</div>
      <h1>Server actions</h1>
      <p class="subtitle">
        <code>useAction</code> runs a Convex action — not reactive, but can call
        third-party APIs or do async side effects. Configure delay and fail rate
        to explore error handling.
      </p>
    </header>

    <div class="layout">
      <!-- Config panel -->
      <div class="config-panel">
        <h3>Configuration</h3>

        <label class="field">
          <span>Input text</span>
          <input
            v-model="text"
            type="text"
            required
          >
        </label>

        <div class="row">
          <label class="field">
            <span>Server delay (ms)</span>
            <input
              v-model.number="delay"
              type="number"
              min="0"
              max="5000"
              step="100"
            >
          </label>
          <label class="field">
            <span>Fail rate (0–1)</span>
            <input
              v-model.number="failRate"
              type="number"
              min="0"
              max="1"
              step="0.1"
            >
          </label>
        </div>

        <button
          type="button"
          class="run-btn"
          :disabled="pending"
          @click="run"
        >
          <span
            v-if="pending"
            class="spinner"
          />
          {{ pending ? `Running… (~${delay}ms)` : 'Run action' }}
        </button>
      </div>

      <!-- Result panel -->
      <div class="result-panel">
        <h3>Result</h3>

        <div
          v-if="!result && !error && !pending"
          class="idle"
        >
          Click <em>Run action</em> to see the response here.
        </div>

        <div
          v-if="pending"
          class="running"
        >
          <span class="spinner large" />
          <span>Waiting for server…</span>
          <span class="delay-hint">{{ delay }}ms configured delay</span>
        </div>

        <div
          v-if="result"
          class="success-result fade-up"
        >
          <div class="result-header">
            <span class="ok-badge">✓ Success</span>
            <span
              v-if="elapsed"
              class="elapsed"
            >{{ elapsed }}ms</span>
          </div>
          <dl>
            <div class="kv">
              <dt>reversed</dt>
              <dd>{{ result.reversed }}</dd>
            </div>
            <div class="kv">
              <dt>length</dt>
              <dd>{{ result.length }}</dd>
            </div>
            <div class="kv">
              <dt>receivedAt</dt>
              <dd>{{ result.receivedAt }}</dd>
            </div>
          </dl>
        </div>

        <div
          v-if="error"
          class="error-result fade-up"
        >
          <div class="result-header">
            <span class="err-badge">× Error</span>
            <span
              v-if="elapsed"
              class="elapsed"
            >{{ elapsed }}ms</span>
          </div>
          <p class="err-msg">{{ error }}</p>
          <p class="err-hint">
            Try running again or set fail rate to 0.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 820px; }

.page-header { margin-bottom: 1.5rem; }
.api-tag {
  font-size: 0.68rem; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.06em; color: var(--muted-color); text-transform: uppercase; margin-bottom: 0.4rem;
}
h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.3rem; letter-spacing: -0.02em; }
.subtitle { color: var(--muted-color); font-size: 0.875rem; margin: 0; line-height: 1.5; }
code {
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.85em;
  color: var(--accent); background: var(--accent-dim); padding: 0.1rem 0.35rem; border-radius: 3px;
}

.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
}

/* Config panel */
.config-panel {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}
.config-panel h3 { margin: 0; font-size: 0.875rem; font-weight: 600; color: var(--muted-color); text-transform: uppercase; letter-spacing: 0.05em; }

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.field span:first-child { font-size: 0.78rem; font-weight: 500; color: var(--muted-color); }
input[type='text'], input[type='number'] {
  padding: 0.45rem 0.625rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--text-color);
  font: inherit;
  font-size: 0.875rem;
  transition: border-color var(--transition);
}
input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; }

.run-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: var(--accent);
  color: white;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background var(--transition);
  width: 100%;
}
.run-btn:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.run-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Result panel */
.result-panel {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 200px;
}
.result-panel h3 { margin: 0; font-size: 0.875rem; font-weight: 600; color: var(--muted-color); text-transform: uppercase; letter-spacing: 0.05em; }

.idle {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-color);
  font-size: 0.875rem;
  font-style: italic;
  text-align: center;
}

.running {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--muted-color);
  font-size: 0.875rem;
}
.delay-hint { font-size: 0.75rem; opacity: 0.7; }

/* Result display */
.result-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 0.5rem;
}
.ok-badge {
  font-size: 0.75rem; font-weight: 600;
  color: var(--success);
  background: rgba(52, 211, 153, 0.12);
  padding: 0.15rem 0.5rem; border-radius: 3px;
}
.err-badge {
  font-size: 0.75rem; font-weight: 600;
  color: var(--danger-color);
  background: var(--danger-dim);
  padding: 0.15rem 0.5rem; border-radius: 3px;
}
.elapsed { font-size: 0.75rem; color: var(--muted-color); font-family: ui-monospace, SFMono-Regular, monospace; }

dl { margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.kv {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  font-size: 0.8rem;
}
dt {
  color: var(--muted-color);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.75rem;
}
dd {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, monospace;
  word-break: break-all;
  color: var(--text-color);
}

.err-msg {
  margin: 0;
  font-size: 0.875rem;
  color: var(--danger-color);
  font-family: ui-monospace, SFMono-Regular, monospace;
  word-break: break-all;
}
.err-hint {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  color: var(--muted-color);
}

/* Spinner */
.spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 1.5px solid var(--border-color);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner.large { width: 24px; height: 24px; border-width: 2px; border-top-color: var(--accent); }

@media (max-width: 600px) {
  .layout { grid-template-columns: 1fr; }
}
</style>
