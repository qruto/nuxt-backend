import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { makeFunctionReference } from 'convex/server'
import { backendError } from '../../src/convex/errors'
import type { ReferralPreview } from '../../src/convex/integrations/referrals'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import type { UseReferralInviteOptions, UseReferralInviteReturn } from '../../src/runtime/vue/composables/use-referral-invite'
import { registerComponents } from '../helpers/register-components'

// The page a referral link opens, `/r/<code>`: the test app has no pages, so
// the route the link opens is stood in for, with its code and query.
const route = reactive<{ path: string, fullPath: string, params: Record<string, string | string[]>, query: Record<string, string> }>({ path: '/r/ADA123', fullPath: '/r/ADA123', params: { code: 'ADA123' }, query: {} })
mockNuxtImport('useRoute', () => () => route)

await registerComponents('ReferralLanding')
const { default: ReferralLanding } = await import('../../src/runtime/vue/components/billing/ReferralLanding.vue')
const { useReferralInvite } = await import('../../src/runtime/vue/composables/use-referral-invite')

// <ReferralLanding> over the backend mock, built on useReferralInvite: who
// invited the visitor and what they get, the sign-up that brings them back
// to claim, the claim itself (once on its own after that sign-up, else by
// the button), and each way it settles.

enableAutoUnmount(afterEach)
beforeEach(() => {
  Object.assign(route, { path: '/r/ADA123', fullPath: '/r/ADA123', params: { code: 'ADA123' }, query: {} })
})
afterEach(() => resetBackendMock())

const PREVIEW: ReferralPreview = { inviter: 'Ada', program: { referred: { kind: 'discount', name: '20% off' }, referrer: { kind: 'months', months: 1 }, holdDays: 30, caps: { perReferrer: null, perMonth: null } } }

/** The backend of a public app (the phase read) with this link's preview. */
function backendWith(preview: ReferralPreview | null = PREVIEW, user?: Record<string, unknown>): BackendMock {
  const backend = createBackendMock({ ...(user ? { user } : {}), queries: { 'access:getAccessPhase': { phase: 'public' }, 'referrals:previewReferral': (args: { code: string }) => (args.code === 'ADA123' ? preview : null) } })
  backend.stub('referrals:claimReferral', () => ({ claimed: true }))
  return backend
}

async function landing(): Promise<VueWrapper> {
  const wrapper = await mountSuspended(ReferralLanding)
  await flushPromises()
  return wrapper
}

/** The composable as an app's own page calls it. */
async function withInvite(options?: UseReferralInviteOptions): Promise<UseReferralInviteReturn> {
  let invite: UseReferralInviteReturn
  await mountSuspended(defineComponent({
    setup() {
      invite = useReferralInvite(options)
      return () => null
    },
  }))
  await flushPromises()
  return invite!
}

const part = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-referral="${name}"]`)
const state = (wrapper: VueWrapper) => part(wrapper, 'landing').attributes('data-state')

describe('the referral link\'s page', () => {
  it('checks the link first, as a busy status', async () => {
    const backend = createBackendMock({ queries: { 'access:getAccessPhase': { phase: 'public' } } })
    const wrapper = await landing()
    expect(state(wrapper)).toBe('checking')
    expect(part(wrapper, 'landing').attributes('aria-busy')).toBe('true')
    expect(part(wrapper, 'landing-status').attributes('role')).toBe('status')
    expect(part(wrapper, 'landing-status').text()).toBe('Checking the link…')
    backend.state.queries['referrals:previewReferral'] = PREVIEW
    await flushPromises()
    expect(state(wrapper)).toBe('ready')
    expect(part(wrapper, 'landing').attributes('aria-busy')).toBeUndefined()
  })

  it('tells a visitor who invited them and what they get, and signs them up through a sign-in that returns here to claim', async () => {
    const backend = backendWith()
    const wrapper = await landing()
    expect(state(wrapper)).toBe('ready')
    expect(part(wrapper, 'landing-from').text()).toBe('Ada invited you.')
    expect(part(wrapper, 'landing-offer').text()).toBe('Sign up through this link and you get 20% off on your first payment.')
    expect(part(wrapper, 'landing-sign-up').attributes('href')).toBe(`/login?redirect=${encodeURIComponent('/r/ADA123?claim=1')}`)
    expect(part(wrapper, 'landing-claim').exists()).toBe(false)
    // Nothing is claimed for a visitor.
    expect(backend.callsTo('referrals:claimReferral')).toEqual([])
  })

  it('tells a visitor while the app is closed that signing up takes an invite, and offers the ways in that come back here', async () => {
    const backend = backendWith()
    backend.state.queries['access:getAccessPhase'] = { phase: 'early-access' }
    const wrapper = await landing()
    expect(state(wrapper)).toBe('ready')
    expect(part(wrapper, 'landing').attributes('data-closed')).toBe('true')
    expect(part(wrapper, 'landing-closed').text()).toBe('Signing up takes an invite right now. Once you have an account, come back to this link within a day to claim it.')
    // The invite page carries the code: the sign-in it leads to comes back here to claim.
    expect(part(wrapper, 'landing-invite').attributes('href')).toBe('/invite?ref=ADA123')
    expect(part(wrapper, 'landing-waitlist').attributes('href')).toBe('/waitlist')
    expect(part(wrapper, 'landing-sign-in').attributes('href')).toBe(`/login?redirect=${encodeURIComponent('/r/ADA123?claim=1')}`)
    expect(part(wrapper, 'landing-sign-up').exists()).toBe(false)

    // Invite only, the waitlist takes nobody new.
    backend.state.queries['access:getAccessPhase'] = { phase: 'invite-only' }
    await flushPromises()
    expect(part(wrapper, 'landing-waitlist').exists()).toBe(false)
    expect(part(wrapper, 'landing-invite').exists()).toBe(true)

    // Public, the sign-up is the way in again.
    backend.state.queries['access:getAccessPhase'] = { phase: 'public' }
    await flushPromises()
    expect(part(wrapper, 'landing').attributes('data-closed')).toBeUndefined()
    expect(part(wrapper, 'landing-sign-up').exists()).toBe(true)
    expect(part(wrapper, 'landing-closed').exists()).toBe(false)
  })

  it('offers a visitor no way in while the phase loads, neither the sign-up nor a ticket', async () => {
    const backend = backendWith()
    delete backend.state.queries['access:getAccessPhase']
    const wrapper = await landing()
    expect(state(wrapper)).toBe('ready')
    expect(part(wrapper, 'landing-from').text()).toBe('Ada invited you.')
    expect(part(wrapper, 'landing').attributes('aria-busy')).toBe('true')
    expect(part(wrapper, 'landing').attributes('data-closed')).toBeUndefined()
    for (const name of ['landing-sign-up', 'landing-closed', 'landing-invite', 'landing-waitlist', 'landing-sign-in']) expect(part(wrapper, name).exists()).toBe(false)

    backend.state.queries['access:getAccessPhase'] = { phase: 'invite-only' }
    await flushPromises()
    expect(part(wrapper, 'landing').attributes('aria-busy')).toBeUndefined()
    expect(part(wrapper, 'landing-closed').exists()).toBe(true)
    expect(part(wrapper, 'landing-sign-up').exists()).toBe(false)
  })

  it('says whether the app is closed, for a page of the app\'s own, and lets a signed-in person claim whatever the phase', async () => {
    const backend = backendWith(PREVIEW, {})
    delete backend.state.queries['access:getAccessPhase']
    const invite = await withInvite()
    // Not read yet: neither open nor closed.
    expect(invite.closed.value).toBeUndefined()
    backend.state.queries['access:getAccessPhase'] = { phase: 'invite-only' }
    await flushPromises()
    expect(invite.closed.value).toBe(true)
    expect(invite.state.value).toBe('claimable')
    backend.state.queries['access:getAccessPhase'] = { phase: 'public' }
    await flushPromises()
    expect(invite.closed.value).toBe(false)
  })

  it('reads a phase that could not be read as open, so the sign-up stays on offer', async () => {
    const backend = backendWith()
    delete backend.state.queries['access:getAccessPhase']
    backend.fail('access:getAccessPhase', backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    const wrapper = await landing()
    expect(part(wrapper, 'landing-sign-up').exists()).toBe(true)
    expect(part(wrapper, 'landing-closed').exists()).toBe(false)
  })

  it('words a trial, an offer of nothing, and an inviter without a name', async () => {
    backendWith({ inviter: null, program: { ...PREVIEW.program, referred: { kind: 'trial', days: 14 } } })
    const trial = await landing()
    expect(part(trial, 'landing-from').text()).toBe('A friend invited you.')
    expect(part(trial, 'landing-offer').text()).toBe('Sign up through this link and you get 14 days free on your first payment.')
    trial.unmount()

    backendWith({ inviter: 'Ada', program: { ...PREVIEW.program, referred: null } })
    const nothing = await landing()
    expect(part(nothing, 'landing-offer').text()).toBe('Sign up through this link and they will know it came from them.')
  })

  it('says a link that is no referral no longer works', async () => {
    route.params = { code: 'NOPE' }
    backendWith()
    const wrapper = await landing()
    expect(state(wrapper)).toBe('invalid')
    expect(part(wrapper, 'landing-status').text()).toBe('This link no longer works.')
    expect(part(wrapper, 'landing-sign-up').exists()).toBe(false)
  })

  it('says a link that cannot be read no longer works, and keeps the reason', async () => {
    const backend = backendWith()
    backend.fail('referrals:previewReferral', backendError('rate_limited'))
    const wrapper = await landing()
    expect(state(wrapper)).toBe('invalid')
    expect(part(wrapper, 'landing-status').text()).toBe('This link no longer works.')
    const invite = await withInvite()
    expect(invite.state.value).toBe('invalid')
    expect(invite.preview.value).toBeNull()
    expect(invite.isLoading.value).toBe(false)
    expect(invite.error.value).toMatchObject({ code: 'rate_limited' })
  })

  it('reports loading and the claim as it runs, for a page of the app\'s own', async () => {
    backendWith(PREVIEW, {})
    const invite = await withInvite()
    expect(invite.isLoading.value).toBe(false)
    expect(invite.preview.value).toEqual(PREVIEW)
    expect(invite.error.value).toBeNull()
    const claimed = invite.claim()
    expect(invite.isPending.value).toBe(true)
    await claimed
    expect(invite.isPending.value).toBe(false)
    expect(invite.state.value).toBe('claimed')
  })

  it('reads another backend through `api`', async () => {
    const backend = createBackendMock({ queries: { 'partners:previewReferral': () => PREVIEW } })
    const invite = await withInvite({ api: { previewReferral: makeFunctionReference<'query'>('partners:previewReferral') } as never })
    expect(invite.preview.value).toEqual(PREVIEW)
    expect(backend.callsTo('referrals:previewReferral')).toEqual([])
  })

  it('lets a signed-in person claim with a button, then go on', async () => {
    const backend = backendWith(PREVIEW, {})
    const wrapper = await landing()
    expect(state(wrapper)).toBe('claimable')
    await part(wrapper, 'landing-claim').trigger('click')
    await flushPromises()
    expect(backend.callsTo('referrals:claimReferral')).toEqual([{ code: 'ADA123' }])
    expect(state(wrapper)).toBe('claimed')
    expect(part(wrapper, 'landing-status').text()).toBe('Done. The invitation is yours.')
    expect(part(wrapper, 'landing-continue').attributes('href')).toBe('/settings')
  })

  it('says a person\'s own link is theirs, and any other refusal that the invitation could not be used', async () => {
    const backend = backendWith(PREVIEW, {})
    backend.stub('referrals:claimReferral', () => ({ claimed: false, reason: 'own_code' }))
    const own = await landing()
    await part(own, 'landing-claim').trigger('click')
    await flushPromises()
    expect(state(own)).toBe('own')
    expect(part(own, 'landing-status').text()).toBe('This is your own link.')
    own.unmount()

    backend.stub('referrals:claimReferral', () => ({ claimed: false, reason: 'already_claimed' }))
    const used = await landing()
    await part(used, 'landing-claim').trigger('click')
    await flushPromises()
    expect(state(used)).toBe('ignored')
    expect(part(used, 'landing-status').attributes('role')).toBe('status')
    expect(part(used, 'landing-status').text()).toBe('This invitation could not be used, and you can go on without it.')
    expect(part(used, 'landing-continue').exists()).toBe(true)
  })

  it('says why a claim failed, as an alert, and lets the person go on', async () => {
    const backend = backendWith(PREVIEW, {})
    backend.fail('referrals:claimReferral', backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    const wrapper = await landing()
    await part(wrapper, 'landing-claim').trigger('click')
    await flushPromises()
    expect(state(wrapper)).toBe('ignored')
    expect(part(wrapper, 'landing-status').attributes('role')).toBe('alert')
    expect(part(wrapper, 'landing-status').text()).not.toBe('This invitation could not be used, and you can go on without it.')
  })

  it('claims once on its own when the sign-in it sent the visitor to returns here', async () => {
    route.query = { claim: '1' }
    const backend = backendWith()
    const wrapper = await landing()
    expect(backend.callsTo('referrals:claimReferral')).toEqual([])

    backend.signIn()
    await flushPromises()
    expect(backend.callsTo('referrals:claimReferral')).toEqual([{ code: 'ADA123', fromSignIn: true }])
    expect(state(wrapper)).toBe('claimed')
    // Never twice, whatever reads again.
    backend.state.queries['referrals:previewReferral'] = { ...PREVIEW }
    await flushPromises()
    expect(backend.callsTo('referrals:claimReferral')).toHaveLength(1)
  })

  it('leaves the claim to the button when no sign-in just happened here, without a word of failure', async () => {
    route.query = { claim: '1' }
    const backend = backendWith(PREVIEW, {})
    let first = true
    backend.stub('referrals:claimReferral', () => {
      if (!first) return { claimed: true }
      first = false
      throw backendError('reauthentication_required')
    })
    const wrapper = await landing()
    expect(backend.callsTo('referrals:claimReferral')).toEqual([{ code: 'ADA123', fromSignIn: true }])
    expect(state(wrapper)).toBe('claimable')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)

    await part(wrapper, 'landing-claim').trigger('click')
    await flushPromises()
    expect(backend.callsTo('referrals:claimReferral')[1]).toEqual({ code: 'ADA123' })
    expect(state(wrapper)).toBe('claimed')
  })
})
