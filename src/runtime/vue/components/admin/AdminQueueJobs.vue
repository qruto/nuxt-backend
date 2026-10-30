<script setup lang="ts">
// The Queue tab's jobs, newest first or only the dead letters, a page at a
// time: kind, owner, tier, status, attempts, when it joined and the
// provider's last error, with cancel, cancel and refund, retry and discard.
//
// Internal: a part of the admin console's Queue tab (AdminQueue.vue).
import { computed } from 'vue'
import { type UseJobQueueReturn, useQueueLabels } from '../../composables/use-job-queue'
import AdminQueueJob from './AdminQueueJob.vue'

const props = defineProps<{
  /** The tab's headless composable. */
  jobQueue: UseJobQueueReturn
}>()

const { tr } = useQueueLabels()
const { jobs, deadLetters, pages } = props.jobQueue
const columns = ['kind', 'owner', 'tier', 'status', 'attempts', 'joined', 'lastError', 'actions']
const filters = computed(() => [
  { key: 'all', pressed: !deadLetters.value, show: () => (deadLetters.value = false) },
  { key: 'deadLetters', pressed: deadLetters.value, show: () => (deadLetters.value = true) },
])
</script>

<template>
  <section data-admin-queue="jobs">
    <h3>{{ tr('queue.jobs.heading') }}</h3>
    <div
      role="group"
      :aria-label="tr('queue.jobs.heading')"
      data-admin-queue="filter"
    >
      <button
        v-for="filter in filters"
        :key="filter.key"
        type="button"
        data-admin-queue="button"
        :aria-pressed="filter.pressed"
        @click="filter.show()"
      >
        {{ tr(`queue.jobs.${filter.key}`) }}
      </button>
    </div>
    <p v-if="jobs.length === 0">
      {{ deadLetters ? tr('queue.jobs.emptyDead') : tr('queue.jobs.empty') }}
    </p>
    <table v-else>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column"
            scope="col"
          >
            {{ tr(`queue.jobs.${column}`) }}
          </th>
        </tr>
      </thead>
      <tbody>
        <AdminQueueJob
          v-for="job in jobs"
          :key="job.id"
          :job-queue="jobQueue"
          :job="job"
        />
      </tbody>
    </table>
    <nav
      v-if="pages.hasPrevious.value || pages.hasMore.value"
      data-admin-queue="pages"
    >
      <button
        type="button"
        data-admin-queue="button"
        :disabled="!pages.hasPrevious.value"
        @click="pages.previous()"
      >
        {{ tr('newer') }}
      </button>
      <button
        type="button"
        data-admin-queue="button"
        :disabled="!pages.hasMore.value"
        @click="pages.next()"
      >
        {{ tr('older') }}
      </button>
    </nav>
  </section>
</template>
