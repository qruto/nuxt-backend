<script setup lang="ts">
// The Queue tab's tiers, one row each (AdminQueueTier.vue).
//
// Internal: a part of the admin console's Queue tab (AdminQueue.vue).
import { type QueueOverview, type UseJobQueueReturn, useQueueLabels } from '../../composables/use-job-queue'
import AdminQueueTier from './AdminQueueTier.vue'

defineProps<{
  /** The tab's headless composable. */
  jobQueue: UseJobQueueReturn
  /** The queue, as `getQueue` read it. */
  queue: QueueOverview
}>()

const { tr } = useQueueLabels()
const columns = ['name', 'feature', 'headStart', 'perOwner', 'dedicated', 'budget', 'running', 'waiting']
</script>

<template>
  <section data-admin-queue="tiers">
    <h3>{{ tr('queue.tiers.heading') }}</h3>
    <table>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column"
            scope="col"
          >
            {{ tr(`queue.tiers.${column}`) }}
          </th>
          <th scope="col">
            <span data-admin-queue="visually-hidden">{{ tr('queue.jobs.actions') }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <AdminQueueTier
          v-for="tier in queue.tiers"
          :key="tier.name"
          :job-queue="jobQueue"
          :tier="tier"
        />
      </tbody>
    </table>
  </section>
</template>
