<script setup lang="ts">
// One tier's row of the Queue tab: its feature, head start, perOwner,
// dedicated slots (configured, and in effect when the concurrency trims
// them) and budget, with an editor for the three an administrator may
// retune. A blank field goes back to backend/jobs.ts.
//
// Internal: a part of the admin console's Queue tab (AdminQueueTiers.vue).
import { reactive, watch } from 'vue'
import { type QueueTier, type UseJobQueueReturn, useQueueLabels } from '../../composables/use-job-queue'

const props = defineProps<{
  /** The tab's headless composable. */
  jobQueue: UseJobQueueReturn
  /** The tier this row shows. */
  tier: QueueTier
}>()

const { tr } = useQueueLabels()
const overridden = (field: string, value: number | undefined) => (props.tier.overridden.includes(field) && value !== undefined ? String(value) : '')
const draft = reactive({ perOwner: '', dedicated: '', budget: '' })
// The fields follow what is stored, not every live read: a tier is read
// again each time a job starts or ends, which must not undo the typing.
watch(
  [() => overridden('perOwner', props.tier.perOwner), () => overridden('dedicated', props.tier.dedicated), () => overridden('budgetUnits', props.tier.budget?.units)],
  ([perOwner, dedicated, budget]) => Object.assign(draft, { perOwner, dedicated, budget }),
  { immediate: true },
)

const number = (text: string): number | null => (text.trim() === '' ? null : Number(text))
const headStart = () => (props.tier.headStart ? tr('queue.tiers.minutes', { count: Math.round(props.tier.headStart / 60_000) }) : tr('queue.none'))
const inEffect = () => (props.tier.dedicatedInEffect === props.tier.dedicated ? '' : tr('queue.tiers.inEffect', { configured: props.tier.dedicated, effect: props.tier.dedicatedInEffect }))
const budgetText = () => (props.tier.budget ? tr('queue.tiers.budgetValue', { units: props.tier.budget.units, hours: Math.round(props.tier.budget.period / 3_600_000) }) : tr('queue.none'))

async function save() {
  const budget = number(draft.budget)
  await props.jobQueue.setQueue({
    tier: {
      name: props.tier.name,
      perOwner: number(draft.perOwner),
      ...(props.tier.feature ? { dedicated: number(draft.dedicated) } : {}),
      ...(props.tier.budget ? { budget: budget === null ? null : { units: budget } } : {}),
    },
  })
}
</script>

<template>
  <tr :data-admin-queue-tier="tier.name">
    <th scope="row">
      {{ tier.name }}
    </th>
    <td>{{ tier.feature ?? tr('queue.tiers.everyone') }}</td>
    <td>{{ headStart() }}</td>
    <td>
      <input
        v-model="draft.perOwner"
        type="number"
        min="1"
        :placeholder="String(tier.perOwner)"
        :aria-label="`${tier.name}: ${tr('queue.tiers.perOwner')}`"
      >
    </td>
    <td>
      <input
        v-if="tier.feature"
        v-model="draft.dedicated"
        type="number"
        min="0"
        :placeholder="String(tier.dedicated)"
        :aria-label="`${tier.name}: ${tr('queue.tiers.dedicated')}`"
      >
      <span>{{ tier.feature ? inEffect() : tr('queue.none') }}</span>
    </td>
    <td>
      <input
        v-if="tier.budget"
        v-model="draft.budget"
        type="number"
        min="1"
        :placeholder="String(tier.budget.units)"
        :aria-label="`${tier.name}: ${tr('queue.tiers.budget')}`"
      >
      <span>{{ budgetText() }}</span>
    </td>
    <td>{{ tier.running }}</td>
    <td>{{ tier.waiting }}</td>
    <td>
      <button
        type="button"
        data-admin-queue="button"
        @click="save()"
      >
        {{ tr('queue.save') }}
      </button>
    </td>
  </tr>
</template>
