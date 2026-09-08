<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

/**
 * The install command, milled into the surface — a concave machined slot
 * holding the one line that boots the whole backend, with a convex copy
 * button seated in the well (a raised control inside a recess is the
 * strongest depth statement on the page).
 */

const INSTALL = 'npx nuxi module add nuxt-backend'
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copyInstall() {
  if (!import.meta.client || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(INSTALL)
    copied.value = true
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied.value = false), 1600)
  }
  catch { /* clipboard blocked — no-op */ }
}
onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer)
})
</script>

<template>
  <div class="cmd slot">
    <code class="cmd__line"><span class="cmd__prompt">$</span> {{ INSTALL }}</code>
    <button
      type="button"
      class="cmd__copy"
      :aria-label="copied ? 'Copied' : 'Copy install command'"
      @click="copyInstall"
    >
      <UIcon
        :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        :class="{ ok: copied }"
      />
    </button>
  </div>
</template>

<style scoped>
.cmd {
  display: inline-flex;
  align-items: center;
  gap: 0.9rem;
  max-width: 100%;
  padding: 0.55rem 0.55rem 0.55rem 1.1rem;
}
.cmd__line {
  font-family: var(--mono);
  font-size: 0.92rem;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.cmd__prompt { color: var(--ink-faint); user-select: none; }

/* A convex button machined into the well. */
.cmd__copy {
  display: grid;
  place-items: center;
  flex: none;
  width: 2.1rem;
  height: 2.1rem;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  color: var(--ink-dim);
  background: var(--grad-surface);
  box-shadow: var(--elev-1);
  transition: box-shadow var(--transition), color var(--transition),
    transform var(--press) var(--ease-out);
}
.cmd__copy:hover { color: var(--ink); box-shadow: var(--elev-2); }
.cmd__copy:active { box-shadow: var(--inset-1); transform: translateY(0.5px); }
.cmd__copy :deep(svg) { width: 0.95rem; height: 0.95rem; }
.cmd__copy .ok { color: var(--ok); }

@media (max-width: 420px) {
  .cmd__line { font-size: 0.8rem; }
}
</style>
