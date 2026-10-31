<script setup lang="ts">
import { api } from '#backend/api'
import type { Doc } from '#backend/dataModel'

// The drawing: the button that queues it, at what it costs (strips.get),
// then its place in line, its progress and the panels, each with the URL
// strips.get read for it. useJob reads the job live. A job that failed or
// was canceled offers to try again: strips.retry makes the strip a draft.
type Panel = Doc<'strips'>['panels'][number] & { url: string | null }
const props = defineProps<{ strip: Omit<Doc<'strips'>, 'panels'> & { panels: Panel[], cost: number | null } }>()
const generate = useMutation(api.strips.generate)
const retry = useMutation(api.strips.retry)
const job = useJob(() => props.strip.jobId)
const pricing = useBackendPagePath('pricing')
const { errorMessage } = useLabels('errors')
const refusal = ref<string | null>(null)
const stopped = computed(() => job.status.value === 'failed' || job.status.value === 'canceled')

async function start() {
  refusal.value = null
  try {
    await generate({ id: props.strip._id })
  }
  catch (error) {
    const failure = getBackendError(error)
    if (failure?.code === 'insufficient_credits' && pricing.value) await navigateTo(pricing.value)
    else refusal.value = errorMessage(error)
  }
}

async function again() {
  refusal.value = null
  try {
    await retry({ id: props.strip._id })
  }
  catch (error) {
    refusal.value = errorMessage(error)
  }
}
</script>

<template>
  <section aria-labelledby="drawing-heading">
    <h2 id="drawing-heading">
      Panels
    </h2>

    <template v-if="strip.status === 'draft'">
      <button
        v-if="strip.cost === 0"
        type="button"
        class="primary"
        @click="start"
      >
        Copy this strip for free
      </button>
      <button
        v-else-if="strip.cost !== null"
        type="button"
        class="primary"
        @click="start"
      >
        Draw this strip for {{ strip.cost }} credits
      </button>
      <p v-else>
        This idea is not drawn on the demo yet. Start from another one.
      </p>
      <Gate feature="priority_queue">
        <p>Studio: your strip starts first.</p>
        <template #fallback>
          <p v-if="pricing">
            Busy? <NuxtLink :to="pricing">Studio</NuxtLink> strips start first.
          </p>
        </template>
      </Gate>
      <p
        v-if="refusal"
        role="alert"
      >
        {{ refusal }}
      </p>
    </template>

    <p v-else-if="job.status.value === 'queued'">
      Number {{ job.position.value ?? '100+' }} in line
    </p>
    <template v-else-if="job.status.value === 'running'">
      <progress
        :value="job.progress.value?.done"
        :max="job.progress.value?.total"
      />
      <p>{{ job.progress.value?.label }}</p>
      <button
        type="button"
        @click="job.cancel()"
      >
        Cancel
      </button>
    </template>
    <template v-else-if="strip.status === 'queued' && stopped">
      <p
        v-if="job.status.value === 'failed'"
        role="alert"
      >
        {{ job.error.value?.message }} Your credits were refunded.
      </p>
      <p v-else>
        You canceled this strip. Credits held while it waited went back; a strip canceled while drawing keeps its charge.
      </p>
      <button
        type="button"
        @click="again"
      >
        Try again
      </button>
      <p
        v-if="refusal"
        role="alert"
      >
        {{ refusal }}
      </p>
    </template>

    <figure
      v-for="panel in strip.panels"
      :key="panel.imageId"
    >
      <img
        v-if="panel.url"
        :src="panel.url"
        :alt="panel.caption"
        width="480"
      >
      <figcaption>{{ panel.caption }}</figcaption>
    </figure>
    <AiLabel v-if="strip.panels.length" />
  </section>
</template>
