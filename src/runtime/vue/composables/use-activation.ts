import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import type { ActivationTaskView, ActivationView } from '../../../convex/activation-rules.js'
import { useActionState } from '../utils/action-state'
import { useAuthSession } from '../utils/auth-session'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useApiNamespace } from '../utils/namespace'
import { type LabelGroupOverrides, useLabels, type UseLabelsReturn } from './use-labels'

export type { ActivationTaskView, ActivationView } from '../../../convex/activation-rules.js'

/** The functions of `audit.api` the checklist reads. */
export interface ActivationApi {
  getActivation?: FunctionReference<'query', 'public', Record<string, never>, ActivationView | null>
  dismissActivation?: FunctionReference<'mutation', 'public', Record<string, never>, null>
}

export interface UseActivationOptions {
  /** Override the injected `api.audit` namespace. */
  api?: ActivationApi
  /** Copy for the checklist, over app config and the translations. */
  labels?: MaybeRefOrGetter<LabelGroupOverrides<'activation'> | undefined>
}

/** One task, as the checklist shows it: its label read in the person's language. */
export interface ActivationTask extends Omit<ActivationTaskView, 'label'> {
  /** What to show: the task's `label` as plain text, or the label it names (`group.key`) in the active language. */
  label: string
}

export interface UseActivationReturn {
  /** The tasks in the order `defineActivation` listed them, each with whether its event landed. Empty while loading, signed out, and without a checklist. */
  tasks: ComputedRef<ActivationTask[]>
  /** How many tasks are done. */
  done: ComputedRef<number>
  /** How many tasks there are. */
  total: ComputedRef<number>
  /** The fraction done, 0 to 1. */
  progress: ComputedRef<number>
  /** Every task is done. */
  isComplete: ComputedRef<boolean>
  /** The person dismissed the checklist. */
  isDismissed: ComputedRef<boolean>
  /** An administrator is looking at the account: the progress reads, and `dismiss` does nothing. */
  readOnly: ComputedRef<boolean>
  /** The checklist has tasks to show and the person has not dismissed it. */
  isVisible: ComputedRef<boolean>
  /** `true` until the first read lands. */
  isLoading: ComputedRef<boolean>
  /** `true` while `dismiss` runs. */
  isPending: ComputedRef<boolean>
  /** Why the checklist could not be read, or dismissing failed; `null` otherwise. */
  error: ComputedRef<BackendError | null>
  /** Dismiss the checklist for good. Resolves `true` once the server stored it, `false` when it did not (read-only, failed, nothing to dismiss); never rejects. */
  dismiss: () => Promise<boolean>
  /** The checklist's words, for markup of your own. */
  labels: UseLabelsReturn<'activation'>
  /** Attribute bindings with the accessibility attributes, for markup of your own. */
  bind: {
    /** The wrapper: a labelled region. */
    root: ComputedRef<Record<string, unknown>>
    /** The progress bar: the native `<progress>`, named and carrying the count in words. */
    progress: ComputedRef<Record<string, unknown>>
    /** The dismiss button. */
    dismiss: ComputedRef<Record<string, unknown>>
    /** One task's list item: its key and whether it is done. */
    task: (task: ActivationTask) => Record<string, unknown>
  }
}

/**
 * The activation checklist without its markup: the first tasks
 * `defineActivation` declares, which of them are done, the progress, and
 * dismissing it. Needs `getActivation` and `dismissActivation` re-exported
 * from `audit.api` in `backend/audit.ts`, and a `checklist` on `setupAudit`.
 * Reads nothing for a signed-out visitor and shows no tasks without a
 * checklist. `<ActivationChecklist>` is this with the package's markup.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const activation = useActivation()
 * </script>
 * <template>
 *   <section v-if="activation.isVisible.value" v-bind="activation.bind.root.value">
 *     <progress v-bind="activation.bind.progress.value" />
 *     <ul>
 *       <li v-for="task in activation.tasks.value" :key="task.key" v-bind="activation.bind.task(task)">
 *         <NuxtLink v-if="task.to && !task.done" :to="task.to">{{ task.label }}</NuxtLink>
 *         <template v-else>{{ task.label }}</template>
 *       </li>
 *     </ul>
 *     <button v-bind="activation.bind.dismiss.value">Dismiss</button>
 *   </section>
 * </template>
 * ```
 */
export function useActivation(options: UseActivationOptions = {}): UseActivationReturn {
  // Silent without the functions: a page may place the checklist before the app re-exports them.
  const api = options.api ?? useApiNamespace<ActivationApi>('audit') ?? {}
  const labels = useLabels('activation', () => toValue(options.labels))
  const auth = useAuthSession()
  const signedOut = computed(() => !auth.isAuthenticated.value)

  const read = api.getActivation
    ? useLiveQuery(api.getActivation, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<ActivationView | null>()
  const runDismiss = api.dismissActivation ? useMutation(api.dismissActivation) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  const view = computed(() => (signedOut.value ? null : read.data.value ?? null))
  const tasks = computed<ActivationTask[]>(() => (view.value?.tasks ?? []).map(task => ({ ...task, label: labels.lookup(task.label) ?? task.label })))
  const done = computed(() => view.value?.done ?? 0)
  const total = computed(() => view.value?.total ?? 0)
  const isDismissed = computed(() => view.value?.isDismissed ?? false)
  const readOnly = computed(() => view.value?.readOnly ?? false)

  async function dismiss(): Promise<boolean> {
    if (!runDismiss || readOnly.value || isPending.value || isDismissed.value) return false
    const dismissed = await run(async () => {
      await runDismiss({})
      return true
    }, { silent: true }).catch(() => false)
    return dismissed === true
  }

  const bind: UseActivationReturn['bind'] = {
    root: computed(() => ({
      'role': 'region',
      'aria-label': labels.t('title'),
      'data-activation': 'root',
      'data-state': view.value === null ? 'loading' : view.value.isComplete ? 'complete' : 'open',
    })),
    progress: computed(() => ({
      'value': done.value,
      'max': Math.max(total.value, 1),
      'aria-label': labels.t('progressLabel'),
      'aria-valuetext': labels.t('progress', { done: done.value, total: total.value }),
      'data-activation': 'progress',
    })),
    dismiss: computed(() => ({
      'type': 'button',
      'data-activation': 'dismiss',
      ...(isPending.value ? { 'aria-disabled': 'true', 'data-state': 'pending' } : {}),
      'onClick': () => {
        void dismiss()
      },
    })),
    task: task => ({
      'data-activation': 'task',
      'data-task': task.key,
      'data-state': task.done ? 'done' : 'open',
    }),
  }

  return {
    tasks,
    done,
    total,
    progress: computed(() => view.value?.progress ?? 0),
    isComplete: computed(() => view.value?.isComplete ?? false),
    isDismissed,
    readOnly,
    isVisible: computed(() => total.value > 0 && !isDismissed.value),
    isLoading: computed(() => auth.isLoading.value || (!signedOut.value && Boolean(api.getActivation) && read.isLoading.value)),
    isPending,
    error: computed(() => (signedOut.value ? null : failure.value ?? read.error.value)),
    dismiss,
    labels,
    bind,
  }
}
