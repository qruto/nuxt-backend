<script setup lang="ts">
/**
 * One consent of `<ConsentPrompt>`: what changed or what is needed, a link
 * to the document, and its box, unticked until the person ticks it. The
 * app's `consent` slot replaces the whole line.
 *
 * Internal: a part of `<ConsentPrompt>`.
 *
 * @internal
 */
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLabels } from '../../composables/use-labels'
import type { ConsentAsk } from '../../composables/use-consents'

const props = defineProps<{
  ask: ConsentAsk
  /** Whether the box is ticked. */
  ticked: boolean
  /** An answer is on its way. */
  saving: boolean
  labels?: LabelGroupOverrides<'consent'>
}>()

defineEmits<{ tick: [value: boolean] }>()

const { t } = useLabels('consent', () => props.labels)
</script>

<template>
  <li
    data-consent="item"
    :data-kind="ask.kind"
    :data-state="ticked ? 'granted' : 'open'"
  >
    <slot>
      <p data-consent="note">
        {{ ask.changed ? t('changed', { title: ask.title }) : t('needed', { title: ask.title }) }}
      </p>
      <a
        v-if="ask.url"
        data-consent="link"
        :href="ask.url"
        target="_blank"
        rel="noopener"
      >{{ t('read', { title: ask.title }) }}</a>
      <label data-consent="label">
        <input
          type="checkbox"
          data-consent="checkbox"
          :checked="ticked"
          :required="ask.required"
          :aria-disabled="saving ? 'true' : undefined"
          @change="$emit('tick', ($event.target as HTMLInputElement).checked)"
        >
        {{ t('accept', { title: ask.title }) }}
        <span data-consent="flag">{{ ask.required ? t('required') : t('optional') }}</span>
      </label>
    </slot>
  </li>
</template>
