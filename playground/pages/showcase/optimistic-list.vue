<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '#backend/api'
import type { Id } from '#backend/dataModel'
// Paginated optimistic helpers are public utilities (used inside
// withOptimisticUpdate) but not Nuxt auto-imports — pull from the runtime.
import { insertAtTop } from '../../../src/runtime/vue/composables/use-paginated-query'
import type { LogLevel as Level } from '../../backend/schema'

definePageMeta({ middleware: 'auth' })

const list = usePaginatedQuery(api.logs.listPaginated, {}, { initialNumItems: 6 })

// Same mutation, with and without an optimistic update, to compare.
const addOptimistic = useMutation(api.logs.add).withOptimisticUpdate((localStore, args) => {
  insertAtTop({
    paginatedQuery: api.logs.listPaginated,
    localQueryStore: localStore,
    item: {
      _id: (globalThis.crypto?.randomUUID?.() ?? String(Math.random())) as Id<'logs'>,
      _creationTime: Date.now(),
      userId: 'optimistic',
      level: args.level,
      message: args.message,
    },
  })
})
const addPlain = useMutation(api.logs.add)

const seed = useMutation(api.logs.seed)
const clear = useMutation(api.logs.clear)

const optimistic = ref(true)
const inflight = ref(0)
let counter = 0

async function addLog(level: Level) {
  counter += 1
  const message = `Manual ${level} entry #${counter}`
  inflight.value += 1
  try {
    if (optimistic.value) await addOptimistic({ level, message })
    else await addPlain({ level, message })
  }
  finally {
    inflight.value -= 1
  }
}

const rows = computed(() => list.value.results)
</script>

<template>
  <div>
    <PageHeader
      tag="insertAtTop · withOptimisticUpdate"
      title="Optimistic paginated list"
    >
      The paginated optimistic helpers patch a <code>usePaginatedQuery</code>
      list before the server round-trip resolves. With optimistic mode on,
      <code>insertAtTop</code> prepends a row to the local store the instant you
      click; toggle it off to insert only after the server confirms.
    </PageHeader>

    <div class="grid">
      <LabPanel
        label="control"
        title="Insert"
      >
        <LabToggle
          v-model="optimistic"
          tone="ok"
          label="optimistic insertAtTop"
          :hint="optimistic ? 'row appears instantly' : 'row waits for the server'"
        />

        <div class="addrow">
          <LabButton
            variant="ghost"
            size="sm"
            @click="addLog('info')"
          >
            + info
          </LabButton>
          <LabButton
            variant="ghost"
            size="sm"
            @click="addLog('warn')"
          >
            + warn
          </LabButton>
          <LabButton
            variant="ghost"
            size="sm"
            @click="addLog('error')"
          >
            + error
          </LabButton>
        </div>

        <div class="inflight">
          <SignalDot
            :tone="inflight > 0 ? 'warn' : 'muted'"
            :pulse="inflight > 0"
          />
          <span class="lab-label">{{ inflight }} confirming</span>
        </div>

        <div class="fixrow">
          <LabButton
            variant="ghost"
            size="sm"
            @click="seed({ count: 8 })"
          >
            Seed 8
          </LabButton>
          <LabButton
            variant="danger"
            size="sm"
            @click="clear()"
          >
            Clear
          </LabButton>
        </div>
      </LabPanel>

      <LabPanel
        label="list"
        title="usePaginatedQuery"
        tone="ok"
      >
        <template #actions>
          <StatusPill :tone="list.status === 'Exhausted' ? 'muted' : 'ok'">
            {{ list.status }}
          </StatusPill>
        </template>

        <div class="list">
          <div
            v-for="row in rows"
            :key="row._id"
            class="row fade-up"
            :class="{ ghost: row.userId === 'optimistic' }"
          >
            <span
              class="lvl"
              :class="row.level"
            >{{ row.level }}</span>
            <span class="msg">{{ row.message }}</span>
            <span
              v-if="row.userId === 'optimistic'"
              class="tag-opt"
            >optimistic</span>
          </div>

          <div
            v-if="rows.length === 0 && !list.isLoading"
            class="empty"
          >
            No logs — seed a batch, then add entries.
          </div>
          <div
            v-else-if="list.isLoading && rows.length === 0"
            class="empty"
          >
            loading…
          </div>
        </div>

        <LabButton
          variant="ghost"
          size="sm"
          :disabled="list.status !== 'CanLoadMore'"
          @click="list.loadMore(6)"
        >
          {{ list.status === 'CanLoadMore' ? 'Load 6 more' : 'No more pages' }}
        </LabButton>
      </LabPanel>
    </div>

    <LabPanel
      label="notes"
      title="The helper family"
      class="notes"
    >
      <ul>
        <li><strong>insertAtTop</strong> — prepend to the first page (used here). No-op until the first page is loaded.</li>
        <li><strong>insertAtBottomIfLoaded</strong> — append, but only once the final page is present.</li>
        <li><strong>insertAtPosition</strong> — splice into the correct page given a sort order + key.</li>
        <li><strong>optimisticallyUpdateValueInPaginatedQuery</strong> — map every loaded item to update in place.</li>
      </ul>
      <p class="tip">
        The dashed <span class="tip-opt">optimistic</span> row appears the instant
        you click and is reconciled away when the server row arrives. On localhost
        that swap is near-instant — throttle the network in
        <strong>DevTools → Network → Slow 4G</strong> to watch the ghost row linger
        before it confirms.
      </p>
    </LabPanel>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: 0.85fr 1.15fr;
  gap: 1rem;
  align-items: start;
  margin-bottom: 1rem;
}
.addrow { display: flex; gap: 0.4rem; margin: 1rem 0 0.85rem; }
.inflight { display: flex; align-items: center; gap: 0.45rem; padding: 0.5rem 0; border-top: 1px solid var(--edge); }
.fixrow { display: flex; gap: 0.4rem; padding-top: 0.85rem; border-top: 1px solid var(--edge); }

.list { display: flex; flex-direction: column; gap: 0.32rem; max-height: 320px; overflow-y: auto; margin-bottom: 0.85rem; }
.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.55rem;
  border: 1px solid var(--edge);
  border-radius: var(--radius);
  background: var(--panel);
  font-size: 0.8rem;
}
.row.ghost { border-style: dashed; border-color: color-mix(in srgb, var(--ok) 45%, var(--edge)); background: var(--ok-dim); }
.lvl {
  font-family: var(--mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.1rem 0.34rem;
  border-radius: 3px;
  flex-shrink: 0;
}
.lvl.info { color: var(--info); background: rgba(90, 166, 255, 0.13); }
.lvl.warn { color: var(--warn); background: var(--warn-dim); }
.lvl.error { color: var(--err); background: var(--err-dim); }
.msg { flex: 1; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tag-opt {
  font-family: var(--mono);
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ok);
  flex-shrink: 0;
}
.empty { padding: 1.5rem; text-align: center; color: var(--ink-dim); font-size: 0.82rem; }

.notes ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.notes li { font-size: 0.82rem; color: var(--ink-dim); line-height: 1.5; }
.notes strong { color: var(--ink); font-family: var(--mono); font-size: 0.92em; }
.tip {
  margin: 0.85rem 0 0;
  padding-top: 0.7rem;
  border-top: 1px dashed var(--edge);
  font-size: 0.78rem;
  color: var(--ink-dim);
  line-height: 1.55;
}
.tip-opt {
  font-family: var(--mono);
  font-size: 0.86em;
  color: var(--ok);
  background: var(--ok-dim);
  padding: 0.02rem 0.3rem;
  border-radius: 4px;
}

code {
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--ok);
  background: var(--ok-dim);
  padding: 0.06rem 0.32rem;
  border-radius: 4px;
}

@media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
</style>
