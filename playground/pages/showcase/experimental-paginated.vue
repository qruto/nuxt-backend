<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const shouldFail = ref(false)
const throwOnError = ref(false)
const skip = ref(false)

const seed = useMutation(api.logs.seed)
const clear = useMutation(api.logs.clear)
const seeding = ref(false)

async function seedLogs() {
  seeding.value = true
  try {
    await seed({ count: 18 })
  }
  finally {
    seeding.value = false
  }
}

const probeKey = computed(() => `${shouldFail.value}-${throwOnError.value}-${skip.value}`)
</script>

<template>
  <div>
    <PageHeader
      tag="usePaginatedQuery_experimental"
      title="Paginated query · object form"
      experimental
    >
      The experimental paginated form reshapes the TitleCase pagination result
      into <code>{ data, status, canLoadMore, isLoading, error, loadMore }</code>
      with a lowercase status. It reuses the same <code>logs</code> data as the
      stable page, through <code>demo.flakyPaginated</code>.
    </PageHeader>

    <LabPanel
      label="fixture"
      title="Seed data"
      class="seedbar"
    >
      <div class="seed-row">
        <span class="seed-hint">The list reads your <code>logs</code> table. Seed a batch, then page through it.</span>
        <div class="seed-actions">
          <LabButton
            variant="ghost"
            size="sm"
            :loading="seeding"
            @click="seedLogs"
          >
            Seed 18 logs
          </LabButton>
          <LabButton
            variant="danger"
            size="sm"
            @click="clear()"
          >
            Clear
          </LabButton>
        </div>
      </div>
    </LabPanel>

    <div class="grid">
      <LabPanel
        label="control"
        title="Options"
        tone="xp"
      >
        <div class="controls">
          <LabToggle
            v-model="shouldFail"
            tone="xp"
            label="args.shouldFail"
            hint="server throws → status: 'error'"
          />
          <LabToggle
            v-model="throwOnError"
            tone="xp"
            label="throwOnError"
            hint="throw instead of returning the error"
          />
          <LabToggle
            v-model="skip"
            tone="xp"
            label="args: 'skip'"
            hint="pause → status: 'pending'"
          />
        </div>
        <pre class="call mono">usePaginatedQuery_experimental(() => ({
  query: api.demo.flakyPaginated,
  args: {{ skip ? "'skip'" : `{ shouldFail: ${shouldFail} }` }},
  initialNumItems: 5,
  throwOnError: {{ throwOnError }},
}))</pre>
      </LabPanel>

      <LabPanel
        label="output"
        title="Live result"
        tone="xp"
      >
        <ErrorBoundary :key="probeKey">
          <ExperimentalPaginatedProbe
            :should-fail="shouldFail"
            :throw-on-error="throwOnError"
            :skip="skip"
          />
          <template #fallback="{ error, reset }">
            <div class="boundary">
              <div class="boundary-top">
                <StatusPill tone="err">
                  thrown
                </StatusPill>
                <span class="lab-label">caught by &lt;ErrorBoundary&gt;</span>
              </div>
              <p class="boundary-msg mono">
                {{ error.message }}
              </p>
              <LabButton
                variant="ghost"
                size="sm"
                @click="() => { shouldFail = false; reset() }"
              >
                Recover
              </LabButton>
            </div>
          </template>
        </ErrorBoundary>
      </LabPanel>
    </div>

    <LabPanel
      label="notes"
      title="What this verifies"
      class="notes"
    >
      <ul>
        <li><strong>pending</strong> — first page loading (or skipped): <code>data: undefined</code>, <code>isLoading: true</code>.</li>
        <li><strong>success</strong> — <code>data</code> is the accumulated rows; <code>canLoadMore</code> flips false once exhausted.</li>
        <li><strong>error</strong> — returned in-band as <code>{ status: 'error', error }</code> with <code>throwOnError</code> off.</li>
        <li><strong>loadMore(n)</strong> — appends the next page; disabled when <code>canLoadMore</code> is false.</li>
      </ul>
    </LabPanel>
  </div>
</template>

<style scoped>
.seedbar { margin-bottom: 1rem; }
.seed-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.seed-hint { font-size: 0.82rem; color: var(--ink-dim); }
.seed-actions { display: flex; gap: 0.5rem; }

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
  margin-bottom: 1rem;
}
.controls { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1rem; }
.call {
  margin: 0;
  padding: 0.75rem 0.85rem;
  background: #07090e;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--ink-dim);
  white-space: pre-wrap;
}
.boundary { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; }
.boundary-top { display: flex; align-items: center; gap: 0.6rem; }
.boundary-msg { margin: 0; font-size: 0.82rem; color: var(--err); word-break: break-word; }

.notes ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.notes li { font-size: 0.82rem; color: var(--ink-dim); line-height: 1.5; }
.notes strong { color: var(--ink); font-family: var(--mono); font-size: 0.92em; }

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--xp);
  background: var(--xp-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}

@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>
