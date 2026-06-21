<script setup lang="ts">
import { ref } from 'vue'
import { api } from '#backend/api'

definePageMeta({ middleware: 'auth' })

// ── Full-text search (debounced) ──────────────────────────────────
const term = ref('')
const { results, isLoading } = useSearch(api.search.searchMessages, term, { debounce: 200 })

// ── Live aggregate count (kept in sync by a write trigger) ────────
const messageCount = useCount(api.aggregates.countMessages)

// Seed the index from here so search has something to find.
const draft = ref('')
const send = useMutation(api.messages.send)
async function addMessage() {
  const text = draft.value.trim()
  if (!text) return
  draft.value = ''
  await send({ text })
}

function highlight(text: string): string {
  const q = term.value.trim()
  if (!q) return text
  return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '«$1»')
}
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="useSearch · useCount · useAggregate"
      title="Search & counts"
      live
    >
      <code>useSearch</code> debounces a term into a Convex full-text query;
      <code>useCount</code> reads a live aggregate kept in sync by a write
      trigger — no table scan. Add a message, then search for it.
    </PageHeader>

    <div class="grid-auto">
      <MetricCard
        label="messages (aggregate)"
        :value="messageCount"
        tone="accent"
        hint="useCount(api.aggregates.countMessages)"
      />
      <MetricCard
        label="matches"
        :value="term.trim() ? results.length : '—'"
        :hint="isLoading ? 'searching…' : `for “${term || '∅'}”`"
      />
    </div>

    <LabPanel
      label="seed"
      title="messages.send"
    >
      <form
        class="row"
        @submit.prevent="addMessage"
      >
        <input
          v-model="draft"
          class="input"
          placeholder="Add a message to the search index…"
          style="flex: 1"
        >
        <LabButton
          variant="signal"
          type="submit"
          :disabled="!draft.trim()"
        >
          Send
        </LabButton>
      </form>
    </LabPanel>

    <LabPanel
      label="search"
      title="search.searchMessages"
      tone="accent"
      flush
    >
      <div class="searchbar">
        <Icon
          name="search"
          :size="16"
          class="search-icon"
        />
        <input
          v-model="term"
          class="search-input"
          placeholder="Search messages as you type…"
          autocomplete="off"
        >
        <span
          v-if="isLoading"
          class="spinner"
        />
      </div>

      <div class="results">
        <div
          v-if="!term.trim()"
          class="results-state"
        >
          <Icon
            name="search"
            :size="26"
          />
          <p>Type to search the full-text index.</p>
        </div>
        <div
          v-else-if="results.length === 0 && !isLoading"
          class="results-state"
        >
          <p>No matches for “{{ term }}”.</p>
        </div>
        <template v-else>
          <div
            v-for="m in results"
            :key="m._id"
            class="result well fade-up"
          >
            <strong>{{ m.author }}</strong>
            <p class="result-text">
              {{ highlight(m.text) }}
            </p>
          </div>
        </template>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.searchbar { display: flex; align-items: center; gap: 0.6rem; padding: 0.85rem 1rem; }
.search-icon { color: var(--ink-faint); }
.search-input { flex: 1; background: transparent; border: 0; color: var(--ink); font-size: 0.9rem; outline: none; }
.search-input::placeholder { color: var(--ink-faint); }

.results { display: flex; flex-direction: column; gap: 0.55rem; min-height: 200px; padding: 0.25rem 1rem 1rem; }
.results-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; gap: 0.5rem; color: var(--ink-faint); font-size: 0.85rem; padding: 2rem 0;
}
.results-state p { margin: 0; }
.result { padding: 0.6rem 0.75rem; }
.result strong { font-size: 0.78rem; font-weight: 600; color: var(--accent-soft); }
.result-text { margin: 0.15rem 0 0; font-size: 0.86rem; line-height: 1.45; word-break: break-word; }

.spinner { display: inline-block; width: 13px; height: 13px; border: 2px solid var(--edge-hi); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.7s linear infinite; }
</style>
