import { computed, reactive, ref, useId } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import { useWaitlistAdmin, type WaitlistCaps, type WaitlistEntryRow, type WaitlistStatus } from '../../composables/use-waitlist-admin'
import { useAdminChanges } from '../../utils/admin-changes'
import type { ConfirmFn } from '../../utils/confirmation'

// The Waitlist tab's state and actions, headless: `AdminWaitlist.vue`
// renders it. The list is the oldest first, narrowed by a filter, with a
// count per status; every change runs one at a time behind a recent
// sign-in, its outcome in the tab's message.

/** The most "next N" asks for at once (the same cap the server holds). */
const WAVE_MAX = 200

/**
 * The Waitlist tab, as state and actions. `confirm` asks before entries are
 * declined or removed (the app's, read when asking; default: the tab's `<ConfirmDialog>`).
 *
 * @internal
 */
export function useWaitlistTab(confirm?: () => ConfirmFn | undefined) {
  const filter = reactive({ status: 'waiting' as WaitlistStatus, domain: '', source: '', question: '', answer: '' })
  // The filter applies when the form is sent, not on every key.
  const applied = ref({ ...filter })
  const waitlist = useWaitlistAdmin({ filter: () => applied.value })
  const changes = useAdminChanges(confirm)
  const { t, errorMessage, locale, message, running, confirmation, confirmed, change, busy } = changes
  const id = useId()
  const selected = ref<string[]>([])
  const next = ref('50')
  const caps = ref<WaitlistCaps | null | undefined>(undefined)

  const entries = computed<WaitlistEntryRow[]>(() => waitlist.console.value?.entries ?? [])
  const questions = computed(() => waitlist.console.value?.questions ?? {})

  function applyFilter() {
    applied.value = { ...filter, ...(filter.question && filter.answer ? {} : { question: '', answer: '' }) }
    selected.value = []
  }

  function clearFilter() {
    Object.assign(filter, { status: 'waiting', domain: '', source: '', question: '', answer: '' })
    applyFilter()
  }

  const allSelected = computed(() => entries.value.length > 0 && entries.value.every(entry => selected.value.includes(entry.id)))
  const toggleAll = (on: boolean) => {
    selected.value = on ? entries.value.map(entry => entry.id) : []
  }
  const toggle = (entryId: string, on: boolean) => {
    selected.value = on ? [...new Set([...selected.value, entryId])] : selected.value.filter(other => other !== entryId)
  }

  async function approve() {
    if (!selected.value.length) return
    const ids = selected.value
    const result = await change('approve', () => waitlist.admit({ ids }), count => t('waitlist.approved', { count }))
    if (result !== undefined) selected.value = []
  }

  async function approveNext() {
    const count = Math.min(WAVE_MAX, Math.max(1, Math.trunc(Number(next.value)) || 0))
    await change('next', () => waitlist.admit({ next: count }), admitted => t('waitlist.approved', { count: admitted }))
  }

  async function decline(abuse: boolean) {
    if (!selected.value.length) return
    const ids = selected.value
    if (!(await confirmed(t(abuse ? 'waitlist.abuseConfirm' : 'waitlist.declineConfirm', { count: ids.length })))) return
    const result = await change(abuse ? 'abuse' : 'decline', () => waitlist.decline(ids, { abuse }), count => t('waitlist.declined', { count }))
    if (result !== undefined) selected.value = []
  }

  async function saveNote(entryId: string, text: string) {
    await change(`note:${entryId}`, () => waitlist.note(entryId, text))
  }

  async function loadCaps() {
    caps.value = await waitlist.caps().catch(() => null)
  }

  return {
    id,
    t,
    errorMessage,
    waitlist,
    data: computed(() => waitlist.console.value ?? null),
    entries,
    questions,
    message,
    running,
    busy,
    confirmation,
    statusName: (status: WaitlistStatus) => t(`waitlist.statuses.${status}`),
    date: (at: number) => formatBillingDate(at, { dateStyle: 'medium' }, locale.value),
    answersText: (entry: WaitlistEntryRow) => Object.entries(entry.answers).map(([question, answer]) => `${question}: ${answer}`).join(', '),
    filter,
    applyFilter,
    clearFilter,
    selected,
    allSelected,
    toggleAll,
    toggle,
    next,
    waveMax: WAVE_MAX,
    approve,
    approveNext,
    decline,
    saveNote,
    caps,
    loadCaps,
    statuses: ['waiting', 'admitted', 'declined', 'joined'] as const,
  }
}

/** The Waitlist tab's state, as its parts take it. */
export type WaitlistTab = ReturnType<typeof useWaitlistTab>
