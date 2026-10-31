<script setup lang="ts">
// One job's row of the Queue tab: kind, owner, tier (Guest for a visitor's), status, attempts, when
// it joined and the provider's last error, with what an administrator may
// do to it: cancel one that waits or runs, refund one that runs, retry or
// discard a dead letter.
//
// Internal: a part of the admin console's Queue tab (AdminQueueJobs.vue).
import { computed } from 'vue'
import { type AdminJobView, type UseJobQueueReturn, useQueueLabels } from '../../composables/use-job-queue'

const props = defineProps<{
  /** The tab's headless composable. */
  jobQueue: UseJobQueueReturn
  /** The job this row shows. */
  job: AdminJobView
}>()

const { tr } = useQueueLabels()
const { cancel, retry, discard } = props.jobQueue

const cells = computed(() => {
  const { job } = props
  // A guest job ranks after every tier, also once a sign-up claimed it.
  const tier = job.guest ? tr('queue.guest') : (job.tier ?? tr('queue.none'))
  return [job.owner, tier, tr(`queue.status.${job.status}`), String(job.attempts), new Date(job.joinedAt).toLocaleString(), job.lastError ?? '']
})

const actions = computed(() => {
  const { job } = props
  const live = job.status === 'queued' || job.status === 'running'
  return [
    ...(live ? [{ key: 'cancel', run: () => cancel(job.id) }] : []),
    ...(job.status === 'running' ? [{ key: 'cancelRefund', run: () => cancel(job.id, { refund: true }) }] : []),
    ...(job.deadLetter ? [{ key: 'retry', run: () => retry(job.id) }, { key: 'discard', run: () => discard(job.id) }] : []),
  ]
})
</script>

<template>
  <tr :data-state="job.status">
    <th scope="row">
      {{ job.kind }}
    </th>
    <td
      v-for="(cell, index) in cells"
      :key="index"
    >
      {{ cell }}
    </td>
    <td data-admin-queue="actions">
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        data-admin-queue="button"
        @click="action.run()"
      >
        {{ tr(`queue.jobs.${action.key}`) }}
      </button>
    </td>
  </tr>
</template>
