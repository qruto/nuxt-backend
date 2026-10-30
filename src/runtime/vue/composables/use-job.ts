import type { FunctionReference } from 'convex/server'
import { computed, inject, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { JobProgress, JobView } from '../../../convex/integrations/ai/jobs'
import type { JobProvenance } from '../../../convex/integrations/ai/provenance'
import { type BackendError, getBackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useBackendNamespace } from '../utils/namespace'

export type { JobProgress, JobView } from '../../../convex/integrations/ai/jobs'
export type { JobProvenance } from '../../../convex/integrations/ai/provenance'

/** The job functions re-exported from your `backend/jobs.ts`. */
export interface JobApiRefs {
  getJob?: FunctionReference<'query', 'public', { jobId: string }, JobView | null>
  cancelJob?: FunctionReference<'mutation', 'public', { jobId: string, refund?: boolean }, null>
}

export interface UseJobOptions {
  /** Override the injected `api.jobs` namespace. */
  api?: JobApiRefs
}

export interface UseJobReturn {
  /** Where the job is; `undefined` while it loads, and for a job the caller may not read. */
  status: ComputedRef<JobView['status'] | undefined>
  /** What holds a waiting job: a slot (`'line'`), its owner's other jobs (`'owner'`) or a paused queue (`'paused'`); `undefined` once it runs. */
  waitingOn: ComputedRef<'line' | 'owner' | 'paused' | undefined>
  /** About its place in line while it waits, `1` starts next; `null` past 100 jobs ahead, while `'owner'` or `'paused'`, and once it runs. */
  position: ComputedRef<number | null | undefined>
  /** About how long until it starts, in ms; `undefined` while paused, once it runs, and before any job has finished. */
  estimatedWait: ComputedRef<number | undefined>
  /** What the job last reported with `job.progress`. */
  progress: ComputedRef<JobProgress | undefined>
  /** What its handler returned, once it is `done`. */
  result: ComputedRef<unknown>
  /**
   * What made the result, once it is `done` and `setupAi({ provenance })` is
   * on: the models its steps called, when it finished, and the ids of its
   * inputs. `<AiLabel :provenance>` shows it.
   */
  provenance: ComputedRef<JobProvenance | undefined>
  /** Why it failed, as a catalog error whose message is safe to show; `null` otherwise. */
  error: ComputedRef<BackendError | null>
  /** Whether the caller may cancel it now. */
  canCancel: ComputedRef<boolean>
  /** Take it out of line and release its hold; a running job stops after its current step, and stays charged. */
  cancel: () => Promise<void>
}

/**
 * One queued job, live: its status, what holds it and its place in line
 * while it waits, its progress while it runs, and its result or the reason
 * it failed. Reads through `getJob` and `cancelJob` of `backend/jobs.ts`,
 * and pauses while the id is empty.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const strip = useQuery(api.strips.get, () => ({ id: route.params.id as string }))
 * const job = useJob(() => strip.value?.jobId)
 * </script>
 * <template>
 *   <p v-if="job.waitingOn.value === 'line'">Number {{ job.position.value ?? '100+' }} in line</p>
 *   <progress v-else-if="job.status.value === 'running'" :value="job.progress.value?.done" :max="job.progress.value?.total" />
 * </template>
 * ```
 *
 * @experimental
 */
export function useJob(jobId: MaybeRefOrGetter<string | null | undefined>, options: UseJobOptions = {}): UseJobReturn {
  const api = useBackendNamespace<JobApiRefs>('jobs', 'useJob', options.api)
  const auth = inject(ConvexAuthStateKey, null)
  const id = computed(() => toValue(jobId)?.trim() || null)
  const read = api.getJob
    ? useLiveQuery(api.getJob, () => (!id.value || (auth != null && !auth.isAuthenticated.value) ? 'skip' : { jobId: id.value }))
    : absentQuery<JobView | null>()
  const runCancel = api.cancelJob ? useMutation(api.cancelJob) : null
  const job = computed(() => read.data.value ?? undefined)
  const waiting = computed(() => job.value?.status === 'queued')

  return {
    status: computed(() => job.value?.status),
    waitingOn: computed(() => (waiting.value ? job.value?.waitingOn : undefined)),
    position: computed(() => (job.value ? (waiting.value && job.value.waitingOn === 'line' ? job.value.position ?? null : null) : undefined)),
    estimatedWait: computed(() => (waiting.value ? job.value?.estimatedWait : undefined)),
    progress: computed(() => job.value?.progress),
    result: computed(() => (job.value?.status === 'done' ? job.value.result : undefined)),
    provenance: computed(() => (job.value?.status === 'done' ? job.value.provenance : undefined)),
    error: computed(() => (job.value?.status === 'failed' && job.value.error ? getBackendError({ name: 'ConvexError', data: job.value.error }) : null)),
    canCancel: computed(() => job.value?.canCancel === true),
    cancel: async () => {
      if (!runCancel) throw new Error('[nuxt-backend] useJob() needs `cancelJob` re-exported from defineJobQueue() in backend/jobs.ts (`export const { getJob, cancelJob } = jobs.api`), or pass `{ api }`.')
      if (!id.value) return
      await runCancel({ jobId: id.value })
    },
  }
}
