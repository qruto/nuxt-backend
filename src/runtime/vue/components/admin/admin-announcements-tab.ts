import { computed, reactive, useId } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import { type AnnouncementAudience, type AnnouncementRow, useAnnouncementsAdmin } from '../../composables/use-announcements'
import { useAdminChanges } from '../../utils/admin-changes'
import type { ConfirmFn } from '../../utils/confirmation'

// The Announcements tab's state and actions, headless:
// `AdminAnnouncements.vue` renders it. The composer publishes a notice (and
// the email that may go with it); the list ends a notice early, previews,
// sends or cancels its email. Every change runs one at a time behind a
// recent sign-in, its outcome in the tab's message.

/** The longest a notice may be (the server holds the same). */
const MESSAGE_MAX = 280

/** A week from now, as a `datetime-local` value: the composer's default expiry. */
function inAWeek(): string {
  const at = new Date(Date.now() + 7 * 24 * 60 * 60_000)
  at.setSeconds(0, 0)
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** A `datetime-local` value as epoch ms, or `undefined` when empty or unreadable. */
function epochOf(value: string): number | undefined {
  if (!value) return undefined
  const at = new Date(value).getTime()
  return Number.isFinite(at) ? at : undefined
}

/**
 * The Announcements tab, as state and actions. `confirm` asks before a
 * notice is ended or an email sent (the app's, read when asking; default: the tab's `<ConfirmDialog>`).
 *
 * @internal
 */
export function useAnnouncementsTab(confirm?: () => ConfirmFn | undefined) {
  const admin = useAnnouncementsAdmin()
  const changes = useAdminChanges(confirm)
  const { t, locale, confirmed, change } = changes
  const id = useId()
  const draft = reactive({
    message: '',
    linkUrl: '',
    linkLabel: '',
    expiresAt: inAWeek(),
    withBroadcast: false,
    audience: 'accounts' as AnnouncementAudience,
    topic: '',
    subject: '',
    body: '',
  })
  // The time each email is scheduled for, by announcement, as the person types it.
  const sendAt = reactive<Record<string, string>>({})

  const data = computed(() => admin.console.value ?? null)
  const topics = computed(() => data.value?.topics ?? [])

  async function publish() {
    const topic = draft.topic || topics.value[0]?.key
    const expiresAt = epochOf(draft.expiresAt) ?? 0
    const result = await change('publish', () => admin.publish({
      message: draft.message,
      ...(draft.linkUrl.trim() ? { link: { url: draft.linkUrl.trim(), ...(draft.linkLabel.trim() ? { label: draft.linkLabel.trim() } : {}) } } : {}),
      expiresAt,
      ...(draft.withBroadcast
        ? { broadcast: { audience: draft.audience, ...(draft.audience === 'accounts' && topic ? { topic } : {}), subject: draft.subject, body: draft.body } }
        : {}),
    }), () => t('announcements.published'))
    if (result !== undefined) Object.assign(draft, { message: '', linkUrl: '', linkLabel: '', expiresAt: inAWeek(), withBroadcast: false, subject: '', body: '' })
  }

  async function end(row: AnnouncementRow) {
    if (!(await confirmed(t('announcements.endConfirm')))) return
    await change(`end:${row.id}`, () => admin.end(row.id))
  }

  async function preview(row: AnnouncementRow) {
    await change(`preview:${row.id}`, () => admin.preview(row.id), () => t('announcements.previewed'))
  }

  async function send(row: AnnouncementRow) {
    if (!(await confirmed(t('announcements.sendConfirm')))) return
    const scheduledAt = epochOf(sendAt[row.id] ?? '')
    await change(`send:${row.id}`, () => admin.send(row.id, scheduledAt), () => t(scheduledAt ? 'announcements.scheduled' : 'announcements.sent'))
  }

  async function cancel(row: AnnouncementRow) {
    await change(`cancel:${row.id}`, () => admin.cancel(row.id), () => t('announcements.cancelled'))
  }

  const date = (at: number) => formatBillingDate(at, { dateStyle: 'medium', timeStyle: 'short' }, locale.value)

  /** Where a notice stands: live until, ended or expired. */
  const noticeState = (row: AnnouncementRow): { key: 'live' | 'ended' | 'expired', text: string } => {
    if (row.endedAt !== undefined) return { key: 'ended', text: t('announcements.ended', { date: date(row.endedAt) }) }
    if (row.expiresAt <= Date.now()) return { key: 'expired', text: t('announcements.expired', { date: date(row.expiresAt) }) }
    return { key: 'live', text: t('announcements.live', { date: date(row.expiresAt) }) }
  }

  /** Where an email stands, in words: a send in the future reads as scheduled. */
  const emailState = (row: AnnouncementRow): string => {
    const broadcast = row.broadcast
    if (!broadcast) return ''
    if (broadcast.state === 'sent' && broadcast.sendAt !== undefined) {
      return broadcast.sendAt > Date.now() ? t('announcements.states.scheduled', { date: date(broadcast.sendAt) }) : t('announcements.states.sent', { date: date(broadcast.sendAt) })
    }
    return t(`announcements.states.${broadcast.state === 'sent' ? 'draft' : broadcast.state}`)
  }

  /** Whether an email may still be sent, or cancelled. */
  const canSend = (row: AnnouncementRow) => row.broadcast !== undefined && ['draft', 'created'].includes(row.broadcast.state)
  const canCancel = (row: AnnouncementRow) => row.broadcast !== undefined && (canSend(row) || (row.broadcast.state === 'sent' && (row.broadcast.sendAt ?? 0) > Date.now()))

  return {
    ...changes,
    id,
    admin,
    data,
    topics,
    draft,
    sendAt,
    messageMax: MESSAGE_MAX,
    publish,
    end,
    preview,
    send,
    cancel,
    date,
    noticeState,
    emailState,
    canSend,
    canCancel,
  }
}

/** The Announcements tab's state, as its markup takes it. */
export type AnnouncementsTab = ReturnType<typeof useAnnouncementsTab>
