<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '../../backend/_generated/api'
import { LOG_LEVELS } from '../../backend/schema'

definePageMeta({ middleware: 'auth' })

type LogFilter = 'all' | (typeof LOG_LEVELS)[number]
const level = ref<LogFilter>('all')

// Bumped on structural resets (seed / clear) to remount the stream and
// re-initialize the paginated query over the current table — see the note
// in PaginatedLogStream.vue for why this is what surfaces the page walk.
const generation = ref(0)

const status = ref<string>('LoadingFirstPage')

const seed = useMutation(api.logs.seed)
const add = useMutation(api.logs.add)
const clear = useMutation(api.logs.clear)

const seeding = ref(false)
async function seedLogs() {
  seeding.value = true
  try {
    await seed({ count: 40 })
    generation.value++
  }
  finally {
    seeding.value = false
  }
}

async function clearLogs() {
  await clear()
  generation.value++
}

const customMessage = ref('')
const customLevel = ref<(typeof LOG_LEVELS)[number]>('info')

async function addCustom() {
  const message = customMessage.value.trim()
  if (!message) return
  await add({ level: customLevel.value, message })
  customMessage.value = ''
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
            :loading="seeding"
            @click="seedLogs"
          >
            Seed 40
          </LabButton>
          <LabButton
            variant="danger"
            size="sm"
            @click="clearLogs"
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

      <PaginatedLogStream
        :key="generation"
        v-model:status="status"
        :filter="level"
        :page-size="15"
        :initial-num-items="15"
      />
    </LabPanel>

    <p class="hint">
      <span class="hint-k">Note</span>
      A paginated query that first loads over an <em>empty</em> table owns the
      whole range, so later rows grow that one page and it stays
      <code>Exhausted</code>. <strong>Seed 40</strong> re-initializes the stream
      so you can watch it walk <code>CanLoadMore → Exhausted</code>; new rows
      added afterwards stream straight into the live first page.
    </p>
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
  transition: background var(--transition), color var(--transition),
    transform var(--press) var(--ease-out);
}
.fbtn:active { transform: scale(0.94); }
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

.hint {
  margin: 0.9rem 0 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--ink-dim);
}
.hint-k {
  font-family: var(--mono);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--signal);
  margin-right: 0.4rem;
}
.hint strong { color: var(--ink); }

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--signal);
  background: var(--signal-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}
</style>
