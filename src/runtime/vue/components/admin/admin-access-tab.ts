import { computed, ref, useId } from 'vue'
import type { AccessPhase, InviteKind, InviteStatus } from '../../../../convex/access-tickets'
import type { AdmitResult } from '../../../../convex/integrations/launch'
import { formatBillingDate } from '../../composables/billing-format'
import { useAccessAdmin } from '../../composables/use-access'
import { useBackendPagePath } from '../../composables/use-backend-page-path'
import type { BackendLabels, LabelKey } from '../../composables/use-labels'
import { useAdminChanges } from '../../utils/admin-changes'
import type { ConfirmFn } from '../../utils/confirmation'

// The Access tab's state and actions, headless: `AdminAccess.vue` and its
// parts (the phase, the codes and links, the invitations by address) render
// it. Every change runs one at a time behind a recent sign-in, its outcome in
// the tab's message.

type AdminKey = LabelKey<BackendLabels['admin']>

const PHASE_KEYS: Record<AccessPhase, AdminKey> = {
  'early-access': 'access.phases.earlyAccess',
  'invite-only': 'access.phases.inviteOnly',
  'public': 'access.phases.public',
}
const STATUS_KEYS: Record<InviteStatus, AdminKey> = {
  'valid': 'access.statuses.valid',
  'expired': 'access.statuses.expired',
  'used-up': 'access.statuses.usedUp',
  'revoked': 'access.statuses.revoked',
  'unknown': 'access.statuses.unknown',
}

/** Split a pasted list: one address per line, or comma- or semicolon-separated. */
const pasted = (text: string): string[] => text.split(/[\n,;]/).map(entry => entry.trim()).filter(Boolean)

/**
 * The Access tab, as state and actions. `confirm` asks before the phase
 * moves or something is revoked (the app's, read when asking; default: the tab's `<ConfirmDialog>`).
 *
 * @internal
 */
export function useAccessTab(confirm?: () => ConfirmFn | undefined) {
  const access = useAccessAdmin()
  const { t, errorMessage, locale, message, running, confirmation, confirmed, change, busy } = useAdminChanges(confirm)
  const invitePath = useBackendPagePath('invite')
  const id = useId()

  const phaseName = (phase: AccessPhase) => t(PHASE_KEYS[phase])

  async function movePhase(phase: AccessPhase) {
    if (!(await confirmed(t('access.phaseConfirm', { phase: phaseName(phase) })))) return
    await change(`phase:${phase}`, () => access.setPhase(phase))
  }

  // A new code or link: its fields, and the one shown once after it was made.
  const form = { kind: ref<InviteKind>('code'), label: ref(''), maxUses: ref('1'), expires: ref('') }
  const shown = ref<{ kind: InviteKind, text: string } | null>(null)
  const copied = ref(false)

  async function create() {
    const kind = form.kind.value
    const expiresAt = form.expires.value ? new Date(`${form.expires.value}T23:59:59`).getTime() : undefined
    const made = await change('create', () => access.createInvite({ kind, label: form.label.value, maxUses: Number(form.maxUses.value), ...(expiresAt ? { expiresAt } : {}) }))
    if (!made) return
    const origin = typeof window === 'undefined' ? '' : window.location.origin
    shown.value = { kind, text: kind === 'link' ? `${origin}${invitePath.value}#${made.code}` : made.code }
    copied.value = false
    form.label.value = ''
  }

  async function copy() {
    if (!shown.value) return
    try {
      await navigator.clipboard.writeText(shown.value.text)
      copied.value = true
    }
    catch {
      copied.value = false
    }
  }

  async function revoke(target: { id: string, label: string }) {
    if (!(await confirmed(t('access.revokeConfirm', { label: target.label })))) return
    await change(`revoke:${target.id}`, () => access.revoke(target.id))
  }

  // Invitations by address: a pasted list.
  const admitForm = { emails: ref(''), label: ref(''), email: ref(false) }
  const skipped = ref<AdmitResult['skipped']>([])

  async function admit() {
    const result = await change('admit', () => access.admit(pasted(admitForm.emails.value), admitForm.label.value, { email: admitForm.email.value }), done => t('access.admitted', { count: done.admitted.length }))
    if (!result) return
    skipped.value = result.skipped
    admitForm.emails.value = ''
    admitForm.email.value = false
  }

  return {
    id,
    t,
    errorMessage,
    access,
    data: computed(() => access.console.value ?? null),
    message,
    running,
    busy,
    confirmation,
    phaseName,
    statusName: (status: InviteStatus) => t(STATUS_KEYS[status]),
    date: (at: number | null) => (at === null ? t('access.noExpiry') : formatBillingDate(at, { dateStyle: 'medium' }, locale.value)),
    movePhase,
    form,
    shown,
    copied,
    create,
    copy,
    revoke,
    admitForm,
    skipped,
    admit,
  }
}

/** The Access tab's state, as its parts take it. */
export type AccessTab = ReturnType<typeof useAccessTab>
