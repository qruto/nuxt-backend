<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ONBOARDING_STEPS, useOnboarding } from '../../composables/use-onboarding'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { usePricing } from '../../composables/use-pricing'
import { useApiNamespace } from '../../utils/namespace'
import { VNodes } from '../../utils/vnodes'
import type { OnboardingFlowSlots, OnboardingStepScope } from './onboarding-flow'

/**
 * The first run a new account sees once, at `/welcome`: a few short steps.
 * The built-in ones are `profile` (name and picture), `workspace` (rename the
 * personal workspace, or join one the person was invited to), `teammates`
 * (invite people) and `plan` (shown only when the catalog sells one, and the
 * person may skip it). Add steps of your own by name in `steps` and a slot of
 * the same name; a slot named like a built-in step replaces it. Finishing or
 * skipping stamps `onboardedAt` on the account, and the package stops sending
 * the person here. The logic is `useOnboarding`.
 *
 * @example
 * ```vue
 * <OnboardingFlow :steps="['profile', 'genre']" @done="navigateTo('/studio')">
 *   <template #genre="{ next }"><GenrePicker @picked="next" /></template>
 * </OnboardingFlow>
 * ```
 */
defineOptions({ name: 'OnboardingFlow' })

const props = withDefaults(defineProps<{
  /** The steps in order: built-in ones by name and your own by their slot's name. Default: `profile`, `workspace`, `teammates` and `plan`. */
  steps?: string[]
  /** Copy for the first run, over `appConfig.backend.labels.onboarding` and the translations. */
  labels?: LabelGroupOverrides<'onboarding'>
}>(), { steps: undefined, labels: undefined })

const emit = defineEmits({
  /** The first run is stamped as finished: completed or skipped. */
  done: () => true,
  /** The person moved to a step. */
  step: (_step: string) => true,
})
const slots = defineSlots<OnboardingFlowSlots>()

// The plan step needs a catalog that sells a plan; with none it leaves the list.
const priced = Boolean(useApiNamespace<{ getPricing?: unknown }>('billing')?.getPricing)
const pricing = priced ? usePricing({ server: false }) : null
const planOnSale = computed(() => pricing?.plans.value?.some(plan => !plan.retired && !plan.free) === true)

const requested = computed(() => props.steps ?? [...ONBOARDING_STEPS])
const shown = computed(() => requested.value.filter(step => step !== 'plan' || slots.plan !== undefined || planOnSale.value))

const onboarding = useOnboarding({ steps: shown, labels: () => props.labels, onDone: () => emit('done') })
const { t } = onboarding.labels

const scope = computed<OnboardingStepScope>(() => ({
  step: onboarding.step.value ?? '',
  next: onboarding.next,
  skip: onboarding.skip,
  back: onboarding.back,
  index: onboarding.index.value,
  total: onboarding.total.value,
  onboarding,
}))

/** The slot of the current step: a step of the app's, or one that replaces a built-in step. */
const stepSlot = computed(() => (slots as Record<string, ((scope: OnboardingStepScope) => unknown) | undefined>)[onboarding.step.value ?? ''])

// Focus follows the person to the new step's heading, so a screen reader starts there.
const section = ref<HTMLElement | null>(null)
watch(onboarding.step, async (step, before) => {
  if (step === null) return
  emit('step', step)
  if (before === undefined) return
  await nextTick()
  section.value?.focus()
})

const state = computed(() => (onboarding.isDone.value ? 'done' : onboarding.isPending.value ? 'pending' : 'ready'))
const errorText = computed(() => (onboarding.error.value ? onboarding.labels.errorMessage(onboarding.error.value) : null))
</script>

<template>
  <div
    data-onboarding="root"
    :data-state="state"
    :aria-busy="onboarding.isPending.value ? 'true' : undefined"
  >
    <template v-if="onboarding.isDone.value">
      <p data-onboarding="finished">
        {{ t('done') }}
      </p>
    </template>
    <template v-else-if="onboarding.step.value !== null">
      <ol
        data-onboarding="steps"
        :aria-label="t('steps')"
      >
        <li
          v-for="(name, at) in onboarding.steps.value"
          :key="name"
          data-onboarding="step-name"
          :data-state="at < onboarding.index.value ? 'done' : at === onboarding.index.value ? 'current' : 'upcoming'"
          :aria-current="at === onboarding.index.value ? 'step' : undefined"
        >
          {{ onboarding.stepName(name) }}
        </li>
      </ol>
      <p data-onboarding="progress">
        {{ t('progress', { current: onboarding.index.value + 1, total: onboarding.total.value }) }}
      </p>
      <section
        ref="section"
        data-onboarding="step"
        :data-step="onboarding.step.value"
        tabindex="-1"
      >
        <VNodes
          v-if="stepSlot"
          :nodes="stepSlot(scope) as never"
        />
        <OnboardingProfile
          v-else-if="onboarding.step.value === 'profile'"
          :onboarding="onboarding"
        />
        <OnboardingWorkspace
          v-else-if="onboarding.step.value === 'workspace'"
          :onboarding="onboarding"
        />
        <OnboardingTeammates
          v-else-if="onboarding.step.value === 'teammates'"
          :onboarding="onboarding"
        />
        <OnboardingPlan
          v-else-if="onboarding.step.value === 'plan'"
          :onboarding="onboarding"
        />
      </section>
      <p
        v-if="errorText"
        data-onboarding="error"
        role="alert"
      >
        {{ errorText }}
      </p>
      <div data-onboarding="actions">
        <button
          v-if="!onboarding.isFirst.value"
          type="button"
          data-onboarding="back"
          @click="onboarding.back()"
        >
          {{ t('back') }}
        </button>
        <button
          type="button"
          data-onboarding="skip-all"
          :aria-disabled="onboarding.isPending.value ? 'true' : undefined"
          @click="onboarding.finish()"
        >
          {{ onboarding.isPending.value ? t('saving') : t('skipAll') }}
        </button>
      </div>
    </template>
    <p
      role="status"
      aria-live="polite"
      data-onboarding="status"
    >
      {{ onboarding.isDone.value ? t('done') : onboarding.announcement.value }}
    </p>
  </div>
</template>
