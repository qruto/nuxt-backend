<script setup lang="ts">
import { computed, ref } from 'vue'

definePageMeta({ middleware: 'auth' })

const shouldFail = ref(false)
const throwOnError = ref(false)
const skip = ref(false)

// Remount the probe (and reset the boundary) whenever the configuration
// changes, so toggling `shouldFail` off cleanly recovers from a thrown error.
const probeKey = computed(() => `${shouldFail.value}-${throwOnError.value}-${skip.value}`)
</script>

<template>
  <div>
    <PageHeader
      tag="useQuery_experimental"
      title="Reactive query · object form"
      experimental
    >
      The 1.39 experimental form takes an options object and returns a
      <code>{ status, data?, error? }</code> union as a <code>ShallowRef</code>.
      Flip the controls to walk every branch — and watch <code>throwOnError</code>
      throw into an error boundary instead.
    </PageHeader>

    <div class="grid">
      <LabPanel
        label="control"
        title="Query options"
        tone="xp"
      >
        <div class="controls">
          <LabToggle
            v-model="shouldFail"
            tone="xp"
            label="args.shouldFail"
            hint="server throws when on → status: 'error'"
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
            hint="pause the subscription → status: 'pending'"
          />
        </div>

        <pre class="call mono">useQuery_experimental({
  query: api.demo.flaky,
  args: {{ skip ? "'skip'" : `{ shouldFail: ${shouldFail} }` }},
  throwOnError: {{ throwOnError }},
})</pre>
      </LabPanel>

      <LabPanel
        label="output"
        title="Live result"
        tone="xp"
      >
        <ErrorBoundary :key="probeKey">
          <ExperimentalQueryProbe
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
              <p class="boundary-hint">
                With <code>throwOnError: true</code> the error is thrown from a
                <code>watchEffect</code> and propagates to the nearest
                <code>errorCaptured</code> boundary — exactly like React.
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
        <li><strong>pending</strong> — first load, or while <code>args: 'skip'</code>. Shape is just <code>{ status: 'pending' }</code>.</li>
        <li><strong>success</strong> — <code>{ status: 'success', data }</code>; <code>data</code> updates reactively as the server result changes.</li>
        <li><strong>error</strong> — <code>{ status: 'error', error }</code> returned in-band (no throw) when <code>throwOnError</code> is off.</li>
        <li><strong>throwOnError</strong> — removes the <code>'error'</code> branch from the type and throws at runtime instead.</li>
      </ul>
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
.controls {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 1rem;
}
.call {
  margin: 0;
  padding: 0.75rem 0.85rem;
  background: var(--panel-2);
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--ink-dim);
  white-space: pre-wrap;
}

.boundary { display: flex; flex-direction: column; gap: 0.6rem; align-items: flex-start; }
.boundary-top { display: flex; align-items: center; gap: 0.6rem; }
.boundary-msg {
  margin: 0;
  font-size: 0.82rem;
  color: var(--err);
  word-break: break-word;
}
.boundary-hint { margin: 0; font-size: 0.78rem; color: var(--ink-dim); line-height: 1.5; }

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
