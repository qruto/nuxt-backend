<script setup lang="ts">
import type { LabelOverrides, BackendLabels } from '../../composables/use-labels'
import { useAiLabel, type JobProvenance } from '../../composables/use-ai-label'
import type { AiLabelSlots } from './ai-label'

/**
 * The visible "AI-generated" label the EU AI Act (Art. 50) asks for, beside
 * an image or a text a model made. Alone, it is the label; with a
 * `provenance` record (`useJob().provenance`, `ai.provenanceOf`), the label
 * is a button that opens its details: the models, the date, and a link to
 * check the image's content credentials.
 *
 * Its words come from the `ai` labels: reword or translate them, keeping
 * the meaning ("AI-generated", "Made with AI"). `useAiLabel` is the same
 * without the markup.
 *
 * @example
 * ```vue
 * <figcaption>
 *   <AiLabel :provenance="job.provenance.value" :src="panel.url" />
 * </figcaption>
 * ```
 */
defineOptions({ name: 'AiLabel' })

const props = withDefaults(defineProps<{
  /** What made the content: with it, the label opens its details. */
  provenance?: JobProvenance | null
  /** The image's public URL, for the verify link to open the verifier on it. A signed URL is never sent. */
  src?: string | null
  /** Copy for this component, over `appConfig.backend.labels.ai` and the translations. */
  labels?: LabelOverrides<BackendLabels['ai']>
}>(), { provenance: undefined, src: undefined, labels: undefined })
defineEmits({})
defineSlots<AiLabelSlots>()

const label = useAiLabel({ provenance: () => props.provenance, src: () => props.src, labels: () => props.labels })
const { t } = label.labels
</script>

<template>
  <span v-bind="label.bind.root.value">
    <template v-if="label.hasDetails.value">
      <button v-bind="label.bind.trigger.value">
        <slot>{{ t('label') }}</slot>
      </button>
      <span v-bind="label.bind.details.value">
        <strong v-bind="label.bind.heading.value">{{ t('details') }}</strong>
        <span
          v-if="label.models.value"
          data-ai-label="models"
        >{{ t('models', { models: label.models.value }) }}</span>
        <span
          v-if="label.madeOn.value"
          data-ai-label="date"
        >{{ t('madeOn', { date: label.madeOn.value }) }}</span>
        <a v-bind="label.bind.verify.value">{{ t('verify') }}</a>
      </span>
    </template>
    <span
      v-else
      data-ai-label="text"
    ><slot>{{ t('label') }}</slot></span>
  </span>
</template>
