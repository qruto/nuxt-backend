import type {
  BackendDevtoolsSnapshot,
  DevtoolsActivityEvent,
  DevtoolsActivityLevel,
  DevtoolsPatchableSection,
  DevtoolsWebhookDeliverySnapshot,
} from './types'

/** An activity entry before the bridge stamps it with an id and a time. */
export type DevtoolsActivityDraft = Omit<DevtoolsActivityEvent, 'id' | 'at'>

/** Subscription states that need someone's attention. */
const TROUBLED_STATUSES = new Set(['past_due', 'unpaid', 'incomplete', 'incomplete_expired'])

const arrow = (from: string | number | undefined, to: string | number | undefined) => `${from ?? '—'} → ${to ?? '—'}`

function identityActivity(prev: BackendDevtoolsSnapshot['identity'], next: BackendDevtoolsSnapshot['identity']): DevtoolsActivityDraft[] {
  if (!prev.available || prev.isLoading || next.isLoading) return []
  if (!prev.isAuthenticated && next.isAuthenticated) return [{ kind: 'auth', level: 'info', title: 'Signed in', detail: next.email ?? next.id }]
  if (prev.isAuthenticated && !next.isAuthenticated) return [{ kind: 'auth', level: 'info', title: 'Signed out', detail: prev.email ?? prev.id }]
  if (prev.isAuthenticated && next.isAuthenticated && prev.id && next.id && prev.id !== next.id) {
    return [{ kind: 'auth', level: 'info', title: 'Switched account', detail: arrow(prev.email ?? prev.id, next.email ?? next.id) }]
  }
  return []
}

function workspaceActivity(prev: BackendDevtoolsSnapshot['workspace'], next: BackendDevtoolsSnapshot['workspace']): DevtoolsActivityDraft[] {
  // Appearing and disappearing is also what loading and signing out look
  // like; only changes inside a known workspace are told apart reliably.
  if (!prev.available || !next.available) return []
  if (prev.id !== next.id) return [{ kind: 'workspace', level: 'info', title: 'Switched workspace', detail: arrow(prev.name, next.name) }]
  const drafts: DevtoolsActivityDraft[] = []
  if (prev.role !== next.role) drafts.push({ kind: 'workspace', level: 'info', title: 'Role changed', detail: arrow(prev.role, next.role) })
  if (prev.members !== next.members) drafts.push({ kind: 'workspace', level: 'info', title: 'Members changed', detail: arrow(prev.members, next.members) })
  if (prev.pendingInvitations !== next.pendingInvitations) {
    drafts.push({ kind: 'workspace', level: 'info', title: 'Pending invitations changed', detail: arrow(prev.pendingInvitations, next.pendingInvitations) })
  }
  return drafts
}

/** The subscription's switches, and what turning each one on or off means. */
const BILLING_SWITCHES = [
  { key: 'cancelAtPeriodEnd', on: { level: 'warn', title: 'Set to cancel at period end' }, off: { level: 'info', title: 'Cancellation withdrawn' } },
  { key: 'isPaused', on: { level: 'warn', title: 'Subscription paused' }, off: { level: 'info', title: 'Subscription resumed' } },
] as const satisfies ReadonlyArray<{ key: keyof BackendDevtoolsSnapshot['billing'], on: Omit<DevtoolsActivityDraft, 'kind'>, off: Omit<DevtoolsActivityDraft, 'kind'> }>

function subscriptionActivity(prev: BackendDevtoolsSnapshot['billing'], next: BackendDevtoolsSnapshot['billing']): DevtoolsActivityDraft[] {
  const drafts: DevtoolsActivityDraft[] = []
  if (prev.status !== next.status) {
    const level: DevtoolsActivityLevel = next.status && TROUBLED_STATUSES.has(next.status) ? 'warn' : 'info'
    drafts.push({ kind: 'billing', level, title: next.status ? `Subscription ${next.status.replaceAll('_', ' ')}` : 'Subscription ended', detail: arrow(prev.status, next.status) })
  }
  if (prev.productId && next.productId && prev.productId !== next.productId) {
    drafts.push({ kind: 'billing', level: 'info', title: 'Plan changed', detail: arrow(prev.productName ?? prev.productId, next.productName ?? next.productId) })
  }
  return drafts
}

function billingActivity(prev: BackendDevtoolsSnapshot['billing'], next: BackendDevtoolsSnapshot['billing']): DevtoolsActivityDraft[] {
  if (prev.isLoading || next.isLoading) return []
  const drafts = subscriptionActivity(prev, next)
  for (const { key, on, off } of BILLING_SWITCHES) {
    if (prev[key] !== next[key]) drafts.push({ kind: 'billing', ...(next[key] ? on : off) })
  }
  if (!prev.pendingProductId && next.pendingProductId) drafts.push({ kind: 'billing', level: 'info', title: 'Plan change scheduled', detail: next.pendingProductId })
  return drafts
}

function featuresActivity(prev: BackendDevtoolsSnapshot['entitlements'], next: BackendDevtoolsSnapshot['entitlements']): DevtoolsActivityDraft[] {
  if (prev.isLoading || next.isLoading) return []
  const before = new Set(prev.features)
  const after = new Set(next.features)
  return [
    ...next.features.filter(key => !before.has(key)).map((key): DevtoolsActivityDraft => ({ kind: 'features', level: 'info', title: 'Feature granted', detail: key })),
    ...prev.features.filter(key => !after.has(key)).map((key): DevtoolsActivityDraft => ({ kind: 'features', level: 'warn', title: 'Feature removed', detail: key })),
  ]
}

function creditsActivity(prev: BackendDevtoolsSnapshot['credits'], next: BackendDevtoolsSnapshot['credits']): DevtoolsActivityDraft[] {
  const previous = new Map(prev.map(meter => [meter.meterId, meter.balance]))
  return next.flatMap((meter): DevtoolsActivityDraft[] => {
    const before = previous.get(meter.meterId)
    // A meter seen for the first time is loading, not spending.
    if (before === undefined || before === meter.balance) return []
    const delta = meter.balance - before
    return [{
      kind: 'credits',
      level: meter.balance <= 0 ? 'warn' : 'info',
      title: delta < 0 ? 'Credits spent' : 'Credits added',
      detail: `${meter.name ?? meter.meterId}: ${arrow(before, meter.balance)} (${delta > 0 ? '+' : ''}${delta})`,
    }]
  })
}

function webhookDraft(delivery: DevtoolsWebhookDeliverySnapshot): DevtoolsActivityDraft {
  const detail = [delivery.service, delivery.type, delivery.note].filter(Boolean).join(' · ')
  if (delivery.outcome === 'ok') return { kind: 'webhook', level: 'info', title: 'Webhook handled', detail }
  if (delivery.outcome === 'duplicate') return { kind: 'webhook', level: 'info', title: 'Webhook already handled', detail }
  if (delivery.outcome === 'unknown_type') return { kind: 'webhook', level: 'warn', title: 'Webhook of an unknown type', detail }
  return { kind: 'webhook', level: 'error', title: `Webhook refused: ${delivery.outcome.replaceAll('_', ' ')}`, detail }
}

function webhooksActivity(prev: BackendDevtoolsSnapshot['webhooks'], next: BackendDevtoolsSnapshot['webhooks']): DevtoolsActivityDraft[] {
  const known = new Set(prev.map(delivery => `${delivery.service}:${delivery.deliveryId}:${delivery.receivedAt}`))
  // The feed is newest first; the log reads oldest first.
  return next
    .filter(delivery => !known.has(`${delivery.service}:${delivery.deliveryId}:${delivery.receivedAt}`))
    .reverse()
    .map(webhookDraft)
}

function emailActivity(prev: BackendDevtoolsSnapshot['emailLookup'], next: BackendDevtoolsSnapshot['emailLookup']): DevtoolsActivityDraft[] {
  if (!prev || !next || prev.emailId !== next.emailId || !prev.status || !next.status || prev.status === next.status) return []
  const level: DevtoolsActivityLevel = next.status === 'bounced' || next.status === 'failed'
    ? 'error'
    : next.status === 'delivery_delayed' ? 'warn' : 'info'
  return [{ kind: 'email', level, title: `Email ${next.status.replaceAll('_', ' ')}`, detail: `${next.emailId}: ${arrow(prev.status, next.status)}` }]
}

function connectionActivity(prev: BackendDevtoolsSnapshot['connection'], next: BackendDevtoolsSnapshot['connection']): DevtoolsActivityDraft[] {
  // Connecting the first time is how every page starts, not news.
  if (!prev || !next || prev === next || prev === 'idle') return []
  if (next === 'connected') return [{ kind: 'connection', level: 'info', title: 'Reconnected' }]
  if (next === 'reconnecting') return [{ kind: 'connection', level: 'warn', title: 'Connection lost, reconnecting' }]
  if (next === 'closed') return [{ kind: 'connection', level: 'error', title: 'Connection closed' }]
  return []
}

/**
 * What changed in one snapshot section, as activity entries. Pure, so the
 * rules are tested apart from Vue. The bridge calls it with the section's
 * last settled value and the new one, never with a loading one, and never
 * for the first: what was already true when the page opened (a session, a
 * subscription, past deliveries) is state, not activity.
 */
export function diffSection(key: DevtoolsPatchableSection, prev: BackendDevtoolsSnapshot, next: BackendDevtoolsSnapshot): DevtoolsActivityDraft[] {
  switch (key) {
    case 'identity': return identityActivity(prev.identity, next.identity)
    case 'workspace': return workspaceActivity(prev.workspace, next.workspace)
    case 'billing': return billingActivity(prev.billing, next.billing)
    case 'entitlements': return featuresActivity(prev.entitlements, next.entitlements)
    case 'credits': return creditsActivity(prev.credits, next.credits)
    case 'webhooks': return webhooksActivity(prev.webhooks, next.webhooks)
    case 'emailLookup': return emailActivity(prev.emailLookup, next.emailLookup)
    case 'connection': return connectionActivity(prev.connection, next.connection)
    default: return []
  }
}
