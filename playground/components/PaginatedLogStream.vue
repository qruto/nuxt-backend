<script setup lang="ts">
import { computed, watch } from 'vue'
import { api } from '#backend/api'
import type { LogLevel } from '../backend/schema'

/**
 * Encapsulates a single `usePaginatedQuery` over `logs.listPaginated` so the
 * parent can *reset* pagination by remounting this component (via `:key`).
 *
 * Why this matters: a Convex paginated query whose first page loads over an
 * empty table "owns" the whole key range, so rows added afterwards grow that
 * one page and `status` stays `Exhausted`. Re-initializing the query once the
 * data exists is what produces the real `CanLoadMore → Exhausted` walk — and
 * remount is the canonical way to reset a paginated subscription.
 */
const props = withDefaults(defineProps<{
  filter: 'all' | LogLevel
  pageSize?: number
  initialNumItems?: number
}>(), { pageSize: 15, initialNumItems: 15 })

const status = defineModel<string>('status')

const paginated = usePaginatedQuery(
  api.logs.listPaginated,
  {},
  { initialNumItems: props.initialNumItems },
)

const results = computed(() => paginated.value.results)
watch(() => paginated.value.status, s => (status.value = s), { immediate: true })

const filtered = computed(() =>
  props.filter === 'all'
    ? results.value
    : results.value.filter((r: { level: LogLevel }) => r.level === props.filter),
)

function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
</script>

<template>
  <div class="viewer">
    <div
      v-if="paginated.status === 'LoadingFirstPage'"
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
      :disabled="paginated.status !== 'CanLoadMore'"
      @click="paginated.loadMore(pageSize)"
    >
      {{ paginated.status === 'Exhausted' ? 'All loaded' : paginated.status === 'LoadingMore' ? 'Loading…' : `Load ${pageSize} more` }}
    </LabButton>
  </div>
</template>

<style scoped>
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
</style>
