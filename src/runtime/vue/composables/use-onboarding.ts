import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, ref, toValue, watch } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import type { OnboardingState } from '../../../convex/integrations/account'
import { useActionState } from '../utils/action-state'
import { useAuthSession } from '../utils/auth-session'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useApiNamespace } from '../utils/namespace'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

export type { OnboardingState } from '../../../convex/integrations/account'

/** The steps the package renders, in the order a new account sees them. */
export const ONBOARDING_STEPS = ['profile', 'workspace', 'teammates', 'plan'] as const

/** The functions of `account.api` the first run reads. */
export interface OnboardingApi {
  getOnboarding?: FunctionReference<'query', 'public', Record<string, never>, OnboardingState | null>
  completeOnboarding?: FunctionReference<'mutation', 'public', Record<string, never>, OnboardingState>
}

export interface UseOnboardingOptions {
  /** Override the injected `api.account` namespace. */
  api?: OnboardingApi
  /**
   * The steps in order: the built-in ones by name (`profile`, `workspace`,
   * `teammates`, `plan`) and your own by the name of the slot that renders
   * them. Default: the four built-in steps.
   */
  steps?: MaybeRefOrGetter<readonly string[]>
  /** Copy for the first run, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'onboarding'> | undefined>
  /** Called once the first run was stamped as finished (completed or skipped). */
  onDone?: () => void
}

export interface UseOnboardingReturn {
  /** The steps in order, without repeats. */
  steps: ComputedRef<string[]>
  /** The step the person is on; `null` when there are none. */
  step: ComputedRef<string | null>
  /** The current step's place, from 0. */
  index: ComputedRef<number>
  /** How many steps there are. */
  total: ComputedRef<number>
  /** The current step is the first. */
  isFirst: ComputedRef<boolean>
  /** The current step is the last: `next()` finishes the first run. */
  isLast: ComputedRef<boolean>
  /** When the account finished or skipped the first run, epoch ms. `null` while it has not, `undefined` while that is read (and without `getOnboarding` re-exported). */
  onboardedAt: ComputedRef<number | null | undefined>
  /** Whether the account finished or skipped the first run; `undefined` while that is read. */
  isOnboarded: ComputedRef<boolean | undefined>
  /** The first run was finished in this visit. */
  isDone: ComputedRef<boolean>
  /** `true` until the state of the account is read. */
  isLoading: ComputedRef<boolean>
  /** `true` while the first run is being stamped. */
  isPending: ComputedRef<boolean>
  /** Why stamping the first run failed, or why the state could not be read; `null` otherwise. */
  error: ComputedRef<BackendError | null>
  /** The name of a step as a person reads it: the `stepNames` label of a built-in step or one you gave, else the name in words. */
  stepName: (step: string) => string
  /** Move to the next step; on the last one, finish. Resolves `true` unless finishing failed. */
  next: () => Promise<boolean>
  /** Leave the current step as it is and move on; on the last one, finish. Resolves like `next`. */
  skip: () => Promise<boolean>
  /** Go back one step. */
  back: () => void
  /** Go to a step by its name. */
  goTo: (step: string) => void
  /** End the first run now: stamps `onboardedAt` once and keeps the first time on a second call. Resolves `true` once stamped, `false` when it failed; never rejects. */
  finish: () => Promise<boolean>
  /** What the live region says: where the person is, as "Step 2 of 4: Your workspace". */
  announcement: ComputedRef<string>
  /** The first run's words, for markup of your own. */
  labels: UseLabelsReturn<'onboarding'>
}

/** A step name in words: `first-strip` reads "First strip". */
function plainStep(step: string): string {
  const words = step.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The first run at `/welcome` without its markup: the steps in order, where
 * the person is, moving between them, and the stamp that ends it. Needs
 * `getOnboarding` and `completeOnboarding` re-exported from `account.api` in
 * `backend/account.ts`. `<OnboardingFlow>` is this with the package's steps.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const onboarding = useOnboarding({ steps: ['profile', 'genre'], onDone: () => navigateTo('/studio') })
 * </script>
 * <template>
 *   <GenrePicker v-if="onboarding.step.value === 'genre'" @picked="onboarding.next()" />
 *   <button type="button" @click="onboarding.skip()">Skip</button>
 * </template>
 * ```
 */
export function useOnboarding(options: UseOnboardingOptions = {}): UseOnboardingReturn {
  const api = options.api ?? useApiNamespace<OnboardingApi>('account') ?? {}
  const labels = useLabels('onboarding', () => toValue(options.labels))
  const auth = useAuthSession()
  const signedOut = computed(() => !auth.isAuthenticated.value)

  const read = api.getOnboarding
    ? useLiveQuery(api.getOnboarding, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<OnboardingState | null>()
  const runComplete = api.completeOnboarding ? useMutation(api.completeOnboarding) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  const steps = computed(() => [...new Set((toValue(options.steps) ?? ONBOARDING_STEPS).map(step => step.trim()).filter(Boolean))])
  const current = ref(0)
  // A list that shrinks (the plan step leaves once nothing is on sale) keeps the person on a step that exists.
  watch(steps, (list) => {
    if (current.value > list.length - 1) current.value = Math.max(list.length - 1, 0)
  })
  const finished = ref(false)

  const index = computed(() => Math.min(current.value, Math.max(steps.value.length - 1, 0)))
  const step = computed(() => steps.value[index.value] ?? null)
  const total = computed(() => steps.value.length)
  const isLast = computed(() => index.value >= total.value - 1)
  const onboardedAt = computed<number | null | undefined>(() => {
    if (signedOut.value || !api.getOnboarding) return undefined
    const state = read.data.value
    return state === undefined || state === null ? undefined : state.onboardedAt
  })

  const stepName = (name: string): string => labels.lookup(`onboarding.stepNames.${name}`) ?? plainStep(name)

  async function finish(): Promise<boolean> {
    if (finished.value) return true
    if (isPending.value) return false
    if (!runComplete) {
      // Nothing to stamp: the person still leaves the first run.
      finished.value = true
      options.onDone?.()
      return true
    }
    const stamped = await run(async () => {
      await runComplete({})
      return true
    }, { silent: true }).catch(() => false)
    if (stamped !== true) return false
    finished.value = true
    options.onDone?.()
    return true
  }

  async function next(): Promise<boolean> {
    if (isLast.value) return finish()
    current.value = index.value + 1
    return true
  }

  return {
    steps,
    step,
    index,
    total,
    isFirst: computed(() => index.value === 0),
    isLast,
    onboardedAt,
    isOnboarded: computed(() => (onboardedAt.value === undefined ? undefined : onboardedAt.value !== null)),
    isDone: computed(() => finished.value),
    isLoading: computed(() => auth.isLoading.value || (!signedOut.value && Boolean(api.getOnboarding) && read.isLoading.value)),
    isPending,
    error: computed(() => (signedOut.value ? null : failure.value ?? read.error.value)),
    stepName,
    next,
    skip: next,
    back: () => {
      current.value = Math.max(index.value - 1, 0)
    },
    goTo: (name) => {
      const at = steps.value.indexOf(name)
      if (at >= 0) current.value = at
    },
    finish,
    announcement: computed(() => (step.value === null ? '' : `${labels.t('progress', { current: index.value + 1, total: total.value })}: ${stepName(step.value)}`)),
    labels,
  }
}
