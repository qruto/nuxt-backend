import { inject, provide, type InjectionKey } from 'vue'
import type { AuditEntry, AuditParty, UseAuditLogReturn } from '../../composables/use-audit-log'
import { valueLabel, type BackendLabels, type LabelKey, type UseLabelsReturn } from '../../composables/use-labels'

export interface AuditLogSlotContext {
  log: UseAuditLogReturn
  /** The page of events in view (empty while loading or when there are none). */
  items: AuditEntry[]
  isLoading: boolean
  error: string | null
}

/** `<AuditLog>`'s slots, one per region; each receives {@link AuditLogSlotContext}. */
export interface AuditLogSlots {
  /** Above the list: replaces the heading. */
  header: (context: AuditLogSlotContext) => unknown
  /** While the first page loads. */
  loading: (context: AuditLogSlotContext) => unknown
  /** When nothing was recorded. */
  empty: (context: AuditLogSlotContext) => unknown
  /** One event, with the event and its sentence. */
  event: (context: AuditLogSlotContext & { event: AuditEntry, text: string, details: string[] }) => unknown
  /** The newer and older buttons. */
  pager: (context: AuditLogSlotContext) => unknown
  /** Why the activity could not be read. */
  error: (context: AuditLogSlotContext) => unknown
  /** Below everything. */
  footer: (context: AuditLogSlotContext) => unknown
}

type AuditKey = LabelKey<BackendLabels['audit']>

/** A marker that cannot appear in a label: it finds which names a sentence mentions. */
const MARK = '\u0002'

/** The label key of a sign-in method: `email-otp` is `emailOtp`. */
const methodKey = (method: string) => method.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())

/**
 * An event's sentence and the details it leaves out, in the reader's
 * words: who acted first, then the account it is about, the workspace, the
 * sign-in method, an administrator acting for the account.
 *
 * @internal
 */
export function describeAuditEvent(labels: UseLabelsReturn<'audit'>, event: AuditEntry): { text: string, details: string[] } {
  const { t } = labels
  /** Someone an entry names, as a word of the sentence: capitalized as its actor, lower-case inside it. */
  const word = (party: AuditParty, group: 'actors' | 'subjects') =>
    party.kind === 'user' ? party.name ?? t(`${group}.unknown` as AuditKey) : t(`${group}.${party.kind}` as AuditKey)
  /** A role, by its label, or as it came: a role of the app's own. */
  const roleWord = (role: string) => role.split(',').map(part => valueLabel(labels, 'audit', 'roles', part.trim())).join(', ')
  const typeKey = `events.${event.type}` as AuditKey
  const key: AuditKey = t(typeKey) === `audit.${typeKey}` ? 'other' : typeKey
  const role = typeof event.data.role === 'string' ? roleWord(event.data.role) : ''
  const subject = event.subject ? word(event.subject, 'subjects') : t('subjects.unknown')
  const workspace = event.workspace?.name ?? t('unnamedWorkspace')
  const flag = typeof event.data.flag === 'string' ? event.data.flag : ''
  // An experiment's exposure: the flag's key and the version shown.
  const experiment = typeof event.data.experiment === 'string' ? event.data.experiment : ''
  const variant = typeof event.data.variant === 'string' ? event.data.variant : ''
  const params = { actor: word(event.actor, 'actors'), subject, workspace, role, flag, experiment, variant, type: event.type }
  // Which names the sentence holds, in whatever language it is in.
  const probe = t(key, { actor: `${MARK}a`, subject: `${MARK}s`, workspace: `${MARK}w`, role: `${MARK}r`, flag, experiment, variant, type: event.type })
  const details: string[] = []
  const aboutSomeoneElse = event.subject && (event.subject.kind !== event.actor.kind || event.subject.id !== event.actor.id)
  if (aboutSomeoneElse && !probe.includes(`${MARK}s`)) details.push(t('forSubject', { subject }))
  if (event.workspace && !probe.includes(`${MARK}w`)) details.push(t('inWorkspace', { workspace }))
  if (typeof event.data.method === 'string') details.push(t('withMethod', { method: valueLabel(labels, 'audit', 'methods', methodKey(event.data.method)) }))
  if (event.impersonated) details.push(t('impersonated'))
  return { text: t(key, params), details }
}

const AUDIT_LABELS: InjectionKey<UseLabelsReturn<'audit'>> = Symbol('nuxt-backend:audit')

/** @internal */
export function provideAuditLabels(labels: UseLabelsReturn<'audit'>): void {
  provide(AUDIT_LABELS, labels)
}

/** The labels of the `<AuditLog>` around a part, else the app's. @internal */
export function useAuditLabels(): UseLabelsReturn<'audit'> | null {
  return inject(AUDIT_LABELS, null)
}
