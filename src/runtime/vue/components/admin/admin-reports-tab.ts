import type { FunctionReference } from 'convex/server'
import { computed, inject, reactive, useId } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { ReportedSubject, ReportNotice, ReportsConsole } from '../../../../convex/integrations/reports'
import type { ReportReason } from '../../../../convex/report-rules'
import { formatBillingDate } from '../../composables/billing-format'
import { useAdminChanges } from '../../utils/admin-changes'
import type { ConfirmFn } from '../../utils/confirmation'
import { absentQuery, useLiveQuery } from '../../utils/live-query'
import { useBackendNamespace } from '../../utils/namespace'

// The Reports tab's state and actions, headless: `AdminReports.vue` renders
// it. The reported content comes intimate-image removal requests first, by
// their 48-hour deadline, then the most reported; each decision asks for a
// reason and runs behind a recent sign-in, its outcome in the tab's message.

type Subject = { table: string, id: string }

/** The report functions re-exported from your `backend/admin.ts`. */
interface ReportsAdminRefs {
  getReports?: FunctionReference<'query', 'public', Record<string, never>, ReportsConsole | null>
  decideReport?: FunctionReference<'mutation', 'public', { subject?: Subject, notice?: string, action: 'hide' | 'dismiss', reason: string, ground?: 'illegal' | 'terms' }, null>
  flagCrime?: FunctionReference<'mutation', 'public', { subject?: Subject, notice?: string, note?: string }, null>
  decideAppeal?: FunctionReference<'mutation', 'public', { appealId: string, outcome: 'uphold' | 'reverse', reason: string }, null>
}

/** What one decision form holds: the reason written for it, and its ground. */
interface Draft {
  reason: string
  ground: 'terms' | 'illegal'
}

/** One entry of the queue: a reported thing, or an intimate-image request the app could not place, which keeps its own deadline. */
export type ReportsQueueItem = { subject: ReportedSubject, notice?: undefined } | { notice: ReportNotice, subject?: undefined }

/**
 * The reported things with the intimate-image requests the app could not
 * place among them: every item with a 48-hour deadline first, the soonest
 * first, then the rest of the things as the console orders them (the most
 * reported first). The notices without a deadline stay on their own.
 */
export function reportsQueue(data: Pick<ReportsConsole, 'subjects' | 'notices'>): { queue: ReportsQueueItem[], unplaced: ReportNotice[] } {
  const items: ReportsQueueItem[] = [
    ...data.subjects.map(subject => ({ subject })),
    ...data.notices.filter(notice => notice.deadline !== null).map(notice => ({ notice })),
  ]
  const deadline = (item: ReportsQueueItem) => (item.subject ? item.subject.deadline : item.notice.deadline) ?? Number.POSITIVE_INFINITY
  // A stable sort: things without a deadline keep the console's order.
  const queue = items.map((item, index) => ({ item, index }))
    .sort((a, b) => deadline(a.item) - deadline(b.item) || a.index - b.index)
    .map(({ item }) => item)
  return { queue, unplaced: data.notices.filter(notice => notice.deadline === null) }
}

/** The key a subject's or a notice's form is kept under. */
const keyOf = (target: { subject?: Subject, notice?: string }): string => target.subject ? `${target.subject.table}:${target.subject.id}` : `notice:${target.notice}`

/**
 * The Reports tab, as state and actions. `confirm` asks before a suspected
 * crime is flagged (the app's, read when asking; default: the tab's `<ConfirmDialog>`).
 *
 * @internal
 */
export function useReportsTab(confirm?: () => ConfirmFn | undefined) {
  const api = useBackendNamespace<ReportsAdminRefs>('admin', 'AdminReports')
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const read = api.getReports ? useLiveQuery(api.getReports, () => (signedOut.value ? 'skip' : {})) : absentQuery<ReportsConsole | null>()
  const decideReport = api.decideReport ? useMutation(api.decideReport) : null
  const flagCrime = api.flagCrime ? useMutation(api.flagCrime) : null
  const decideAppeal = api.decideAppeal ? useMutation(api.decideAppeal) : null
  const changes = useAdminChanges(confirm)
  const { t, errorMessage, locale, message, running, confirmation, confirmed, change, busy } = changes
  const id = useId()
  const drafts = reactive(new Map<string, Draft>())

  /** The form of a subject or a notice, made the first time it is read. */
  const draft = (target: { subject?: Subject, notice?: string }): Draft => {
    const key = keyOf(target)
    if (!drafts.has(key)) drafts.set(key, { reason: '', ground: 'terms' })
    return drafts.get(key)!
  }

  const missing = (name: string) => new Error(`[nuxt-backend] The Reports tab needs \`${name}\` re-exported from setupAdmin({ reports }) in backend/admin.ts.`)

  async function decide(target: { subject?: Subject, notice?: string }, action: 'hide' | 'dismiss') {
    const form = draft(target)
    if (!form.reason.trim()) return
    const key = `${action}:${keyOf(target)}`
    await change(key, async () => {
      if (!decideReport) throw missing('decideReport')
      await decideReport({ ...target, action, reason: form.reason, ground: form.ground })
      drafts.delete(keyOf(target))
    }, () => t(action === 'dismiss' ? 'reports.dismissed' : target.subject ? 'reports.hidden' : 'reports.markedHandled'))
  }

  async function flag(target: { subject?: Subject, notice?: string }) {
    if (!(await confirmed(t('reports.flagConfirm')))) return
    const note = draft(target).reason.trim()
    await change(`flag:${keyOf(target)}`, async () => {
      if (!flagCrime) throw missing('flagCrime')
      await flagCrime({ ...target, ...(note ? { note } : {}) })
    }, () => t('reports.flagged'))
  }

  async function judgeAppeal(appealId: string, outcome: 'uphold' | 'reverse') {
    const form = draft({ notice: `appeal:${appealId}` })
    if (!form.reason.trim()) return
    await change(`${outcome}:${appealId}`, async () => {
      if (!decideAppeal) throw missing('decideAppeal')
      await decideAppeal({ appealId, outcome, reason: form.reason })
      drafts.delete(keyOf({ notice: `appeal:${appealId}` }))
    }, () => t('reports.appealDecided'))
  }

  const date = (at: number) => formatBillingDate(at, { dateStyle: 'medium', timeStyle: 'short' }, locale.value)

  return {
    id,
    t,
    errorMessage,
    message,
    running,
    busy,
    confirmation,
    isLoading: computed(() => !signedOut.value && read.isLoading.value),
    isRefused: computed(() => !signedOut.value && read.data.value === null),
    error: computed(() => (signedOut.value ? null : read.error.value)),
    data: computed(() => read.data.value ?? null),
    /** The queue, deadlines first, and the notices left on their own. */
    queue: computed(() => reportsQueue(read.data.value ?? { subjects: [], notices: [] })),
    draft,
    decide,
    flag,
    judgeAppeal,
    date,
    keyOf,
    /** The reasons a subject was reported for, most given first, worded: `Harassment (2), Spam (1)`. */
    reasonsText: (subject: ReportedSubject) => Object.entries(subject.reasons)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .map(([reason, count]) => `${t(`reports.reasons.${reason as ReportReason}`)} (${count})`)
      .join(', '),
    /** Whether a deadline has passed, for its `data-state`. */
    overdue: (deadline: number) => deadline < Date.now(),
    notifierText: (notice: ReportNotice) => notice.notifier?.email ? t('reports.notifier', { name: notice.notifier.name ?? '', email: notice.notifier.email }) : t('reports.anonymous'),
  }
}

/** The Reports tab's state, as its parts take it. */
export type ReportsTab = ReturnType<typeof useReportsTab>
