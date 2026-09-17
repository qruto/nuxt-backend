<script setup lang="ts">
import { onScopeDispose, shallowRef, type ShallowRef } from 'vue'

definePageMeta({ middleware: 'auth' })

/**
 * The subscription bridge, spelled out: read a value now, re-read it whenever
 * the source says it changed, and tear the listener down with the component.
 * The Convex client keeps its own copy of this primitive internally; the
 * showcase uses a local one so it stays on the public surface.
 */
function useExternalValue<T>(source: { getCurrentValue: () => T, subscribe: (onChange: () => void) => () => void }): ShallowRef<T> {
  const value = shallowRef(source.getCurrentValue()) as ShallowRef<T>
  const stop = source.subscribe(() => {
    value.value = source.getCurrentValue()
  })
  onScopeDispose(stop)
  return value
}

const time = useExternalValue({
  getCurrentValue: () => new Date().toLocaleTimeString(),
  subscribe: (cb) => {
    if (!import.meta.client) return () => {}
    const id = window.setInterval(cb, 1000)
    return () => window.clearInterval(id)
  },
})

const width = useExternalValue({
  getCurrentValue: () => (import.meta.client ? window.innerWidth : 0),
  subscribe: (cb) => {
    if (!import.meta.client) return () => {}
    window.addEventListener('resize', cb)
    return () => window.removeEventListener('resize', cb)
  },
})

const online = useExternalValue({
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
  <div class="stack">
    <PageHeader
      tag="subscription"
      title="Subscription bridge"
    >
      A <code>{ getCurrentValue, subscribe }</code> source bridged into a
      reactive <code>ShallowRef</code> — the primitive the Convex client keeps
      internally for its live queries, written out in a dozen lines. Three
      plain browser APIs, bridged into live refs.
    </PageHeader>

    <div class="grid-auto">
      <LabPanel
        label="src · 01"
        title="Interval clock"
        tone="ok"
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
        tone="ok"
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
        :title="'Network status'"
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
          online / offline events
        </p>
      </LabPanel>
    </div>

    <LabPanel
      label="pattern"
      title="The bridge"
      variant="well"
    >
      <pre class="code mono">const value = useExternalValue({
  getCurrentValue: () =&gt; navigator.onLine,
  subscribe: (cb) =&gt; {
    addEventListener('online', cb)
    addEventListener('offline', cb)
    return () =&gt; { /* cleanup */ }
  },
})</pre>
      <p
        class="hint"
        style="margin-top: 0.85rem"
      >
        The ref reads <code>getCurrentValue()</code> immediately, re-reads it
        whenever <code>subscribe</code>'s callback fires, and tears the listener
        down on unmount.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.big { font-size: 1.9rem; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
.big .unit { font-size: 0.9rem; color: var(--ink-dim); margin-left: 0.2rem; font-weight: 600; }
.big.on { color: var(--ok); }
.big.off { color: var(--err); }
.online-row { display: flex; align-items: center; gap: 0.6rem; }
.src-note { margin: 0.6rem 0 0; font-family: var(--mono); font-size: 0.7rem; color: var(--ink-dim); }

.code { margin: 0; padding: 0.2rem 0.2rem; font-size: 0.8rem; line-height: 1.6; color: var(--ink); overflow-x: auto; white-space: pre; }
</style>
