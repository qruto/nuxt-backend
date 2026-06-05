<script setup lang="ts">
// `useSubscription` is exported but marked @internal, so it is not a Nuxt
// auto-import — pull it from the package runtime directly for this showcase.
import { useSubscription } from '../../../src/runtime/vue/composables/use-subscription'

definePageMeta({ middleware: 'auth' })

// A ticking clock — the classic getCurrentValue/subscribe pair.
const time = useSubscription({
  getCurrentValue: () => new Date().toLocaleTimeString(),
  subscribe: (cb) => {
    if (!import.meta.client) return () => {}
    const id = window.setInterval(cb, 1000)
    return () => window.clearInterval(id)
  },
})

// Viewport width — bridges a DOM event into a reactive ref.
const width = useSubscription({
  getCurrentValue: () => (import.meta.client ? window.innerWidth : 0),
  subscribe: (cb) => {
    if (!import.meta.client) return () => {}
    window.addEventListener('resize', cb)
    return () => window.removeEventListener('resize', cb)
  },
})

// Browser online/offline — two events into one boolean.
const online = useSubscription({
  getCurrentValue: () => (import.meta.client ? navigator.onLine : true),
  subscribe: (cb) => {
    if (!import.meta.client) return () => {}
    window.addEventListener('online', cb)
    window.addEventListener('offline', cb)
    return () => {
      window.removeEventListener('online', cb)
      window.removeEventListener('offline', cb)
    }
  },
})
</script>

<template>
  <div>
    <PageHeader
      tag="useSubscription"
      title="External subscription bridge"
    >
      <code>useSubscription</code> turns any
      <code>{ getCurrentValue, subscribe }</code> source into a reactive
      <code>ShallowRef</code> — the same primitive the Convex client uses
      internally. Below, three plain browser APIs are bridged into live refs.
    </PageHeader>

    <div class="grid">
      <LabPanel
        label="src · 01"
        title="Interval clock"
        tone="signal"
      >
        <ClientOnly fallback="…">
          <div class="big mono">
            {{ time }}
          </div>
        </ClientOnly>
        <p class="src-note">
          setInterval(cb, 1000)
        </p>
      </LabPanel>

      <LabPanel
        label="src · 02"
        title="Viewport width"
        tone="signal"
      >
        <ClientOnly fallback="…">
          <div class="big mono">
            {{ width }}<span class="unit">px</span>
          </div>
        </ClientOnly>
        <p class="src-note">
          resize → window.innerWidth · drag the window
        </p>
      </LabPanel>

      <LabPanel
        label="src · 03"
        title="Network status"
        :tone="online ? 'ok' : 'err'"
      >
        <ClientOnly fallback="…">
          <div class="online-row">
            <SignalDot
              :tone="online ? 'ok' : 'err'"
              :pulse="online"
            />
            <span
              class="big"
              :class="online ? 'on' : 'off'"
            >{{ online ? 'ONLINE' : 'OFFLINE' }}</span>
          </div>
        </ClientOnly>
        <p class="src-note">
          online / offline events · navigator.onLine
        </p>
      </LabPanel>
    </div>

    <LabPanel
      label="pattern"
      title="The bridge"
      class="pattern"
    >
      <pre class="code mono">const value = useSubscription({
  getCurrentValue: () =&gt; navigator.onLine,
  subscribe: (cb) =&gt; {
    addEventListener('online', cb)
    addEventListener('offline', cb)
    return () =&gt; { /* cleanup */ }
  },
})</pre>
      <p class="pattern-note">
        The ref reads <code>getCurrentValue()</code> immediately, re-reads it
        whenever <code>subscribe</code>'s callback fires, and tears the listener
        down on unmount.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 1rem;
}
.big {
  font-size: 1.9rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--signal);
  font-variant-numeric: tabular-nums;
}
.big .unit { font-size: 0.9rem; color: var(--ink-dim); margin-left: 0.2rem; font-weight: 600; }
.big.on { color: var(--ok); }
.big.off { color: var(--err); }
.online-row { display: flex; align-items: center; gap: 0.6rem; }
.src-note {
  margin: 0.6rem 0 0;
  font-family: var(--mono);
  font-size: 0.7rem;
  color: var(--ink-dim);
}

.code {
  margin: 0 0 0.85rem;
  padding: 0.85rem 0.95rem;
  background: #07090e;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--signal-soft);
  overflow-x: auto;
}
.pattern-note { margin: 0; font-size: 0.84rem; color: var(--ink-dim); line-height: 1.55; }

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
