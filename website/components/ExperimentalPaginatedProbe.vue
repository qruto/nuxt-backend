<script setup lang="ts">
import { computed } from 'vue'
import { api } from '#backend/api'

const props = defineProps<{
  shouldFail: boolean
  throwOnError: boolean
  skip: boolean
}>()

// Whole options passed as a getter so `args`/`shouldFail` stay reactive
// (the object-form `args` field is not itself a MaybeRefOrGetter).
const state = usePaginatedQuery_experimental(() => ({
  query: api.demo.flakyPaginated,
  args: props.skip ? ('skip' as const) : { shouldFail: props.shouldFail },
  initialNumItems: 5,
  throwOnError: props.throwOnError,
}))

const tone = computed(() =>
  state.value.status === 'success' ? 'ok' : state.value.status === 'error' ? 'err' : 'signal',
)

const meta = computed(() => ({
  'status': state.value.status,
  'canLoadMore': state.value.canLoadMore,
  'isLoading': state.value.isLoading,
  'error': state.value.error,
  'data.length': state.value.data?.length ?? null,
  'loadMore': state.value.loadMore,
}))
</script>

<template>
  <div class="pp">
    <div class="pp-status">
      <span class="lab-label">result.status</span>
      <StatusPill :tone="tone">
        {{ state.status }}
      </StatusPill>
    </div>

    <StateReadout
      :value="meta"
      :tone="tone"
      label="usePaginatedQuery_experimental(...).value"
    />

    <div class="pp-list">
      <template v-if="state.data && state.data.length">
        <div
          v-for="row in state.data"
          :key="row._id"
          class="pp-row fade-up"
        >
          <span
            class="pp-lvl"
            :class="row.level"
          >{{ row.level }}</span>
          <span class="pp-msg">{{ row.message }}</span>
        </div>
      </template>
      <div
        v-else-if="state.status === 'pending'"
        class="pp-empty"
      >
        loading first page…
      </div>
      <div
        v-else-if="state.status === 'error'"
        class="pp-empty err"
      >
        error branch — no rows returned
      </div>
      <div
        v-else
        class="pp-empty"
      >
        no rows — seed some logs above
      </div>
    </div>

    <LabButton
      variant="xp"
      size="sm"
      :disabled="!state.canLoadMore"
      @click="state.loadMore(5)"
    >
      {{ state.canLoadMore ? 'loadMore(5)' : 'no more pages' }}
    </LabButton>
  </div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: 0.75rem; }
.pp-status { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.pp-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-height: 240px;
  overflow-y: auto;
}
.pp-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--edge);
  border-radius: var(--r);
  background: var(--surface);
  font-size: 0.8rem;
}
.pp-lvl {
  font-family: var(--mono);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.1rem 0.36rem;
  border-radius: 3px;
  flex-shrink: 0;
}
.pp-lvl.info { color: var(--info); background: rgba(90, 166, 255, 0.13); }
.pp-lvl.warn { color: var(--warn); background: var(--warn-dim); }
.pp-lvl.error { color: var(--err); background: var(--err-dim); }
.pp-msg { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-empty { padding: 1.25rem; text-align: center; color: var(--ink-dim); font-size: 0.8rem; }
.pp-empty.err { color: var(--err); }
</style>
