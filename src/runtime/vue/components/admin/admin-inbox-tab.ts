import { computed, ref, useId } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import { type InboxRow, useInboxAdmin } from '../../composables/use-inbox-admin'
import { useAdminChanges } from '../../utils/admin-changes'

// The Inbox tab's state and actions, headless: `AdminInbox.vue` renders it.
// The list is newest first, narrowed by where a message came from; one row
// is open at a time, with its reply form when it sits in the support inbox.
// A reply runs behind a recent sign-in, its outcome in the tab's message.

/** The kinds a message comes from, in the order the filter lists them. */
export const INBOX_KINDS = ['contact', 'support', 'reply', 'workspace'] as const

/**
 * The Inbox tab, as state and actions.
 *
 * @internal
 */
export function useInboxTab() {
  const inbox = useInboxAdmin()
  const changes = useAdminChanges()
  const { t, errorMessage, locale, message, running, change, busy } = changes
  const id = useId()
  const kind = ref<'all' | InboxRow['kind']>('all')
  const openId = ref<string | null>(null)
  const drafts = ref<Record<string, string>>({})

  const rows = computed<InboxRow[]>(() => (inbox.console.value?.rows ?? []).filter(row => kind.value === 'all' || row.kind === kind.value))

  async function reply(row: InboxRow) {
    const text = drafts.value[row.id]?.trim()
    if (!text) return
    const sent = await change(`reply:${row.id}`, () => inbox.reply(row, text).then(() => true), () => t('inbox.replySent'))
    if (sent) drafts.value = { ...drafts.value, [row.id]: '' }
  }

  return {
    id,
    t,
    errorMessage,
    inbox,
    data: computed(() => inbox.console.value ?? null),
    rows,
    message,
    running,
    busy,
    kind,
    kinds: INBOX_KINDS,
    openId,
    toggle: (rowId: string) => {
      openId.value = openId.value === rowId ? null : rowId
    },
    drafts,
    reply,
    kindName: (value: InboxRow['kind']) => t(`inbox.kinds.${value}`),
    date: (at: number) => formatBillingDate(at, { dateStyle: 'medium', timeStyle: 'short' }, locale.value),
    /** Who wrote: the account's name, else the name given, else the address. */
    sender: (row: InboxRow) => row.account?.name || row.name || row.from || '',
  }
}

/** The Inbox tab's state, as its parts take it. */
export type InboxTab = ReturnType<typeof useInboxTab>
