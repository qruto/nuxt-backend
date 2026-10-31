<script setup lang="ts">
// The Queue tab's models: each model's learned rate in calls a minute, its
// range and its 429s, with an editor for the rate.
//
// Internal: a part of the admin console's Queue tab (AdminQueue.vue).
import { reactive, watch } from 'vue'
import { type QueueOverview, type UseJobQueueReturn, useQueueLabels } from '../../composables/use-job-queue'

const props = defineProps<{
  /** The tab's headless composable. */
  jobQueue: UseJobQueueReturn
  /** The queue, as `getQueue` read it. */
  queue: QueueOverview
}>()

const { tr } = useQueueLabels()

const rates = reactive<Record<string, string>>({})
// The rate each field last showed: a field still showing it follows the
// learned rate as it moves; one an administrator typed in keeps the typing.
const shown: Record<string, string> = {}
watch(() => props.queue.models, (models) => {
  for (const model of models) {
    const learned = String(model.perMinute)
    if (rates[model.model] === undefined || rates[model.model] === shown[model.model]) rates[model.model] = learned
    shown[model.model] = learned
  }
}, { immediate: true })

const time = (at: number) => new Date(at).toLocaleString()
const setQueue = props.jobQueue.setQueue
</script>

<template>
  <section
    v-if="queue.models.length > 0"
    data-admin-queue="models"
  >
    <h3>{{ tr('queue.models.heading') }}</h3>
    <table>
      <thead>
        <tr>
          <th scope="col">
            {{ tr('queue.models.model') }}
          </th>
          <th scope="col">
            {{ tr('queue.models.rate') }}
          </th>
          <th scope="col">
            {{ tr('queue.models.min') }}
          </th>
          <th scope="col">
            {{ tr('queue.models.max') }}
          </th>
          <th scope="col">
            {{ tr('queue.models.throttled') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="model in queue.models"
          :key="model.model"
        >
          <th scope="row">
            {{ model.model }}
          </th>
          <td>
            <form @submit.prevent="setQueue({ model: { id: model.model, perMinute: Number(rates[model.model]) } })">
              <input
                v-model="rates[model.model]"
                type="number"
                :min="model.min"
                :max="model.max"
                :aria-label="`${model.model}: ${tr('queue.models.rate')}`"
              >
              <button
                type="submit"
                data-admin-queue="button"
              >
                {{ tr('queue.save') }}
              </button>
            </form>
          </td>
          <td>{{ model.min }}</td>
          <td>{{ model.max }}</td>
          <td>
            {{ model.count429 }}<template v-if="model.last429At !== null">
              · {{ time(model.last429At) }}
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
