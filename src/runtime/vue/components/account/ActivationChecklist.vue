<script setup lang="ts">
import { ref, watch } from 'vue'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useActivation } from '../../composables/use-activation'
import type { ActivationChecklistSlots } from './activation-checklist'

/**
 * The first tasks that lead to value, with progress, for a page of your
 * app: the tasks `defineActivation` declares, each ticked off when its event
 * is recorded, "2 of 4 done", a link per open task and a Dismiss button.
 * Once every task is done it congratulates once and goes away; a dismissed
 * checklist stays dismissed for that person. It renders nothing for a
 * signed-out visitor, an app with no checklist, and a checklist that was
 * dismissed. An administrator visiting the account sees its progress
 * read-only. Separate from `<OnboardingFlow>`. The logic is `useActivation`.
 *
 * @example
 * ```vue
 * <ActivationChecklist />
 * ```
 */
defineOptions({ name: 'ActivationChecklist' })

const props = defineProps<{
  /** Copy for the checklist, over `appConfig.backend.labels.activation` and the translations. */
  labels?: LabelGroupOverrides<'activation'>
}>()

const emit = defineEmits({
  /** The person dismissed the checklist. */
  dismissed: () => true,
  /** Every task is done: the checklist congratulates, then goes away. */
  completed: () => true,
})

defineSlots<ActivationChecklistSlots>()

const activation = useActivation({ labels: () => props.labels })
const { t } = activation.labels

// The congratulation shows for as long as this view lasts, and is dismissed at once so a
// reload shows nothing: "once" is the person's first sight of a finished checklist.
const celebrating = ref(false)
watch([activation.isComplete, activation.isDismissed, activation.isLoading], async ([complete, dismissed, loading]) => {
  if (loading || !complete || dismissed || celebrating.value) return
  celebrating.value = true
  emit('completed')
  if (!activation.readOnly.value) await activation.dismiss()
}, { immediate: true })

async function dismiss(): Promise<void> {
  celebrating.value = false
  if (await activation.dismiss()) emit('dismissed')
}

/** A link that leaves the app opens as a plain link; one inside it is a route. */
const external = (to: string): boolean => /^https:/i.test(to)
</script>

<template>
  <div
    data-activation="wrapper"
    :aria-busy="activation.isLoading.value || activation.isPending.value ? 'true' : undefined"
  >
    <section
      v-if="activation.isVisible.value || celebrating"
      v-bind="activation.bind.root.value"
    >
      <h2 data-activation="title">
        {{ t('title') }}
      </h2>
      <p data-activation="count">
        {{ t('progress', { done: activation.done.value, total: activation.total.value }) }}
      </p>
      <progress v-bind="activation.bind.progress.value" />
      <ol data-activation="tasks">
        <li
          v-for="task in activation.tasks.value"
          :key="task.key"
          v-bind="activation.bind.task(task)"
        >
          <slot
            name="task"
            :task="task"
          >
            <template v-if="task.to && !task.done && !activation.readOnly.value">
              <a
                v-if="external(task.to)"
                :href="task.to"
                rel="noopener"
                data-activation="link"
              >{{ task.label }}</a>
              <NuxtLink
                v-else
                :to="task.to"
                data-activation="link"
              >
                {{ task.label }}
              </NuxtLink>
            </template>
            <span
              v-else
              data-activation="label"
            >{{ task.label }}</span>
          </slot>
          <!-- Done or to do, in words: the mark beside it is only a picture. -->
          <span data-activation="state">{{ task.done ? t('taskDone') : t('taskOpen') }}</span>
        </li>
      </ol>
      <p
        v-if="celebrating"
        data-activation="congratulations"
      >
        <slot name="congratulations">
          {{ t('congratulations') }}
        </slot>
      </p>
      <p
        v-if="activation.readOnly.value"
        data-activation="read-only"
      >
        {{ t('readOnly') }}
      </p>
      <button
        v-else-if="celebrating"
        type="button"
        data-activation="dismiss"
        @click="celebrating = false"
      >
        {{ t('dismiss') }}
      </button>
      <button
        v-else
        type="button"
        data-activation="dismiss"
        :aria-disabled="activation.isPending.value ? 'true' : undefined"
        @click="dismiss"
      >
        {{ activation.isPending.value ? t('dismissing') : t('dismiss') }}
      </button>
    </section>
    <p
      role="status"
      aria-live="polite"
      data-activation="status"
    >
      {{ activation.isLoading.value ? t('loading') : celebrating ? t('congratulations') : '' }}
    </p>
  </div>
</template>
