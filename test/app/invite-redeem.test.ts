import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { clearNuxtData } from '#app'
import { backendError } from '../../src/convex/errors'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { forgetInvite, keptInvite } from '../../src/runtime/vue/utils/kept-invite'
import { registerComponents } from '../helpers/register-components'

// The page an access link opens, `/invite`: the test app has no pages, so
// the route the link opens is stood in for, with its query.
const route = reactive<{ path: string, fullPath: string, params: Record<string, string>, query: Record<string, string> }>({ path: '/invite', fullPath: '/invite', params: {}, query: {} })
mockNuxtImport('useRoute', () => () => route)

await registerComponents('InviteRedeem')
const { default: InviteRedeem } = await import('../../src/runtime/vue/components/auth/InviteRedeem.vue')

// <InviteRedeem> over the backend mock, built on useInvite: a link's token
// checked on arrival, a code typed by hand when no link brought one that
// works, a signed-in visitor who has nothing to redeem, and a visitor the
// referral page sent here, who goes back to it once signed in.

const TOKEN = '0123456789ABCDEFGHJKMNPQRS'

enableAutoUnmount(afterEach)
beforeEach(() => {
  clearNuxtData()
  forgetInvite()
  Object.assign(route, { query: {} })
  window.history.replaceState(null, '', '/invite')
})
afterEach(() => resetBackendMock())

function backendWith(options: { phase?: string, user?: Record<string, unknown>, valid?: string[] } = {}): BackendMock {
  const backend = createBackendMock({ ...(options.user ? { user: options.user } : {}), queries: { 'access:getAccessPhase': { phase: options.phase ?? 'early-access' } } })
  const valid = options.valid ?? [TOKEN]
  backend.stub('access:checkInvite', (args: { code: string }) => ({ status: valid.includes(args.code) ? 'valid' : 'unknown' }))
  return backend
}

async function page(): Promise<VueWrapper> {
  // No route change: the address the test wrote, its fragment included, is the page's.
  const wrapper = await mountSuspended(InviteRedeem, { route: false })
  await flushPromises()
  return wrapper
}

const part = (wrapper: VueWrapper, name: string) => wrapper.find(`[data-auth="${name}"]`)
const state = (wrapper: VueWrapper) => part(wrapper, 'invite').attributes('data-state')

describe('the invite page', () => {
  it('checks a link\'s token on arrival, strips it from the address, and sends the person on to sign in', async () => {
    const backend = backendWith()
    window.history.replaceState(null, '', `/invite#${TOKEN}`)
    const wrapper = await page()
    expect(backend.callsTo('access:checkInvite')).toEqual([{ code: TOKEN }])
    expect(window.location.hash).toBe('')
    expect(state(wrapper)).toBe('valid')
    expect(part(wrapper, 'invite-continue').attributes('href')).toBe('/login')
    expect(part(wrapper, 'invite-form').exists()).toBe(false)
    expect(keptInvite()).toBe(TOKEN)
  })

  it('asks for a code when no link brought one, checks the typed code, and points a visitor without one to the waitlist', async () => {
    const backend = backendWith({ valid: ['7KQ2M-XW9PA'] })
    const wrapper = await page()
    expect(state(wrapper)).toBe('blank')
    expect(backend.callsTo('access:checkInvite')).toEqual([])
    expect(part(wrapper, 'invite-status').text()).toBe('Open the invite link you were given, or enter its code.')
    expect(part(wrapper, 'invite-waitlist').find('a').attributes('href')).toBe('/waitlist')
    const input = part(wrapper, 'input-invite-code')
    expect(part(wrapper, 'label-invite-code').attributes('for')).toBe(input.attributes('id'))

    await input.setValue('nope')
    await part(wrapper, 'invite-form').trigger('submit')
    await flushPromises()
    expect(state(wrapper)).toBe('unknown')
    // Still offered after a code that admits nobody.
    await part(wrapper, 'input-invite-code').setValue(' 7KQ2M-XW9PA ')
    await part(wrapper, 'invite-form').trigger('submit')
    await flushPromises()
    expect(backend.callsTo('access:checkInvite')).toEqual([{ code: 'nope' }, { code: '7KQ2M-XW9PA' }])
    expect(state(wrapper)).toBe('valid')
    expect(part(wrapper, 'invite-form').exists()).toBe(false)
    expect(keptInvite()).toBe('7KQ2M-XW9PA')
  })

  it('offers no waitlist while the app is invite only', async () => {
    backendWith({ phase: 'invite-only' })
    const wrapper = await page()
    expect(part(wrapper, 'invite-form').exists()).toBe(true)
    expect(part(wrapper, 'invite-waitlist').exists()).toBe(false)
  })

  it('offers a typed code after a link that admits nobody, and after a check that failed', async () => {
    const backend = backendWith({ valid: [] })
    window.history.replaceState(null, '', `/invite#${TOKEN}`)
    const dead = await page()
    expect(state(dead)).toBe('unknown')
    expect(part(dead, 'invite-form').exists()).toBe(true)
    dead.unmount()

    backend.fail('access:checkInvite', backendError('rate_limited'))
    window.history.replaceState(null, '', `/invite#${TOKEN}`)
    const failed = await page()
    expect(state(failed)).toBe('error')
    expect(part(failed, 'invite-status').attributes('role')).toBe('alert')
    expect(part(failed, 'invite-form').exists()).toBe(true)
  })

  it('checks and keeps nothing for a visitor signed in already, and takes the token off the address all the same', async () => {
    const backend = backendWith({ user: {} })
    window.history.replaceState(null, '', `/invite#${TOKEN}`)
    const wrapper = await page()
    expect(state(wrapper)).toBe('member')
    expect(backend.callsTo('access:checkInvite')).toEqual([])
    expect(keptInvite()).toBeNull()
    // A bearer token: never in an address bar they copy, whoever holds the session.
    expect(window.location.hash).toBe('')
    expect(part(wrapper, 'invite-status').text()).toBe('You\'re signed in already, so this invite stays unused. Pass it on to a friend.')
    expect(part(wrapper, 'invite-home').attributes('href')).toBe('/')
    expect(part(wrapper, 'invite-form').exists()).toBe(false)
  })

  it('waits for the session before it checks anything, with the token off the address at once and kept through a reload', async () => {
    const backend = backendWith()
    backend.state.isLoading = true
    window.history.replaceState(null, '', `/invite#${TOKEN}`)
    const wrapper = await page()
    expect(state(wrapper)).toBe('checking')
    expect(backend.callsTo('access:checkInvite')).toEqual([])
    // Off the address before the session is known: out of the history and of an error report's URL.
    expect(window.location.hash).toBe('')
    wrapper.unmount()
    // A reload while the session settles: the tab kept the token.
    const reloaded = await page()
    backend.state.isLoading = false
    await flushPromises()
    expect(backend.callsTo('access:checkInvite')).toEqual([{ code: TOKEN }])
    expect(state(reloaded)).toBe('valid')
  })

  it('moves focus on to the way in when a typed code checks and its form goes', async () => {
    backendWith({ valid: ['7KQ2M-XW9PA'] })
    const wrapper = await mountSuspended(InviteRedeem, { route: false, attachTo: document.body })
    await flushPromises()
    await part(wrapper, 'input-invite-code').setValue('7KQ2M-XW9PA')
    const check = part(wrapper, 'invite-check').element as HTMLButtonElement
    check.focus()
    expect(document.activeElement).toBe(check)
    await part(wrapper, 'invite-form').trigger('submit')
    await flushPromises()
    expect(state(wrapper)).toBe('valid')
    expect(document.activeElement).toBe(part(wrapper, 'invite-continue').element)
  })

  it('sends a visitor the referral page sent here back to it once signed in, where they claim it themselves', async () => {
    backendWith()
    // A code as a person might retype it: folded the way the referral page reads it.
    route.query = { ref: 'ada2-3456' }
    window.history.replaceState(null, '', `/invite?ref=ada2-3456#${TOKEN}`)
    const wrapper = await page()
    expect(state(wrapper)).toBe('valid')
    // Back to the page, never to its claim: the address alone claims nothing.
    expect(part(wrapper, 'invite-continue').attributes('href')).toBe(`/login?redirect=${encodeURIComponent('/r/ADA23456')}`)
    expect(window.location.search).toBe('?ref=ada2-3456')
    wrapper.unmount()

    // Something that can be no code goes nowhere but the sign-in.
    route.query = { ref: '../../elsewhere' }
    window.history.replaceState(null, '', `/invite#${TOKEN}`)
    const odd = await page()
    expect(part(odd, 'invite-continue').attributes('href')).toBe('/login')
  })
})
