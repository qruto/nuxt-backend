<script setup lang="ts">
// The admin console's Queue tab: the job queue at a glance (what runs and
// waits, the slots, the average job), its tiers with their dedicated slots
// configured and in effect, each model's learned limit, and the jobs, newest
// first or only the dead letters. Pause or resume, the concurrency, a tier's
// perOwner, dedicated slots and budget, a model's rate, and cancel, retry
// or discard a job. Each change goes through backend/jobs.ts, which asks
// for a recent sign-in, through the tab's own <ReauthenticateDialog>, and
// records it on the activity trail. The logic is
// useJobQueue, so markup of your own can do the same.
//
// Internal: the console's tab, not a registered component.
import { computed } from 'vue'
import { useJobQueue, useQueueLabels } from '../../composables/use-job-queue'
import AdminQueueControls from './AdminQueueControls.vue'
import AdminQueueJobs from './AdminQueueJobs.vue'
import AdminQueueModels from './AdminQueueModels.vue'
import AdminQueueTiers from './AdminQueueTiers.vue'

const jobQueue = useJobQueue()
const { queue, error } = jobQueue
const { tr, errorMessage } = useQueueLabels()

/** What the queue does now, a sentence each. */
const summary = computed(() => {
  const now = queue.value
  if (!now) return []
  return [
    tr('queue.summary', { running: now.running, waiting: now.waiting }),
    ...(now.guests ? [tr('queue.guests', { running: now.guests.running, waiting: now.guests.waiting })] : []),
    tr('queue.slots', { concurrency: now.concurrency, shared: now.shared }),
    ...(now.averageMs === null ? [] : [tr('queue.average', { seconds: Math.round(now.averageMs / 1000) })]),
  ]
})

// Not read yet: loading, unless the read failed, which then says why.
const loading = computed(() => queue.value === undefined && !error.value)

/** Why jobs may not start: a paused queue, `pause_ai`, trimmed slots. */
const notices = computed(() => {
  const now = queue.value
  if (!now) return []
  return (['paused', 'pausedAi', 'trimmed'] as const).filter(key => now[key]).map(key => tr(`queue.${key}`))
})
</script>

<template>
  <section
    data-admin-queue="tab"
    :data-loading="loading ? '' : undefined"
  >
    <p
      v-if="loading"
      data-admin-queue="loading"
    >
      {{ tr('loading') }}
    </p>
    <p
      v-else-if="queue === undefined"
      data-admin-queue="error"
      role="alert"
    >
      {{ errorMessage(error) }}
    </p>
    <template v-else-if="queue">
      <header data-admin-queue="overview">
        <h2>{{ tr('queue.heading') }}</h2>
        <p
          v-for="line in summary"
          :key="line"
        >
          {{ line }}
        </p>
        <p
          v-for="notice in notices"
          :key="notice"
          data-admin-queue="notice"
          role="status"
        >
          {{ notice }}
        </p>
        <AdminQueueControls
          :job-queue="jobQueue"
          :queue="queue"
        />
        <p
          v-if="error"
          data-admin-queue="error"
          role="alert"
        >
          {{ errorMessage(error) }}
        </p>
      </header>
      <AdminQueueTiers
        v-if="queue.tiers.length > 0"
        :job-queue="jobQueue"
        :queue="queue"
      />
      <AdminQueueModels
        v-if="queue.models.length > 0"
        :job-queue="jobQueue"
        :queue="queue"
      />
      <AdminQueueJobs :job-queue="jobQueue" />
      <ReauthenticateDialog />
    </template>
  </section>
</template>
