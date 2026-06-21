<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'
import type { Id } from '#backend/dataModel'
import { LOG_LEVELS } from '../../../backend/schema'
import type { LogLevel } from '../../../backend/schema'
// Paginated optimistic helpers are public utilities (used inside
// withOptimisticUpdate) but not Nuxt auto-imports — pull from the runtime.
import { insertAtTop } from '../../../../src/runtime/vue/composables/use-paginated-query'

definePageMeta({ middleware: 'auth' })

type LogFilter = 'all' | LogLevel
const level = ref<LogFilter>('all')

// Bumped on structural resets (seed / clear) to remount the stream and
// re-initialize the paginated query — see PaginatedLogStream for why.
const generation = ref(0)
const status = ref<string>('LoadingFirstPage')

const seed = useMutation(api.logs.seed)
const clear = useMutation(api.logs.clear)

// Same mutation, optimistic vs plain — insertAtTop prepends to the live list.
const optimistic = ref(true)
const addPlain = useMutation(api.logs.add)
const addOptimistic = useMutation(api.logs.add).withOptimisticUpdate((store, args) => {
  insertAtTop({
    paginatedQuery: api.logs.listPaginated,
    localQueryStore: store,
    item: {
      _id: (globalThis.crypto?.randomUUID?.() ?? String(Math.random())) as Id<'logs'>,
      _creationTime: Date.now(),
      userId: 'optimistic',
      level: args.level,
      message: args.message,
    },
  })
})

const customMessage = ref('')
const customLevel = ref<LogLevel>('info')
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
async function addCustom() {
  const message = customMessage.value.trim()
  if (!message) return
  customMessage.value = ''
  if (optimistic.value) await addOptimistic({ level: customLevel.value, message })
  else await addPlain({ level: customLevel.value, message })
}

const statusTone = computed(() =>
  status.value === 'Exhausted' ? 'muted' : status.value === 'CanLoadMore' ? 'ok' : 'accent',
)

// Dev drawer
const xpFail = ref(false)
const xpThrow = ref(false)
const xpSkip = ref(false)
const xpKey = computed(() => `${xpFail.value}-${xpThrow.value}-${xpSkip.value}`)
</script>

<template>
  <div class="stack">
    <PageHeader
      tag="usePaginatedQuery · insertAtTop"
      title="Pagination"
    >
      Infinite scroll over a real Convex cursor — <code>status</code> walks
      <code>LoadingFirstPage → CanLoadMore → Exhausted</code>. New rows you add
      stream into the live first page; with optimism on,
      <code>insertAtTop</code> shows them before the server confirms.
    </PageHeader>

    <LabPanel
      label="log · stream"
      title="logs.listPaginated"
      tone="accent"
      flush
    >
      <template #actions>
        <StatusPill :tone="statusTone === 'muted' ? 'muted' : statusTone === 'ok' ? 'ok' : 'signal'">
          {{ status }}
        </StatusPill>
      </template>

      <div class="toolbar">
        <div class="row">
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
          class="input lvl-select"
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
          class="input"
          placeholder="Append a log entry…"
        >
        <LabButton
          variant="ghost"
          size="sm"
          type="submit"
          :disabled="!customMessage.trim()"
        >
          Add
        </LabButton>
        <LabToggle
          v-model="optimistic"
          tone="ok"
          label="optimistic"
        />
      </form>

      <PaginatedLogStream
        :key="generation"
        v-model:status="status"
        :filter="level"
        :page-size="15"
        :initial-num-items="15"
      />
    </LabPanel>

    <details class="dev">
      <summary>Object form — usePaginatedQuery_experimental</summary>
      <div class="dev-body">
        <p
          class="hint"
          style="margin-bottom: 0.75rem"
        >
          The experimental paginated shape returns
          <code>{ data, status, canLoadMore, isLoading, error, loadMore }</code>
          with lowercase status and an opt-in <code>throwOnError</code>.
        </p>
        <div
          class="row"
          style="margin-bottom: 0.85rem"
        >
          <LabToggle
            v-model="xpFail"
            tone="xp"
            label="shouldFail"
          />
          <LabToggle
            v-model="xpThrow"
            tone="xp"
            label="throwOnError"
          />
          <LabToggle
            v-model="xpSkip"
            tone="xp"
            label="skip"
          />
        </div>
        <ErrorBoundary>
          <ExperimentalPaginatedProbe
            :key="xpKey"
            :should-fail="xpFail"
            :throw-on-error="xpThrow"
            :skip="xpSkip"
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
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  gap: 0.5rem; flex-wrap: wrap; padding: 0.85rem 1rem 0;
}
.filter { display: flex; gap: 2px; background: var(--sink); border-radius: var(--r-sm); padding: 3px; box-shadow: var(--inset-sm); }
.fbtn {
  padding: 0.28rem 0.62rem; border-radius: 6px; border: 0; cursor: pointer;
  font-size: 0.7rem; font-weight: 600; font-family: var(--mono); text-transform: uppercase;
  background: transparent; color: var(--ink-dim);
  transition: color var(--transition), box-shadow var(--transition), background var(--transition);
}
.fbtn.active { background: var(--surface); box-shadow: var(--raise-sm); color: var(--ink); }
.fbtn.info.active { color: var(--info); }
.fbtn.warn.active { color: var(--warn); }
.fbtn.error.active { color: var(--err); }

.add-row { display: flex; gap: 0.5rem; align-items: center; padding: 0.85rem 1rem; flex-wrap: wrap; }
.add-row .input { flex: 1; min-width: 8rem; font-size: 0.85rem; padding: 0.45rem 0.7rem; }
.lvl-select { flex: 0 0 auto; width: auto; font-family: var(--mono); font-size: 0.78rem; padding: 0.45rem 0.6rem; }

.err-text { color: var(--err); font-size: 0.82rem; margin: 0 0 0.6rem; }
</style>
