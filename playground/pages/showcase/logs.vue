<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../../backend/_generated/api'
import { LOG_LEVELS } from '../../backend/schema'

definePageMeta({ middleware: 'auth' })

type LogFilter = 'all' | (typeof LOG_LEVELS)[number]
const level = ref<LogFilter>('all')

const paginated = usePaginatedQuery(
  api.logs.listPaginated,
  {},
  { initialNumItems: 15 },
)

const results = computed(() => paginated.value.results)
const status = computed(() => paginated.value.status)
function loadMore(n: number) {
  paginated.value.loadMore(n)
}

const filtered = computed(() =>
  level.value === 'all'
    ? results.value
    : results.value.filter((r: { level: (typeof LOG_LEVELS)[number] }) => r.level === level.value),
)

const seed = useMutation(api.logs.seed)
const add = useMutation(api.logs.add)
const clear = useMutation(api.logs.clear)

const customMessage = ref('')
const customLevel = ref<(typeof LOG_LEVELS)[number]>('info')

async function addCustom() {
  const message = customMessage.value.trim()
  if (!message) return
  await add({ level: customLevel.value, message })
  customMessage.value = ''
}

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const statusTone = computed(() =>
  status.value === 'Exhausted' ? 'muted' : status.value === 'CanLoadMore' ? 'ok' : 'signal',
)
</script>

<template>
  <div class="page">
    <PageHeader
      tag="usePaginatedQuery"
      title="Paginated logs"
    >
      Infinite-scroll pagination over a real Convex cursor. Seed entries, filter
      by level, and load pages on demand. <code>status</code> walks
      <code>LoadingFirstPage → CanLoadMore → Exhausted</code>.
    </PageHeader>

    <LabPanel
      label="log · stream"
      title="logs.listPaginated"
      :tone="statusTone === 'muted' ? 'neutral' : statusTone"
      flush
    >
      <template #actions>
        <StatusPill :tone="statusTone">
          {{ status }}
        </StatusPill>
      </template>

      <div class="toolbar">
        <div class="tb-left">
          <LabButton
            variant="ghost"
            size="sm"
            @click="seed({ count: 25 })"
          >
            Seed 25
          </LabButton>
          <LabButton
            variant="danger"
            size="sm"
            @click="clear()"
          >
            Clear all
          </LabButton>
        </div>
        <div class="filter">
          <button
            v-for="l in (['all', ...LOG_LEVELS] as const)"
            :key="l"
            type="button"
            :class="['fbtn', l, { active: level === l }]"
            @click="level = l"
          >
            {{ l }}
          </button>
        </div>
      </div>

      <form
        class="add-row"
        @submit.prevent="addCustom"
      >
        <select
          v-model="customLevel"
          class="lvl-select"
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
        <LabButton
          variant="ghost"
          size="sm"
          :disabled="!customMessage.trim()"
        >
          Add
        </LabButton>
      </form>

      <div class="viewer">
        <div
          v-if="status === 'LoadingFirstPage'"
          class="vstate"
        >
          <span class="spinner" /> loading…
        </div>
        <div
          v-else-if="filtered.length === 0"
          class="vstate"
        >
          No entries match the current filter.
        </div>
        <template v-else>
          <div
            v-for="log in filtered"
            :key="log._id"
            class="lrow fade-up"
          >
            <span
              class="lbadge"
              :class="log.level"
            >{{ log.level }}</span>
            <span class="lmsg">{{ log.message }}</span>
            <time class="ltime">{{ clock(log._creationTime) }}</time>
          </div>
        </template>
      </div>

      <div class="pager">
        <span class="pager-status">{{ filtered.length }} shown</span>
        <LabButton
          variant="ghost"
          size="sm"
          :disabled="status !== 'CanLoadMore'"
          @click="loadMore(15)"
        >
          {{ status === 'Exhausted' ? 'All loaded' : status === 'LoadingMore' ? 'Loading…' : 'Load 15 more' }}
        </LabButton>
      </div>
    </LabPanel>
  </div>
</template>

<style scoped>
.page { max-width: 800px; }

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--edge);
}
.tb-left { display: flex; gap: 0.45rem; }
.filter { display: flex; gap: 2px; background: var(--input-bg); border: 1px solid var(--edge); border-radius: var(--radius); padding: 2px; }
.fbtn {
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  font-family: var(--mono);
  text-transform: uppercase;
  background: transparent;
  color: var(--ink-dim);
  transition: background var(--transition), color var(--transition);
}
.fbtn.active { background: var(--edge); color: var(--ink); }
.fbtn.info.active { color: var(--info); }
.fbtn.warn.active { color: var(--warn); }
.fbtn.error.active { color: var(--err); }

.add-row { display: flex; gap: 0.5rem; padding: 0.85rem 1rem; border-bottom: 1px solid var(--edge); }
.lvl-select {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  font-family: var(--mono);
  cursor: pointer;
}
.add-input {
  flex: 1;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--input-border);
  border-radius: var(--radius);
  background: var(--input-bg);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
}
.add-input:focus { outline: none; border-color: var(--signal); box-shadow: 0 0 0 3px var(--signal-dim); }

.viewer { font-family: var(--mono); max-height: 360px; overflow-y: auto; }
.vstate {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2.5rem;
  color: var(--ink-dim);
  font-size: 0.85rem;
}
.lrow {
  display: grid;
  grid-template-columns: 50px 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.42rem 1rem;
  border-bottom: 1px solid var(--edge);
  font-size: 0.78rem;
}
.lrow:last-child { border-bottom: none; }
.lrow:hover { background: var(--panel-hi); }
.lbadge {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.14rem 0.36rem;
  border-radius: 3px;
  text-align: center;
}
.lbadge.info { color: var(--info); background: rgba(90, 166, 255, 0.13); }
.lbadge.warn { color: var(--warn); background: var(--warn-dim); }
.lbadge.error { color: var(--err); background: var(--err-dim); }
.lmsg { word-break: break-word; color: var(--ink); }
.ltime { font-size: 0.68rem; color: var(--ink-dim); white-space: nowrap; }

.pager { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.75rem 1rem; }
.pager-status { font-size: 0.74rem; color: var(--ink-dim); font-family: var(--mono); }

.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--edge);
  border-top-color: var(--signal);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}
</style>
