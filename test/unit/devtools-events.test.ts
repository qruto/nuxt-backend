import { describe, expect, it } from 'vitest'
import { createBackendDevtoolsBridge } from '../../src/runtime/devtools/bridge'
import { diffSection } from '../../src/runtime/devtools/events'
import type { BackendDevtoolsSnapshot } from '../../src/runtime/devtools/types'

const empty = createBackendDevtoolsBridge().getSnapshot()
const snapshot = (patch: Partial<BackendDevtoolsSnapshot>): BackendDevtoolsSnapshot => ({ ...empty, ...patch })

describe('activity: auth', () => {
  const signedIn = snapshot({ identity: { available: true, isLoading: false, isAuthenticated: true, email: 'ada@example.com', id: 'u1' } })
  const signedOut = snapshot({ identity: { available: true, isLoading: false, isAuthenticated: false } })

  it('records a sign-in, a sign-out and an account switch', () => {
    expect(diffSection('identity', signedOut, signedIn)).toEqual([{ kind: 'auth', level: 'info', title: 'Signed in', detail: 'ada@example.com' }])
    expect(diffSection('identity', signedIn, signedOut)).toEqual([{ kind: 'auth', level: 'info', title: 'Signed out', detail: 'ada@example.com' }])
    const other = snapshot({ identity: { available: true, isLoading: false, isAuthenticated: true, email: 'bob@example.com', id: 'u2' } })
    expect(diffSection('identity', signedIn, other)).toEqual([{ kind: 'auth', level: 'info', title: 'Switched account', detail: 'ada@example.com → bob@example.com' }])
  })

  it('stays quiet while the session loads, or before there is one to watch', () => {
    const loading = snapshot({ identity: { available: true, isLoading: true } })
    expect(diffSection('identity', loading, signedIn)).toEqual([])
    expect(diffSection('identity', signedOut, loading)).toEqual([])
    expect(diffSection('identity', snapshot({ identity: { available: false } }), signedIn)).toEqual([])
  })

  it('names an account by its id when it has no email', () => {
    const byId = (id: string) => snapshot({ identity: { available: true, isLoading: false, isAuthenticated: true, id } })
    expect(diffSection('identity', signedOut, byId('u1'))).toEqual([{ kind: 'auth', level: 'info', title: 'Signed in', detail: 'u1' }])
    expect(diffSection('identity', byId('u1'), byId('u2'))).toEqual([{ kind: 'auth', level: 'info', title: 'Switched account', detail: 'u1 → u2' }])
    expect(diffSection('identity', byId('u1'), byId('u1'))).toEqual([])
  })
})

describe('activity: workspace', () => {
  const acme = snapshot({ workspace: { available: true, id: 'w1', name: 'Acme', role: 'owner', workspaces: 2, members: 3, pendingInvitations: 1 } })

  it('records a switch, and a role or membership change inside the same workspace', () => {
    const globex = snapshot({ workspace: { ...acme.workspace, id: 'w2', name: 'Globex' } })
    expect(diffSection('workspace', acme, globex)).toEqual([{ kind: 'workspace', level: 'info', title: 'Switched workspace', detail: 'Acme → Globex' }])
    const changed = snapshot({ workspace: { ...acme.workspace, role: 'member', members: 4, pendingInvitations: 0 } })
    expect(diffSection('workspace', acme, changed)).toEqual([
      { kind: 'workspace', level: 'info', title: 'Role changed', detail: 'owner → member' },
      { kind: 'workspace', level: 'info', title: 'Members changed', detail: '3 → 4' },
      { kind: 'workspace', level: 'info', title: 'Pending invitations changed', detail: '1 → 0' },
    ])
  })

  it('stays quiet while a workspace appears or goes away (loading and signing out look the same)', () => {
    const none = snapshot({ workspace: { available: false } })
    expect(diffSection('workspace', none, acme)).toEqual([])
    expect(diffSection('workspace', acme, none)).toEqual([])
  })
})

describe('activity: billing and features', () => {
  const active = snapshot({ billing: { isLoading: false, status: 'active', productId: 'p1', productName: 'Pro', cancelAtPeriodEnd: false, isPaused: false } })

  it('flags a subscription that needs attention', () => {
    const pastDue = snapshot({ billing: { ...active.billing, status: 'past_due' } })
    expect(diffSection('billing', active, pastDue)).toEqual([{ kind: 'billing', level: 'warn', title: 'Subscription past due', detail: 'active → past_due' }])
  })

  it('records a plan change, a scheduled cancellation and a pause', () => {
    const changed = snapshot({ billing: { ...active.billing, productId: 'p2', productName: 'Team', cancelAtPeriodEnd: true, isPaused: true } })
    expect(diffSection('billing', active, changed).map(event => event.title)).toEqual([
      'Plan changed',
      'Set to cancel at period end',
      'Subscription paused',
    ])
  })

  it('records a subscription ending, a cancellation withdrawn, a resume and a scheduled plan change', () => {
    const scheduled = snapshot({ billing: { ...active.billing, cancelAtPeriodEnd: true, isPaused: true } })
    const after = snapshot({ billing: { ...active.billing, status: undefined, productId: undefined, productName: undefined, pendingProductId: 'p3' } })
    expect(diffSection('billing', scheduled, after)).toEqual([
      { kind: 'billing', level: 'info', title: 'Subscription ended', detail: 'active → —' },
      { kind: 'billing', level: 'info', title: 'Cancellation withdrawn' },
      { kind: 'billing', level: 'info', title: 'Subscription resumed' },
      { kind: 'billing', level: 'info', title: 'Plan change scheduled', detail: 'p3' },
    ])
  })

  it('names plans by id when they have no name, and stays quiet while loading', () => {
    const p1 = snapshot({ billing: { isLoading: false, status: 'trialing', productId: 'p1', cancelAtPeriodEnd: false, isPaused: false } })
    const p2 = snapshot({ billing: { ...p1.billing, productId: 'p2' } })
    expect(diffSection('billing', p1, p2)).toEqual([{ kind: 'billing', level: 'info', title: 'Plan changed', detail: 'p1 → p2' }])
    expect(diffSection('billing', p1, snapshot({ billing: { ...p2.billing, isLoading: true } }))).toEqual([])
    expect(diffSection('entitlements', snapshot({ entitlements: { isLoading: true, features: [], plans: [] } }), snapshot({ entitlements: { isLoading: false, features: ['x'], plans: [] } }))).toEqual([])
  })

  it('names the features granted and removed', () => {
    const before = snapshot({ entitlements: { isLoading: false, features: ['export', 'sso'], plans: [] } })
    const after = snapshot({ entitlements: { isLoading: false, features: ['export', 'audit-log'], plans: [] } })
    expect(diffSection('entitlements', before, after)).toEqual([
      { kind: 'features', level: 'info', title: 'Feature granted', detail: 'audit-log' },
      { kind: 'features', level: 'warn', title: 'Feature removed', detail: 'sso' },
    ])
  })
})

describe('activity: credits, webhooks, email, connection', () => {
  it('records a balance change per meter, and warns when one runs out', () => {
    const before = snapshot({ credits: [{ meterId: 'm1', name: 'AI credits', balance: 30, credited: 100, consumed: 70 }] })
    const after = snapshot({ credits: [{ meterId: 'm1', name: 'AI credits', balance: 0, credited: 100, consumed: 100 }, { meterId: 'm2', balance: 5, credited: 5, consumed: 0 }] })
    expect(diffSection('credits', before, after)).toEqual([
      { kind: 'credits', level: 'warn', title: 'Credits spent', detail: 'AI credits: 30 → 0 (-30)' },
    ])
  })

  it('records credits added, names a meter by id, and skips a meter seen for the first time', () => {
    const before = snapshot({ credits: [{ meterId: 'm1', balance: 5, credited: 5, consumed: 0 }] })
    const after = snapshot({ credits: [{ meterId: 'm1', balance: 55, credited: 55, consumed: 0 }, { meterId: 'm2', balance: 1, credited: 1, consumed: 0 }] })
    expect(diffSection('credits', before, after)).toEqual([{ kind: 'credits', level: 'info', title: 'Credits added', detail: 'm1: 5 → 55 (+50)' }])
    expect(diffSection('credits', after, after)).toEqual([])
  })

  it('tells a duplicate and an unknown event type apart from a refusal', () => {
    const after = snapshot({ webhooks: [
      { service: 'email', deliveryId: 'd5', type: 'contact.created', outcome: 'unknown_type', receivedAt: 5 },
      { service: 'billing', deliveryId: 'd4', type: 'order.paid', outcome: 'duplicate', note: 'seen before', receivedAt: 4 },
    ] })
    expect(diffSection('webhooks', snapshot({ webhooks: [] }), after)).toEqual([
      { kind: 'webhook', level: 'info', title: 'Webhook already handled', detail: 'billing · order.paid · seen before' },
      { kind: 'webhook', level: 'warn', title: 'Webhook of an unknown type', detail: 'email · contact.created' },
    ])
  })

  it('records new deliveries oldest first, refusals as errors', () => {
    const old = { service: 'billing', deliveryId: 'd1', type: 'order.paid', outcome: 'ok', receivedAt: 1 }
    const before = snapshot({ webhooks: [old] })
    const after = snapshot({ webhooks: [
      { service: 'email', deliveryId: 'd3', outcome: 'invalid_signature', receivedAt: 3 },
      { service: 'billing', deliveryId: 'd2', type: 'subscription.updated', outcome: 'ok', receivedAt: 2 },
      old,
    ] })
    expect(diffSection('webhooks', before, after)).toEqual([
      { kind: 'webhook', level: 'info', title: 'Webhook handled', detail: 'billing · subscription.updated' },
      { kind: 'webhook', level: 'error', title: 'Webhook refused: invalid signature', detail: 'email' },
    ])
  })

  it('follows one email\'s delivery status', () => {
    const sent = snapshot({ emailLookup: { emailId: 'e1', isLoading: false, found: true, status: 'sent' } })
    const bounced = snapshot({ emailLookup: { emailId: 'e1', isLoading: false, found: true, status: 'bounced' } })
    expect(diffSection('emailLookup', sent, bounced)).toEqual([{ kind: 'email', level: 'error', title: 'Email bounced', detail: 'e1: sent → bounced' }])
    const other = snapshot({ emailLookup: { emailId: 'e2', isLoading: false, found: true, status: 'delivered' } })
    expect(diffSection('emailLookup', sent, other)).toEqual([])
  })

  it('rates each email status: delivered is fine, a delay needs attention, a failure is broken', () => {
    const lookup = (status?: string) => snapshot({ emailLookup: { emailId: 'e1', isLoading: false, found: true, status } })
    expect(diffSection('emailLookup', lookup('sent'), lookup('delivered'))).toEqual([{ kind: 'email', level: 'info', title: 'Email delivered', detail: 'e1: sent → delivered' }])
    expect(diffSection('emailLookup', lookup('sent'), lookup('delivery_delayed'))[0]).toMatchObject({ level: 'warn', title: 'Email delivery delayed' })
    expect(diffSection('emailLookup', lookup('sent'), lookup('failed'))[0]).toMatchObject({ level: 'error', title: 'Email failed' })
    expect(diffSection('emailLookup', lookup(), lookup('sent'))).toEqual([])
    expect(diffSection('emailLookup', snapshot({}), lookup('sent'))).toEqual([])
  })

  it('stays quiet about the first connection', () => {
    expect(diffSection('connection', snapshot({ connection: 'idle' }), snapshot({ connection: 'connected' }))).toEqual([])
  })

  it('records the connection dropping and coming back', () => {
    expect(diffSection('connection', snapshot({ connection: 'connected' }), snapshot({ connection: 'reconnecting' })))
      .toEqual([{ kind: 'connection', level: 'warn', title: 'Connection lost, reconnecting' }])
    expect(diffSection('connection', snapshot({ connection: 'reconnecting' }), snapshot({ connection: 'connected' })))
      .toEqual([{ kind: 'connection', level: 'info', title: 'Reconnected' }])
    expect(diffSection('connection', snapshot({ connection: 'connected' }), snapshot({ connection: 'closed' })))
      .toEqual([{ kind: 'connection', level: 'error', title: 'Connection closed' }])
    expect(diffSection('connection', snapshot({ connection: 'connected' }), snapshot({ connection: 'idle' }))).toEqual([])
  })

  it('has nothing to say about the sections that are not activity', () => {
    expect(diffSection('config', empty, snapshot({ config: { brand: { name: 'Acme' }, plans: ['pro'], packs: [] } }))).toEqual([])
  })
})
