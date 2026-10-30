<script setup lang="ts">
// The Queue tab's controls: pause or resume, and how many jobs run at once,
// with the way back to backend/jobs.ts.
//
// Internal: a part of the admin console's Queue tab (AdminQueue.vue).
import { ref, watch } from 'vue'
import { type QueueOverview, type UseJobQueueReturn, useQueueLabels } from '../../composables/use-job-queue'

const props = defineProps<{
  /** The tab's headless composable. */
  jobQueue: UseJobQueueReturn
  /** The queue, as `getQueue` read it. */
  queue: QueueOverview
}>()

const { tr } = useQueueLabels()
const { setQueue, isPending } = props.jobQueue
const concurrency = ref('')
watch(() => props.queue.concurrency, (value) => {
  concurrency.value = String(value)
}, { immediate: true })
</script>

<template>
  <div data-admin-queue="controls">
    <button
      type="button"
      data-admin-queue="button"
      :aria-disabled="isPending ? 'true' : undefined"
      @click="setQueue({ paused: !queue.paused })"
    >
      {{ queue.paused ? tr('queue.resume') : tr('queue.pause') }}
    </button>
    <form
      data-admin-queue="concurrency"
      @submit.prevent="setQueue({ concurrency: Number(concurrency) })"
    >
      <label>
        {{ tr('queue.concurrency') }}
        <input
          v-model="concurrency"
          type="number"
          min="0"
          max="20"
          inputmode="numeric"
        >
      </label>
      <button
        type="submit"
        data-admin-queue="button"
      >
        {{ tr('queue.save') }}
      </button>
      <button
        v-if="queue.concurrency !== queue.configuredConcurrency"
        type="button"
        data-admin-queue="button"
        @click="setQueue({ concurrency: null })"
      >
        {{ tr('queue.reset') }}
      </button>
    </form>
  </div>
</template>
