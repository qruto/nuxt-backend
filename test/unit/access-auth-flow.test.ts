import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CanSignIn } from '../../src/convex/client/auth-types'
import type { AccessGate, AccessPhase, AccessTicket, InviteStatus, WaitlistRecord } from '../../src/convex/access-tickets'
import { authFlow, wrong } from '../helpers/auth-flow'

// The launch phase on real Better Auth routes, through a gate that answers
// from memory as the component would (test/convex-component/access.test.ts
// holds the component's own answers). Existing accounts always sign in; a
// new address in a closed phase gets its code like anyone, learns it needs a
// ticket only once that code checks, and can send the same code again with
// an invite code; the account's creation takes the ticket and records it.

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

interface Invite { status: InviteStatus, uses: number, maxUses: number }

/** A gate over a phase, address tickets and codes kept in memory. */
function memoryGate(phase: AccessPhase) {
  const state = {
    phase,
    held: new Map<string, AccessTicket>(),
    invites: new Map<string, Invite>(),
    ledger: [] as Array<{ email: string, userId?: string, ticket: AccessTicket }>,
    waitlisted: new Map<string, WaitlistRecord>(),
  }
  const inviteStatus = (code?: string): InviteStatus | null => {
    if (!code) return null
    const invite = state.invites.get(code)
    if (!invite) return 'unknown'
    return invite.uses >= invite.maxUses ? 'used-up' : invite.status
  }
  const gate: AccessGate = {
    admission: async (_ctx, { email, code }) => {
      const invite = inviteStatus(code)
      const ticket = email.endsWith('@team.example') ? 'domain' : state.held.get(email) ?? (invite === 'valid' ? 'invite-code' : null)
      return { phase: state.phase, ticket, invite }
    },
    redeem: async (_ctx, { email, code, ticket }) => {
      if (ticket === 'invite-code') {
        const invite = state.invites.get(code ?? '')
        if (!invite || invite.uses >= invite.maxUses) return { refused: inviteStatus(code) ?? 'unknown' }
        invite.uses++
      }
      state.ledger.push({ email, ticket })
      return { ticket }
    },
    attach: async (_ctx, { email, userId }) => {
      const row = state.ledger.find(entry => entry.email === email && !entry.userId)
      if (!row) return null
      row.userId = userId
      return { ticket: row.ticket }
    },
    // What the component's `waitlist.verify` answers: the first check makes the entry, a later one finds it.
    waitlist: async (_ctx, { email }) => {
      const found = state.waitlisted.get(email)
      if (found) return { ...found, created: false }
      const entry: WaitlistRecord = { id: `entry_${state.waitlisted.size + 1}`, created: true, position: state.waitlisted.size + 1, total: state.waitlisted.size + 1, token: `entry_${state.waitlisted.size + 1}.signature`, source: 'sign-in', referred: false, news: false }
      state.waitlisted.set(email, entry)
      return entry
    },
  }
  return { gate, state }
}

async function launch(phase: AccessPhase, options: { canSignIn?: CanSignIn } = {}) {
  const { gate, state } = memoryGate(phase)
  const audit = { recordBackendEvent: vi.fn(async () => ({ id: 'event_1', deliveries: {} })) }
  const flow = await authFlow({ runtime: { access: gate, audit: audit as never, ...(options.canSignIn ? { canSignIn: options.canSignIn } : {}) } })
  return { ...flow, state, audit }
}

const body = async (response: Response) => ({ status: response.status, ...await response.json() as Record<string, unknown> })

describe('a closed phase', () => {
  it('sends a new address its code, then asks for a ticket once the code checks, leaving the code unused', async () => {
    const flow = await launch('invite-only')
    const { response, code } = await flow.sendCode('new@resend.dev')
    expect(response.status).toBe(200)
    expect(code).toBeDefined()
    const refused = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code })
    expect(await body(refused)).toMatchObject({ status: 403, code: 'forbidden', reason: 'ticket_required', phase: 'invite-only' })
    expect(flow.db.user).toHaveLength(0)
    // The same code again, with an invite code: the account is made, and the code is used.
    flow.state.invites.set('7KQ2M-XW9PA', { status: 'valid', uses: 0, maxUses: 1 })
    const admitted = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code, inviteCode: '7KQ2M-XW9PA' })
    expect(admitted.status).toBe(200)
    expect(flow.db.user).toHaveLength(1)
    expect(flow.state.invites.get('7KQ2M-XW9PA')!.uses).toBe(1)
    expect(flow.state.ledger).toEqual([{ email: 'new@resend.dev', ticket: 'invite-code', userId: (flow.db.user![0] as { id: string }).id }])
    expect(flow.audit.recordBackendEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'access.ticket_used', data: { ticket: 'invite-code' } }))
  })

  it('answers a wrong code the same for a new address as for anyone: the route refuses it', async () => {
    const flow = await launch('invite-only')
    const { code } = await flow.sendCode('new@resend.dev')
    const response = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: wrong(code) })
    expect(await body(response)).toMatchObject({ status: 400, code: 'INVALID_OTP' })
  })

  it('says how a dead invite code checked', async () => {
    const flow = await launch('early-access')
    flow.state.invites.set('USED', { status: 'valid', uses: 1, maxUses: 1 })
    const { code } = await flow.sendCode('new@resend.dev')
    const response = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code, inviteCode: 'USED' })
    expect(await body(response)).toMatchObject({ status: 403, reason: 'ticket_required', phase: 'early-access', invite: 'used-up' })
  })

  it('admits an address that holds a ticket of its own, and an allowed domain, without a code', async () => {
    const flow = await launch('invite-only')
    flow.state.held.set('invited@resend.dev', 'workspace-invitation')
    expect((await flow.signInWithCode('invited@resend.dev', 'Invited')).response.status).toBe(200)
    expect((await flow.signInWithCode('ada@team.example', 'Ada')).response.status).toBe(200)
    expect(flow.state.ledger.map(row => row.ticket)).toEqual(['workspace-invitation', 'domain'])
  })

  it('refuses an account made outside a request without a ticket: the origin is unknown, so it fails closed', async () => {
    const flow = await launch('invite-only')
    await expect(flow.signedIn('ada@resend.dev')).rejects.toMatchObject({ body: expect.objectContaining({ reason: 'ticket_required' }) })
  })

  it('always signs an existing account in', async () => {
    const flow = await launch('invite-only')
    // Made outside a request: the domain admits it, as a server-made account needs a ticket too.
    await flow.signedIn('ada@team.example')
    const { response } = await flow.signInWithCode('ada@team.example')
    expect(response.status).toBe(200)
  })

  it('spends the sign-up budget for a new address\'s code, and the shared one for an existing account\'s', async () => {
    const flow = await launch('invite-only')
    await flow.sendCode('new@resend.dev')
    expect(flow.limiter.total('signUpOtpGlobal')).toBe(1)
    expect(flow.limiter.total('emailOtpGlobal')).toBe(0)
    await flow.signedIn('ada@team.example')
    await flow.sendCode('ada@team.example')
    expect(flow.limiter.total('emailOtpGlobal')).toBe(1)
  })

  it('hands canSignIn the ticket at user-create, after the phase let the address in', async () => {
    const canSignIn = vi.fn(async () => true as const)
    const flow = await launch('invite-only', { canSignIn })
    flow.state.held.set('invited@resend.dev', 'invitation')
    await flow.signInWithCode('invited@resend.dev', 'Invited')
    expect(canSignIn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ purpose: 'user-create', ticket: 'invitation' }))
  })

  it('takes no ticket when canSignIn refuses', async () => {
    const flow = await launch('invite-only', { canSignIn: async (_ctx, { purpose }) => purpose !== 'user-create' || { allowed: false } })
    flow.state.invites.set('CODE1', { status: 'valid', uses: 0, maxUses: 1 })
    const { code } = await flow.sendCode('new@resend.dev')
    const response = await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code, inviteCode: 'CODE1' })
    expect(await body(response)).toMatchObject({ status: 403, reason: 'sign_in_refused' })
    expect(flow.state.invites.get('CODE1')!.uses).toBe(0)
  })
})

describe('early access', () => {
  it('records the waitlist entry once the code checks, shows its place, sends the confirmation once and leaves the code unused', async () => {
    vi.stubEnv('SITE_URL', 'https://panels.example')
    const flow = await launch('early-access')
    const { code } = await flow.sendCode('new@resend.dev')
    expect(flow.state.waitlisted.size).toBe(0)
    const refused = await body(await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code }))
    expect(refused).toMatchObject({ status: 403, reason: 'ticket_required', phase: 'early-access', waitlist: { position: 1, total: 1, token: 'entry_1.signature' } })
    expect(flow.db.user).toHaveLength(0)
    const confirmations = flow.sent.filter(entry => entry.name === 'waitlistConfirmation')
    expect(confirmations).toHaveLength(1)
    expect(confirmations[0]!.data).toEqual({ email: 'new@resend.dev', statusUrl: 'https://panels.example/waitlist#entry_1.signature', position: 1, total: 1 })
    expect(flow.audit.recordBackendEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'waitlist.joined', data: { source: 'sign-in', referred: false, news: false } }))
    // The same code again finds the entry: no second confirmation, no second event.
    await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code })
    expect(flow.sent.filter(entry => entry.name === 'waitlistConfirmation')).toHaveLength(1)
    expect((flow.audit.recordBackendEvent.mock.calls as unknown as Array<[unknown, { type: string }]>).filter(([, event]) => event.type === 'waitlist.joined')).toHaveLength(1)
  })

  it('records nothing for a wrong code, for an address that holds a ticket, or in invite-only', async () => {
    const early = await launch('early-access')
    const { code } = await early.sendCode('new@resend.dev')
    await early.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: wrong(code) })
    expect(early.state.waitlisted.size).toBe(0)
    early.state.held.set('invited@resend.dev', 'invitation')
    expect((await early.signInWithCode('invited@resend.dev', 'Invited')).response.status).toBe(200)
    expect(early.state.waitlisted.size).toBe(0)
    const closed = await launch('invite-only')
    const second = await closed.sendCode('new@resend.dev')
    await closed.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: second.code })
    expect(closed.state.waitlisted.size).toBe(0)
  })

  it('keeps the entry when the confirmation cannot be sent', async () => {
    vi.stubEnv('SITE_URL', '')
    const flow = await launch('early-access')
    const { code } = await flow.sendCode('new@resend.dev')
    const refused = await body(await flow.post('/sign-in/email-otp', { email: 'new@resend.dev', otp: code }))
    expect(refused).toMatchObject({ status: 403, reason: 'ticket_required', waitlist: { position: 1 } })
    expect(flow.state.waitlisted.size).toBe(1)
    expect(flow.sent.filter(entry => entry.name === 'waitlistConfirmation')).toHaveLength(0)
  })
})

describe('the public phase', () => {
  it('signs a new address up with no ticket, and records none', async () => {
    const flow = await launch('public')
    const { response } = await flow.signInWithCode('new@resend.dev', 'New')
    expect(response.status).toBe(200)
    expect(flow.state.ledger).toEqual([])
    expect(flow.audit.recordBackendEvent).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'access.ticket_used' }))
  })
})
