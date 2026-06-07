<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({ middleware: 'auth' })

interface ServerRun {
  authenticated: boolean
  counterBefore: number
  counterAfter: number
  echo: { reversed: string, length: number, receivedAt: string }
  elapsedMs: number
  ranAt: string
}

const pending = ref(false)
const result = ref<ServerRun | null>(null)
const error = ref<string | null>(null)

async function run() {
  pending.value = true
  error.value = null
  try {
    result.value = await $fetch<ServerRun>('/api/server-demo', { method: 'POST' })
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Server call failed'
  }
  finally {
    pending.value = false
  }
}

// Non-auth preload: a public query rendered on the server, hydrated into a live
// client subscription via usePreloadedQuery (no loading flash on first paint).
const { data: preloaded } = await useFetch('/api/flaky.preload', { key: 'flaky.preload' })
const flaky = usePreloadedQuery(preloaded.value!)
</script>

<template>
  <div>
    <PageHeader
      tag="backendAuth · fetchQuery · fetchMutation · fetchAction"
      title="Server functions (Nuxt)"
    >
      Convex isn't only a browser client. From any Nitro server route,
      <code>backendAuth(event)</code> forwards the signed-in user's token so
      <code>fetchAuthQuery</code>, <code>fetchAuthMutation</code> and
      <code>fetchAuthAction</code> run <em>on the server</em> — no WebSocket, no
      hydration — against the same per-user data.
    </PageHeader>

    <div class="grid">
      <LabPanel
        label="control"
        title="POST /api/server-demo"
        tone="warn"
      >
        <p class="lead">
          One request triggers three server-side Convex calls in sequence:
          read a counter, increment it, read it back, then run an action.
        </p>
        <ol class="steps">
          <li><code>fetchAuthQuery(api.counter.get)</code></li>
          <li><code>fetchAuthMutation(api.counter.increment)</code></li>
          <li><code>fetchAuthQuery(api.counter.get)</code> <span class="again">again</span></li>
          <li><code>fetchAuthAction(api.demo.echo)</code></li>
        </ol>
        <LabButton
          variant="signal"
          :loading="pending"
          @click="run"
        >
          {{ pending ? 'Running on server…' : 'Run on server' }}
        </LabButton>
        <p
          v-if="error"
          class="error"
        >
          {{ error }}
        </p>
      </LabPanel>

      <LabPanel
        label="output"
        title="Server response"
        aria-live="polite"
        :tone="error ? 'err' : result ? 'ok' : 'neutral'"
      >
        <template #actions>
          <span
            v-if="result"
            class="elapsed mono"
          >{{ result.elapsedMs }}ms</span>
        </template>

        <div
          v-if="pending"
          class="state"
        >
          <span class="spinner big" />
          <span>executing on Nitro…</span>
        </div>
        <div
          v-else-if="result"
          class="ok-wrap"
        >
          <div class="counter-line">
            <StatusPill tone="ok">
              authenticated
            </StatusPill>
            <span class="counter-delta mono">
              server counter
              <b>{{ result.counterBefore }}</b>
              <span class="arrow">→</span>
              <b class="hot">{{ result.counterAfter }}</b>
            </span>
          </div>
          <StateReadout
            :value="result"
            tone="ok"
            label="$fetch('/api/server-demo')"
          />
        </div>
        <div
          v-else
          class="state idle"
        >
          Click <em>Run on server</em> to invoke Convex from Nitro.
        </div>
      </LabPanel>
    </div>

    <LabPanel
      label="ssr · preload"
      title="usePreloadedQuery (non-auth)"
      tone="signal"
      class="preload"
    >
      <p class="lead">
        The public <code>api.demo.flaky</code> query was run on the server with
        <code>preloadQuery</code> and handed to <code>usePreloadedQuery</code> —
        rendered correctly on first paint, then kept live on the client. This is
        the non-auth sibling of the Todos page's <code>usePreloadedAuthQuery</code>.
      </p>
      <StateReadout
        :value="flaky"
        tone="signal"
        label="usePreloadedQuery(...).value"
      />
    </LabPanel>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
  margin-bottom: 1rem;
}
.lead { margin: 0 0 0.85rem; font-size: 0.85rem; color: var(--ink-dim); line-height: 1.55; }
.steps {
  margin: 0 0 1rem;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
}
.steps li { font-size: 0.8rem; color: var(--ink-dim); }
.steps code {
  font-family: var(--mono);
  font-size: 0.82em;
  color: var(--warn);
  background: var(--warn-dim);
  padding: 0.04rem 0.3rem;
  border-radius: 4px;
}
.again { font-size: 0.72rem; color: var(--ink-faint); font-style: italic; }

.elapsed { font-size: 0.7rem; color: var(--ink-dim); }
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 150px;
  color: var(--ink-dim);
  font-size: 0.85rem;
}
.state.idle { font-style: italic; }
.ok-wrap { display: flex; flex-direction: column; gap: 0.75rem; align-items: flex-start; }
.counter-line { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.counter-delta { font-size: 0.8rem; color: var(--ink-dim); display: inline-flex; align-items: center; gap: 0.4rem; }
.counter-delta b { color: var(--ink); font-variant-numeric: tabular-nums; }
.counter-delta b.hot { color: var(--ok); }
.counter-delta .arrow { color: var(--ink-faint); }
.error { margin: 0.75rem 0 0; font-size: 0.82rem; color: var(--err); word-break: break-word; }

.preload { margin-bottom: 1rem; }

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--edge);
  border-top-color: var(--warn);
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

@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>
