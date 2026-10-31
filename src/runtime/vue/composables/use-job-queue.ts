import type { FunctionReference } from 'convex/server'
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import type { AdminJobView, QueueChange } from '../../../convex/integrations/ai/jobs'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { type CursorPages, useCursorPages } from '../utils/cursor-pages'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { type BackendLabels, type LabelKey, useLabels } from './use-labels'
import { useBackendNamespace } from '../utils/namespace'
import { useReauthentication } from './use-reauthentication'

export type { AdminJobView, QueueChange } from '../../../convex/integrations/ai/jobs'

/** A tier as the Queue tab shows it. */
export interface QueueTier {
  name: string
  feature: string | null
  headStart: number
  perOwner: number
  dedicated: number
  dedicatedInEffect: number
  budget: { units: number, period: number } | null
  /** The fields an administrator retuned, over `backend/jobs.ts`. */
  overridden: string[]
  running: number
  waiting: number
}

/** A model's limit as the Queue tab shows it. */
export interface QueueModel {
  model: string
  perMinute: number
  min: number
  max: number
  count429: number
  last429At: number | null
}

/** The queue at a glance (`getQueue`). */
export interface QueueOverview {
  paused: boolean
  pausedAi: boolean
  concurrency: number
  configuredConcurrency: number
  shared: number
  averageMs: number | null
  running: number
  waiting: number
  /** The guest jobs among them, claimed or not; `null` when the queue takes no guests. */
  guests: { running: number, waiting: number } | null
  trimmed: boolean
  tiers: QueueTier[]
  models: QueueModel[]
}

/** The queue functions re-exported from your `backend/jobs.ts`. */
export interface JobQueueApiRefs {
  getQueue?: FunctionReference<'query', 'public', Record<string, never>, QueueOverview | null>
  listJobs?: FunctionReference<'query', 'public', { paginationOpts: { numItems: number, cursor: string | null }, deadLetters?: boolean }, { page: AdminJobView[], isDone: boolean, continueCursor: string }>
  setQueue?: FunctionReference<'mutation', 'public', QueueChange & Record<string, unknown>, null>
  cancelJob?: FunctionReference<'mutation', 'public', { jobId: string, refund?: boolean }, null>
  retryJob?: FunctionReference<'mutation', 'public', { jobId: string }, null>
  discardJob?: FunctionReference<'mutation', 'public', { jobId: string }, null>
}

export interface UseJobQueueOptions {
  /** Jobs per page. Default 25. */
  pageSize?: number
  /** Override the injected `api.jobs` namespace. */
  api?: JobQueueApiRefs
}

export interface UseJobQueueReturn {
  /** The queue, its tiers and its models; `null` for anyone but an administrator, `undefined` while it loads. */
  queue: ComputedRef<QueueOverview | null | undefined>
  /** The page of jobs in view, newest first. */
  jobs: ComputedRef<AdminJobView[]>
  /** Show the dead letters only. */
  deadLetters: Ref<boolean>
  /** Paging through the jobs. */
  pages: CursorPages
  isLoading: ComputedRef<boolean>
  /** `true` while a change runs. */
  isPending: ComputedRef<boolean>
  /** Why the last change failed, else why the queue could not be read. */
  error: ComputedRef<BackendError | null>
  /** Pause or resume, set the concurrency, retune a tier or a model. Rejects as `setQueue` refuses. */
  setQueue: (change: QueueChange) => Promise<void>
  /** Cancel a job; `refund` gives a running job's credits back too. */
  cancel: (jobId: string, options?: { refund?: boolean }) => Promise<void>
  /** Put a dead letter back in line. */
  retry: (jobId: string) => Promise<void>
  /** Take a dead letter out of the view for good. */
  discard: (jobId: string) => Promise<void>
}

/**
 * The admin console's Queue tab, headless: the queue read live, its jobs a
 * page at a time (or only the dead letters), and the changes an
 * administrator makes, each through `backend/jobs.ts`'s functions, which
 * check the role and a recent sign-in: a change refused as
 * `reauthentication_required` asks the person to sign in again
 * (`<ReauthenticateDialog>`, which the tab mounts) and runs once more.
 *
 * @internal
 */
export function useJobQueue(options: UseJobQueueOptions = {}): UseJobQueueReturn {
  const api = useBackendNamespace<JobQueueApiRefs>('jobs', 'useJobQueue', options.api)
  const pageSize = options.pageSize ?? 25
  const deadLetters = ref(false)
  const queue = api.getQueue ? useLiveQuery(api.getQueue, {}) : absentQuery<QueueOverview | null>()
  // The page is read after `pages` exists: it reads its cursor from it.
  let list = absentQuery<{ page: AdminJobView[], isDone: boolean, continueCursor: string }>()
  const pages = useCursorPages(() => `${deadLetters.value}:${pageSize}`, () => list.data.value, () => list.isLoading.value)
  if (api.listJobs) {
    list = useLiveQuery(api.listJobs, () => (queue.data.value ? { paginationOpts: { numItems: pageSize, cursor: pages.cursor.value }, ...(deadLetters.value ? { deadLetters: true } : {}) } : 'skip'))
  }
  const { isPending, failure, run } = useActionState()
  const { withReauthentication } = useReauthentication()
  const call = <Args>(fn: ((args: Args) => Promise<unknown>) | null, name: string) => async (args: Args): Promise<void> => {
    if (!fn) throw new Error(`[nuxt-backend] useJobQueue() needs \`${name}\` re-exported from defineJobQueue() in backend/jobs.ts, or pass \`{ api }\`.`)
    await run(() => withReauthentication(() => fn(args)))
  }
  const setQueue = call(api.setQueue ? useMutation(api.setQueue) as unknown as (args: QueueChange) => Promise<unknown> : null, 'setQueue')
  const cancelJob = call(api.cancelJob ? useMutation(api.cancelJob) : null, 'cancelJob')
  const retryJob = call(api.retryJob ? useMutation(api.retryJob) : null, 'retryJob')
  const discardJob = call(api.discardJob ? useMutation(api.discardJob) : null, 'discardJob')

  return {
    queue: computed(() => queue.data.value),
    jobs: computed(() => list.data.value?.page ?? []),
    deadLetters,
    pages,
    isLoading: computed(() => queue.isLoading.value || list.isLoading.value),
    isPending,
    error: computed(() => failure.value ?? queue.error.value ?? list.error.value),
    setQueue,
    cancel: (jobId, { refund } = {}) => cancelJob({ jobId, ...(refund ? { refund } : {}) }),
    retry: jobId => retryJob({ jobId }),
    discard: jobId => discardJob({ jobId }),
  }
}

/**
 * The Queue tab's words: the admin group's `queue.*` labels by a key built
 * at run time, and the sentence for a refusal.
 *
 * @internal
 */
export function useQueueLabels() {
  const { t, errorMessage } = useLabels('admin')
  const tr = (key: string, params?: Record<string, string | number>): string => t(key as LabelKey<BackendLabels['admin']>, params)
  return { tr, errorMessage }
}
