<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../backend/_generated/api'

const props = defineProps<{
  shouldFail: boolean
  throwOnError: boolean
  skip: boolean
}>()

// Object-form experimental query. `args` is reactive (a getter); `throwOnError`
// is read once at setup — the parent remounts this probe (via :key) whenever a
// toggle flips, so that's exactly the desired behaviour.
const state = useQuery_experimental({
  query: api.demo.flaky,
  args: computed(() =>
    props.skip ? ('skip' as const) : { shouldFail: props.shouldFail, label: 'experimental' },
  ),
  throwOnError: props.throwOnError,
})

const tone = computed(() =>
  state.value.status === 'success' ? 'ok' : state.value.status === 'error' ? 'err' : 'signal',
)
</script>

<template>
  <div class="probe">
    <div class="probe-status">
      <span class="lab-label">result.status</span>
      <StatusPill :tone="tone">
        {{ state.status }}
      </StatusPill>
    </div>
    <StateReadout
      :value="state"
      :tone="tone"
      label="useQuery_experimental(...).value"
    />
  </div>
</template>

<style scoped>
.probe { display: flex; flex-direction: column; gap: 0.75rem; }
.probe-status { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
</style>
