import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { backendError } from '../../src/convex/errors'
import type { ReferralProgram } from '../../src/convex/integrations/referrals'
import { createBackendMock, resetBackendMock, type BackendMock } from '../../src/runtime/test-utils'
import { useReferrals, type UseReferralsReturn } from '../../src/runtime/vue/composables/use-referrals'

// useReferrals over the backend mock: the person's code, made on the first
// read once they are signed in; the link and the share text that says what
// both sides get; copying and sharing them; and the choice to carry the code
// on shared pages.

enableAutoUnmount(afterEach)
afterEach(() => {
  resetBackendMock()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const PROGRAM: ReferralProgram = { referred: { kind: 'trial', days: 14 }, referrer: { kind: 'pack', name: '500 credits' }, holdDays: 30, caps: { perReferrer: null, perMonth: null } }

function signedIn(program: ReferralProgram = PROGRAM): BackendMock {
  const backend = createBackendMock({ user: {}, queries: { 'referrals:getReferrals': { claimed: 3, held: 1, rewarded: 1, referrals: [] } } })
  backend.stub('referrals:getReferralCode', () => ({ code: 'ADA 123', sharePages: false, program }))
  backend.stub('referrals:setReferralSharing', () => null)
  return backend
}

async function inPage(): Promise<UseReferralsReturn> {
  let result!: UseReferralsReturn
  await mountSuspended(defineComponent({
    setup() {
      result = useReferrals()
      return () => h('div')
    },
  }))
  await flushPromises()
  return result
}

describe('useReferrals', () => {
  it('makes the code on the first read, with the link on this site and what both sides get', async () => {
    const backend = signedIn()
    const referrals = await inPage()
    expect(backend.callsTo('referrals:getReferralCode')).toEqual([{}])
    expect(referrals.code.value).toBe('ADA 123')
    expect(referrals.link.value).toBe(`${window.location.origin}/r/ADA%20123`)
    expect(referrals.shareText.value).toBe('Try this app with my link. You get 14 days free. I earn 500 credits when you become a customer.')
    expect(referrals.program.value).toEqual(PROGRAM)
    expect(referrals.sharePages.value).toBe(false)
    expect(referrals.referrals.value).toMatchObject({ claimed: 3, held: 1, rewarded: 1 })
    expect(referrals.isLoading.value).toBe(false)
  })

  it('words a discount, and leaves out a side that gets nothing', async () => {
    signedIn({ ...PROGRAM, referred: { kind: 'discount', name: '20% off' }, referrer: null })
    expect((await inPage()).shareText.value).toBe('Try this app with my link. You get 20% off on your first payment.')

    signedIn({ ...PROGRAM, referred: null, referrer: null })
    expect((await inPage()).shareText.value).toBe('Try this app with my link.')
  })

  it('counts the free months the sharer earns, one or several', async () => {
    signedIn({ ...PROGRAM, referrer: { kind: 'months', months: 2 } })
    expect((await inPage()).shareText.value).toBe('Try this app with my link. You get 14 days free. I earn 2 free months when you become a customer.')

    signedIn({ ...PROGRAM, referrer: { kind: 'months', months: 1 } })
    expect((await inPage()).shareText.value).toBe('Try this app with my link. You get 14 days free. I earn 1 free month when you become a customer.')
  })

  it('makes no code for a visitor, forgets it on sign-out and reads it again on the next sign-in', async () => {
    const backend = signedIn()
    backend.signOut()
    const referrals = await inPage()
    expect(referrals.code.value).toBeNull()
    expect(referrals.link.value).toBeNull()
    expect(referrals.isLoading.value).toBe(false)
    expect(backend.callsTo('referrals:getReferralCode')).toEqual([])

    backend.signIn()
    await flushPromises()
    expect(referrals.code.value).toBe('ADA 123')
    backend.signOut()
    await flushPromises()
    expect(referrals.code.value).toBeNull()
    expect(referrals.program.value).toBeNull()
  })

  it('says why the code could not be read, and is done loading', async () => {
    const backend = signedIn()
    backend.fail('referrals:getReferralCode', backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    const referrals = await inPage()
    expect(referrals.code.value).toBeNull()
    expect(referrals.error.value).toMatchObject({ code: 'unavailable' })
    expect(referrals.isLoading.value).toBe(false)
  })

  it('copies the share text with the link, says so for a moment, and answers false where the clipboard is refused', async () => {
    signedIn()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const referrals = await inPage()
    vi.useFakeTimers()
    expect(await referrals.copy()).toBe(true)
    expect(write).toHaveBeenCalledWith(`${referrals.shareText.value} ${referrals.link.value}`)
    expect(referrals.copied.value).toBe(true)
    vi.advanceTimersByTime(3000)
    expect(referrals.copied.value).toBe(false)

    write.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    expect(await referrals.copy()).toBe(false)
    expect(referrals.copied.value).toBe(false)
  })

  it('copies and shares nothing before there is a link', async () => {
    const backend = signedIn()
    backend.signOut()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const referrals = await inPage()
    expect(await referrals.copy()).toBe(false)
    expect(await referrals.share()).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  it('opens the share sheet where the browser has one, and answers false when the person closes it', async () => {
    signedIn()
    const share = vi.fn(async (_data: ShareData) => {})
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share }))
    try {
      const referrals = await inPage()
      expect(referrals.canShare.value).toBe(true)
      expect(await referrals.share()).toBe(true)
      expect(share).toHaveBeenCalledWith({ text: referrals.shareText.value, url: referrals.link.value })
      share.mockRejectedValueOnce(new DOMException('Closed', 'AbortError'))
      expect(await referrals.share()).toBe(false)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('says no share sheet where the browser has none', async () => {
    signedIn()
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { share: undefined }))
    try {
      const referrals = await inPage()
      expect(referrals.canShare.value).toBe(false)
      expect(await referrals.share()).toBe(false)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('saves the choice to carry the code on shared pages, and keeps the old one when it is refused', async () => {
    const backend = signedIn()
    const referrals = await inPage()
    await referrals.setSharePages(true)
    expect(backend.callsTo('referrals:setReferralSharing')).toEqual([{ share: true }])
    expect(referrals.sharePages.value).toBe(true)

    backend.fail('referrals:setReferralSharing', backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    await expect(referrals.setSharePages(false)).rejects.toThrow()
    expect(referrals.sharePages.value).toBe(true)
    expect(referrals.error.value).toMatchObject({ code: 'unavailable' })
  })
})
