<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../../backend/_generated/api'

definePageMeta({ middleware: 'auth' })

const level = ref<'info' | 'warn' | 'error' | 'all'>('all')

const paginated = usePaginatedQuery(
  api.logs.listPaginated,
  {},
  { initialNumItems: 15 },
)

const results = computed(() => paginated.value.results)
const status = computed(() => paginated.value.status)
const isLoading = computed(() => paginated.value.isLoading)
function loadMore(n: number) {
  paginated.value.loadMore(n)
}

const levelColors: Record<string, string> = {
  info: 'var(--info)',
  warn: 'var(--warning)',
  error: 'var(--danger-color)',
}

const filtered = computed(() =>
  level.value === 'all'
    ? results.value
    : results.value.filter((r: { level: 'info' | 'warn' | 'error' }) => r.level === level.value),
)

const seed = useMutation(api.logs.seed)
const add = useMutation(api.logs.add)
const clear = useMutation(api.logs.clear)

const customMessage = ref('')
const customLevel = ref<'info' | 'warn' | 'error'>('info')

async function addCustom() {
  const message = customMessage.value.trim()
  if (!message) return
  await add({ level: customLevel.value, message })
  customMessage.value = ''
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div class="api-tag">usePaginatedQuery</div>
      <h1>Paginated logs</h1>
      <p class="subtitle">
        Infinite-scroll pagination powered by <code>usePaginatedQuery</code>.
        Seed entries, filter by level, and load pages on demand.
      </p>
    </header>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button
          type="button"
          class="btn-accent"
          @click="seed({ count: 25 })"
        >
          Seed 25 logs
        </button>
        <button
          type="button"
          class="btn-danger"
          @click="clear()"
        >
          Clear all
        </button>
      </div>

      <div class="level-filter">
        <button
          v-for="l in ['all', 'info', 'warn', 'error']"
          :key="l"
          type="button"
          :class="['filter-btn', l, { active: level === l }]"
          @click="level = l as typeof level"
        >
          {{ l }}
        </button>
      </div>
    </div>

    <!-- Add custom entry -->
    <form
      class="add-row"
      @submit.prevent="addCustom"
    >
      <select
        v-model="customLevel"
        class="level-select"
      >
        <option value="info">
          info
        </option>
        <option value="warn">
          warn
        </option>
        <option value="error">
          error
        </option>
      </select>
      <input
        v-model="customMessage"
        placeholder="Append a custom log entry…"
        class="add-input"
      >
      <button
        type="submit"
        class="btn-ghost"
        :disabled="!customMessage.trim()"
      >
        Add
      </button>
    </form>

    <!-- Log viewer -->
    <div class="log-viewer">
      <div
        v-if="status === 'LoadingFirstPage'"
        class="log-state"
      >
        <span class="spinner" /> Loading…
      </div>
      <template v-else-if="filtered.length === 0">
        <div class="log-state empty">
          No entries match the current filter.
        </div>
      </template>
      <template v-else>
        <div
          v-for="log in filtered"
          :key="log._id"
          class="log-row fade-up"
        >
          <span
            class="level-badge"
            :style="{ background: levelColors[log.level] + '22', color: levelColors[log.level] }"
          >{{ log.level }}</span>
          <span class="log-msg">{{ log.message }}</span>
          <time class="log-time">{{ new Date(log._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}</time>
        </div>
      </template>
    </div>

    <!-- Pagination footer -->
    <div class="pager">
      <span class="pager-status">{{ filtered.length }} shown · status: <code>{{ status }}</code></span>
      <button
        type="button"
        class="btn-ghost"
        :disabled="status !== 'CanLoadMore'"
        @click="loadMore(15)"
      >
        {{ status === 'Exhausted' ? 'All loaded' : status === 'LoadingMore' ? 'Loading…' : 'Load 15 more' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 780px; }

.page-header { margin-bottom: 1.25rem; }
.api-tag {
  font-size: 0.68rem; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.06em; color: var(--muted-color); text-transform: uppercase; margin-bottom: 0.4rem;
}
h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 0.3rem; letter-spacing: -0.02em; }
.subtitle { color: var(--muted-color); font-size: 0.875rem; margin: 0; }
code {
  font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.85em;
  color: var(--accent); background: var(--accent-dim); padding: 0.1rem 0.35rem; border-radius: 3px;
}

/* Toolbar */
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 0.625rem; gap: 0.5rem; flex-wrap: wrap;
}
.toolbar-left { display: flex; gap: 0.5rem; }
.level-filter { display: flex; gap: 2px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 2px; }
.filter-btn {
  padding: 0.25rem 0.625rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, monospace;
  text-transform: uppercase;
  background: transparent;
  color: var(--muted-color);
  transition: background var(--transition), color var(--transition);
}
.filter-btn.active { background: var(--border-color); color: var(--text-color); }
.filter-btn.info.active { color: var(--info); }
.filter-btn.warn.active { color: var(--warning); }
.filter-btn.error.active { color: var(--danger-color); }

/* Buttons */
button { cursor: pointer; font: inherit; }
.btn-accent {
  padding: 0.4rem 0.75rem; border-radius: var(--radius);
  background: var(--accent); color: white; border: 1px solid var(--accent);
  font-size: 0.8rem; font-weight: 500;
}
.btn-accent:hover { background: var(--accent-hover); border-color: var(--accent-hover); }
.btn-danger {
  padding: 0.4rem 0.75rem; border-radius: var(--radius);
  background: transparent; color: var(--danger-color); border: 1px solid var(--border-color);
  font-size: 0.8rem;
}
.btn-danger:hover { background: var(--danger-dim); border-color: var(--danger-color); }
.btn-ghost {
  padding: 0.4rem 0.75rem; border-radius: var(--radius);
  background: transparent; color: var(--text-color); border: 1px solid var(--border-color);
  font-size: 0.8rem;
}
.btn-ghost:hover:not(:disabled) { background: var(--card-hover); }
.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

/* Add row */
.add-row { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
.level-select {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--text-color);
  font: inherit; font-size: 0.8rem;
  font-family: ui-monospace, SFMono-Regular, monospace;
  cursor: pointer;
}
.add-input {
  flex: 1;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--text-color);
  font: inherit; font-size: 0.875rem;
}
.add-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

/* Log viewer */
.log-viewer {
  background: var(--sidebar-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 0.5rem;
  font-family: ui-monospace, SFMono-Regular, monospace;
}
.log-state {
  display: flex; align-items: center; justify-content: center;
  gap: 0.5rem; padding: 2.5rem;
  color: var(--muted-color); font-size: 0.875rem;
}
.log-row {
  display: grid;
  grid-template-columns: 54px 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.45rem 0.875rem;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8rem;
}
.log-row:last-child { border-bottom: none; }
.log-row:hover { background: var(--card-bg); }
.level-badge {
  font-size: 0.65rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.04em;
  padding: 0.15rem 0.4rem; border-radius: 3px; text-align: center;
}
.log-msg { word-break: break-word; color: var(--text-color); }
.log-time { font-size: 0.7rem; color: var(--muted-color); white-space: nowrap; }

/* Pager */
.pager { display: flex; justify-content: space-between; align-items: center; padding: 0.25rem 0; gap: 1rem; }
.pager-status { font-size: 0.78rem; color: var(--muted-color); }

/* Spinner */
.spinner {
  display: inline-block; width: 12px; height: 12px;
  border: 1.5px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
</style>
