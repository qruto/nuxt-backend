import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { clearNuxtData } from '#app'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { useAccessAdmin, useAccessPhase, useInvite, useMemberTicket } from '../../src/runtime/vue/composables/use-access'
import { forgetInvite, keepInvite, keptInvite } from '../../src/runtime/vue/utils/kept-invite'

// The launch-access composables over the backend mock: the phase a page
// offers its sign-up by, an invite check with nothing to check and with no
// function to check it, and the Access tab's data without the functions it
// writes through.

// The page's address, read on the server or in the browser (see the helper).
const { requestURL, serverRequest } = await vi.hoisted(() => import('../helpers/request-url'))
mockNuxtImport('useRequestURL', original => opts => requestURL(original, opts))

enableAutoUnmount(afterEach)
beforeEach(() => {
  clearNuxtData()
  forgetInvite()
  serverRequest.current = null
})
afterEach(() => resetBackendMock())

/** Run a composable inside a page of the test's Nuxt app. */
async function inPage<T>(composable: () => T): Promise<T> {
  let result!: T
  await mountSuspended(defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  }))
  return result
}

describe('useAccessPhase', () => {
  it('reads the launch phase for anyone, signed in or not, and follows it live', async () => {
    const backend = createBackendMock({ queries: { 'access:getAccessPhase': { phase: 'invite-only' } } })
    const access = await inPage(() => useAccessPhase())
    await flushPromises()
    expect(access.phase.value).toBe('invite-only')
    expect(access.isPublic.value).toBe(false)
    expect(access.isLoading.value).toBe(false)

    backend.state.queries['access:getAccessPhase'] = { phase: 'public' }
    await flushPromises()
    expect(access.phase.value).toBe('public')
    expect(access.isPublic.value).toBe(true)
  })

  it('is loading, with no error, until the phase is read', async () => {
    const backend = createBackendMock()
    const access = await inPage(() => useAccessPhase())
    await flushPromises()
    expect([access.phase.value, access.isLoading.value, access.error.value]).toEqual([undefined, true, null])

    backend.state.queries['access:getAccessPhase'] = { phase: 'early-access' }
    await flushPromises()
    expect([access.phase.value, access.isLoading.value, access.error.value]).toEqual(['early-access', false, null])
  })

  it('says why the phase could not be read, never throwing, and is done loading', async () => {
    const backend = createBackendMock()
    backend.fail('access:getAccessPhase', backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    const access = await inPage(() => useAccessPhase())
    await flushPromises()
    expect(access.phase.value).toBeUndefined()
    expect(access.error.value).toMatchObject({ code: 'unavailable' })
    expect(access.isLoading.value).toBe(false)
  })

  it('reads an app without backend/access.ts as public', async () => {
    const backend = createBackendMock()
    const access = await inPage(() => useAccessPhase({ api: {} }))
    expect([access.phase.value, access.isPublic.value, access.isLoading.value, access.error.value]).toEqual(['public', true, false, null])
    expect(backend.calls).toEqual([])
  })
})

describe('useInvite', () => {
  it('answers `unknown` for nothing to check, without asking the backend', async () => {
    const backend = createBackendMock()
    const invite = await inPage(() => useInvite())
    expect(await invite.check('   ')).toBe('unknown')
    expect(invite.status.value).toBe('unknown')
    expect(invite.isKept.value).toBe(false)
    expect(backend.callsTo('access:checkInvite')).toEqual([])
  })

  it('checks the code this tab keeps when given none, and forgets it on request', async () => {
    const backend = createBackendMock()
    backend.stub('access:checkInvite', () => ({ status: 'valid' }))
    keepInvite('KEPT1-CODE2')
    const invite = await inPage(() => useInvite())
    expect(invite.isKept.value).toBe(true)
    expect(await invite.check()).toBe('valid')
    expect(backend.callsTo('access:checkInvite')).toEqual([{ code: 'KEPT1-CODE2' }])

    invite.forget()
    expect(invite.isKept.value).toBe(false)
    expect(keptInvite()).toBeNull()
  })

  it('keeps the code and says what is missing when the app exports no check', async () => {
    createBackendMock()
    const invite = await inPage(() => useInvite({ api: {} }))
    expect(await invite.check('7KQ2M-XW9PA')).toBeNull()
    expect(invite.error.value?.message).toContain('`checkInvite`')
    // Nothing answered that the code admits nobody: it stays for the sign-in.
    expect(keptInvite()).toBe('7KQ2M-XW9PA')
    expect(invite.isKept.value).toBe(true)
  })
})

describe('useAccessAdmin', () => {
  it('rejects each change the backend does not export, naming the function to re-export', async () => {
    createBackendMock({ user: { role: 'admin' } })
    const admin = await inPage(() => useAccessAdmin({ api: {} }))
    await expect(admin.setPhase('public')).rejects.toThrow('`setAccessPhase`')
    await expect(admin.createInvite({ kind: 'code', label: 'x', maxUses: 1 })).rejects.toThrow('`createInvite`')
    await expect(admin.revoke('i1')).rejects.toThrow('`revokeInvite`')
    await expect(admin.admit(['ada@example.org'])).rejects.toThrow('`admitEmails`')
    expect(admin.error.value?.message).toContain('`admitEmails`')
    // No read to wait for.
    expect(admin.isLoading.value).toBe(false)
  })

  it('waits on the session, then shows a visitor no console, no refusal and no error', async () => {
    const backend = createBackendMock({ isLoading: true })
    backend.state.queries['access:getAccessConsole'] = null
    const admin = await inPage(() => useAccessAdmin())
    expect(admin.console.value).toBeUndefined()
    expect(admin.isLoading.value).toBe(true)

    backend.state.isLoading = false
    await flushPromises()
    expect(admin.console.value).toBeNull()
    expect(admin.isLoading.value).toBe(false)
    expect(admin.isRefused.value).toBe(false)
    expect(admin.error.value).toBeNull()
  })
})

describe('useMemberTicket', () => {
  const issued = { state: 'issued' as const, token: '0123456789ABCDEFGHJKMNPQRS', uses: 3, left: 2, expiresAt: 1_900_000_000_000 }

  it('reads the ticket of the member and the link to share, on the invite page', async () => {
    createBackendMock({ user: { name: 'Ada' }, queries: { 'access:getMemberTicket': issued } })
    const ticket = await inPage(() => useMemberTicket())
    await flushPromises()
    expect(ticket.ticket.value).toEqual(issued)
    expect(ticket.link.value).toMatch(/\/invite#0123456789ABCDEFGHJKMNPQRS$/)
    expect([ticket.isLoading.value, ticket.error.value]).toEqual([false, null])
  })

  it('carries the member\'s referral code in the link\'s query, the token still in its fragment', async () => {
    createBackendMock({ user: { name: 'Ada' }, queries: { 'access:getMemberTicket': { ...issued, referral: 'ADA23456' } } })
    const ticket = await inPage(() => useMemberTicket())
    await flushPromises()
    expect(ticket.link.value).toBe(`${window.location.origin}/invite?ref=ADA23456#0123456789ABCDEFGHJKMNPQRS`)
  })

  it('builds the same link on the server as in the browser, so it hydrates unchanged', async () => {
    createBackendMock({ user: { name: 'Ada' }, queries: { 'access:getMemberTicket': { ...issued, referral: 'ADA23456' } } })
    const linked = async (request: typeof serverRequest.current) => {
      serverRequest.current = request
      const ticket = await inPage(() => useMemberTicket())
      serverRequest.current = null
      await flushPromises()
      return ticket.link.value
    }
    // The server behind a proxy, which forwards the host the browser asked for.
    const rendered = await linked({ path: '/invite', headers: { 'host': '127.0.0.1:3000', 'x-forwarded-host': window.location.host, 'x-forwarded-proto': window.location.protocol.slice(0, -1) } })
    expect(rendered).toBe(`${window.location.origin}/invite?ref=ADA23456#0123456789ABCDEFGHJKMNPQRS`)
    expect(rendered).toBe(await linked(null))
    // An https site whose edge forwards to the server over http.
    expect(await linked({ path: '/invite', headers: { 'host': 'internal:3000', 'x-forwarded-host': 'panels.app', 'x-forwarded-proto': 'https' } })).toBe('https://panels.app/invite?ref=ADA23456#0123456789ABCDEFGHJKMNPQRS')
  })

  it('mints one on issue, and shows it until the live read catches up', async () => {
    const backend = createBackendMock({ user: { name: 'Ada' }, queries: { 'access:getMemberTicket': { state: 'none', uses: 3 } } })
    backend.stub('access:issueMemberTicket', () => issued)
    const ticket = await inPage(() => useMemberTicket())
    await flushPromises()
    expect(ticket.link.value).toBeNull()
    expect(await ticket.issue()).toEqual(issued)
    expect(ticket.ticket.value).toEqual(issued)
    expect(ticket.link.value).toContain('#0123456789ABCDEFGHJKMNPQRS')
  })

  it('reads nothing for a visitor, and names the function an app without it re-exports', async () => {
    createBackendMock()
    const visitor = await inPage(() => useMemberTicket())
    await flushPromises()
    expect(visitor.ticket.value).toBeNull()
    createBackendMock({ user: { name: 'Ada' } })
    const bare = await inPage(() => useMemberTicket({ api: {} }))
    await expect(bare.issue()).rejects.toThrow('`issueMemberTicket`')
  })
})
