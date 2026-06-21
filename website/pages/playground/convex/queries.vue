<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Value } from 'convex/values'
import type { FunctionReference } from 'convex/server'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

/**
 * Real-life framing: a small live dashboard. `useConvexQueries` holds a whole
 * map of subscriptions open at once and you toggle sources on/off; `useQuery`
 * with `'skip'` shows conditional subscription; the dev drawer exposes the
 * 1.39 object-form `useQuery_experimental`.
 */

// ── Reactive query map → many live subscriptions ──────────────────
const includeCounter = ref(true)
const includeTodos = ref(true)
const includeMessages = ref(true)

const queryMap = computed(() => {
  const map: Record<string, { query: FunctionReference<'query'>, args: Record<string, Value> }> = {}
  if (includeCounter.value) map.counter = { query: api.counter.get, args: { name: 'demo' } }
  if (includeTodos.value) map.todos = { query: api.todos.list, args: {} }
  if (includeMessages.value) map.messages = { query: api.messages.list, args: {} }
  return map
})
const results = useConvexQueries(queryMap)

const sources = computed(() => {
  const list: Array<{ key: string, api: string }> = []
  if (includeCounter.value) list.push({ key: 'counter', api: 'counter.get' })
  if (includeTodos.value) list.push({ key: 'todos', api: 'todos.list' })
  if (includeMessages.value) list.push({ key: 'messages', api: 'messages.list' })
  return list
})

function statusOf(r: unknown): 'pending' | 'error' | 'success' {
  return r === undefined ? 'pending' : r instanceof Error ? 'error' : 'success'
}
function toneOf(r: unknown) {
  return statusOf(r) === 'success' ? 'ok' : statusOf(r) === 'error' ? 'err' : 'signal'
}
function summarize(key: string, r: unknown): string {
  if (r === undefined) return 'loading…'
  if (r instanceof Error) return r.message
  if (Array.isArray(r)) return `${r.length} row${r.length === 1 ? '' : 's'}`
  if (key === 'counter') return `value = ${(r as { value: number }).value}`
  return String(r)
}
const overview = computed(() =>
  Object.fromEntries(sources.value.map(s => [s.key, statusOf(results.value[s.key])])),
)

// ── Single query + conditional skip ───────────────────────────────
const watching = ref(true)
const counter = useQuery(api.counter.get, () => (watching.value ? { name: 'demo' } : 'skip'))

// ── Dev drawer: experimental object-form toggles ──────────────────
const shouldFail = ref(false)
const throwOnError = ref(false)
const skip = ref(false)
const probeKey = computed(() => `${shouldFail.value}-${throwOnError.value}-${skip.value}`)
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useQuery · useConvexQueries · useQuery_experimental"
      title="Queries"
      live
    >
      Reactive reads against Convex. One <code>useConvexQueries</code> call holds a
      whole map of live subscriptions open; <code>useQuery</code> drives a single
      one and supports conditional <code>'skip'</code>. Everything updates the
      instant the backend changes.
    </PageHeader>

    <div class="grid-2">
      <LabPanel
        label="control"
        title="Subscription map"
      >
        <div class="toggles">
          <LabToggle
            v-model="includeCounter"
            label="counter.get"
            hint="{ name: 'demo' }"
          />
          <LabToggle
            v-model="includeTodos"
            label="todos.list"
            hint="{}"
          />
          <LabToggle
            v-model="includeMessages"
            label="messages.list"
            hint="{}"
          />
        </div>
        <StateReadout
          :value="overview"
          label="status by key"
          tone="accent"
        />
      </LabPanel>

      <LabPanel
        label="output"
        title="useConvexQueries(map)"
        tone="accent"
      >
        <div
          v-if="sources.length === 0"
          class="empty"
        >
          No queries selected — toggle one on.
        </div>
        <div
          v-else
          class="results"
        >
          <div
            v-for="s in sources"
            :key="s.key"
            class="rcard well"
          >
            <div class="rcard-head">
              <code class="rcard-api">{{ s.api }}</code>
              <StatusPill :tone="toneOf(results[s.key])">
                {{ statusOf(results[s.key]) }}
              </StatusPill>
            </div>
            <div
              class="rcard-val mono"
              :class="{ err: statusOf(results[s.key]) === 'error' }"
            >
              {{ summarize(s.key, results[s.key]) }}
            </div>
          </div>
        </div>
      </LabPanel>
    </div>

    <LabPanel
      label="single"
      title="useQuery + skip"
    >
      <div class="single">
        <div class="single-val">
          <span class="mono big">{{ watching ? (counter?.value ?? '…') : 'skipped' }}</span>
          <span class="hint">counter.get({ name: 'demo' })</span>
        </div>
        <LabToggle
          v-model="watching"
          tone="ok"
          :label="watching ? 'Subscribed' : 'Skipped'"
          :hint="watching ? 'live value' : `passing 'skip' tears the subscription down`"
        />
      </div>
    </LabPanel>

    <details class="dev">
      <summary>Object form — useQuery_experimental</summary>
      <div class="dev-body">
        <p
          class="hint"
          style="margin-bottom: 0.75rem"
        >
          The 1.39 experimental shape returns a discriminated union
          <code>{ status, data?, error? }</code> instead of throwing — unless you
          opt into <code>throwOnError</code>, caught by an
          <code>&lt;ErrorBoundary&gt;</code>.
        </p>
        <div
          class="row"
          style="margin-bottom: 0.85rem"
        >
          <LabToggle
            v-model="shouldFail"
            tone="xp"
            label="shouldFail"
          />
          <LabToggle
            v-model="throwOnError"
            tone="xp"
            label="throwOnError"
          />
          <LabToggle
            v-model="skip"
            tone="xp"
            label="skip"
          />
        </div>
        <ErrorBoundary>
          <ExperimentalQueryProbe
            :key="probeKey"
            :should-fail="shouldFail"
            :throw-on-error="throwOnError"
            :skip="skip"
          />
          <template #fallback="{ error, reset }">
            <LabPanel
              label="boundary"
              title="errorCaptured"
              tone="err"
            >
              <p class="err-text mono">
                {{ error.message }}
              </p>
              <LabButton
                variant="ghost"
                size="sm"
                @click="reset"
              >
                reset boundary
              </LabButton>
            </LabPanel>
          </template>
        </ErrorBoundary>
      </div>
    </details>
  </div>
</template>

<style scoped>
.toggles { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1rem; }
.results { display: flex; flex-direction: column; gap: 0.6rem; }
.rcard { padding: 0.7rem 0.8rem; }
.rcard-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.4rem; }
.rcard-api { font-family: var(--mono); font-size: 0.74rem; color: var(--accent-soft); }
.rcard-val { font-size: 0.82rem; color: var(--ink); word-break: break-word; }
.rcard-val.err { color: var(--err); }
.empty { padding: 1.5rem; text-align: center; color: var(--ink-dim); font-size: 0.85rem; }

.single { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.single-val { display: flex; flex-direction: column; gap: 0.2rem; }
.big { font-size: 2rem; font-weight: 700; color: var(--accent-soft); line-height: 1; }
.err-text { color: var(--err); font-size: 0.82rem; margin: 0 0 0.6rem; }
</style>
