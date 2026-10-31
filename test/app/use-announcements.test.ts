import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { makeFunctionReference } from 'convex/server'
import { backendError } from '../../src/convex/errors'
import type { LiveAnnouncement } from '../../src/convex/integrations/announcements'
import { createBackendMock, resetBackendMock } from '../../src/runtime/test-utils'
import { useAnnouncements, useAnnouncementsAdmin, type AnnouncementsApiRefs, type UseAnnouncementsReturn } from '../../src/runtime/vue/composables/use-announcements'

// useAnnouncements over the backend mock: the notices an administrator
// published that the signed-in person sees, live, and their dismissal,
// which takes a notice away at once and puts it back when the backend
// refuses; and useAnnouncementsAdmin without the functions it calls.

enableAutoUnmount(afterEach)
afterEach(() => resetBackendMock())

const LIST = 'email:getAnnouncements'
const DAY = 86_400_000

const notice = (id: string, fields: Partial<LiveAnnouncement> = {}): LiveAnnouncement => ({ id, message: `Notice ${id}`, expiresAt: Date.now() + DAY, publishedAt: Date.now(), ...fields })

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

const ids = (state: UseAnnouncementsReturn) => state.announcements.value.map(item => item.id)

describe('useAnnouncements', () => {
  it('lists what the person has not dismissed and has not expired, live, and nothing once signed out', async () => {
    const backend = createBackendMock({ user: {}, queries: { [LIST]: [notice('a'), notice('old', { expiresAt: Date.now() - 1 })] } })
    const state = await inPage(() => useAnnouncements())
    expect(ids(state)).toEqual(['a'])

    // A new one shows without a reload.
    backend.state.queries[LIST] = [notice('b'), notice('a')]
    await nextTick()
    expect(ids(state)).toEqual(['b', 'a'])

    backend.signOut()
    await nextTick()
    expect(ids(state)).toEqual([])
  })

  it('takes a dismissed notice away at once, before the backend answers, and keeps it away', async () => {
    const backend = createBackendMock({ user: {}, queries: { [LIST]: [notice('a'), notice('b')] } })
    let land!: () => void
    backend.stub('email:dismissAnnouncement', () => new Promise((resolve) => {
      land = () => resolve(null)
    }))
    const state = await inPage(() => useAnnouncements())
    const dismissed = state.dismiss('a')
    await nextTick()
    expect(ids(state)).toEqual(['b'])
    expect(state.isPending.value).toBe(true)

    land()
    await dismissed
    expect(state.isPending.value).toBe(false)
    expect(backend.callsTo('email:dismissAnnouncement')).toEqual([{ id: 'a' }])
    // The read still lists it until the backend's answer reaches it: the page keeps it away meanwhile.
    expect(ids(state)).toEqual(['b'])
  })

  it('puts a notice back when its dismissal is refused, and says why', async () => {
    const backend = createBackendMock({ user: {}, queries: { [LIST]: [notice('a')] } })
    backend.fail('email:dismissAnnouncement', backendError('unavailable', { service: 'backend', reason: 'unexpected' }))
    const state = await inPage(() => useAnnouncements())
    await expect(state.dismiss('a')).rejects.toThrow()
    expect(ids(state)).toEqual(['a'])
    expect(state.error.value).toMatchObject({ code: 'unavailable' })
  })

  it('links a page of the app in place and an https address as leaving it; a notice without a link has none', async () => {
    createBackendMock({ user: {} })
    const { linkOf } = await inPage(() => useAnnouncements())
    expect(linkOf(notice('a', { link: { url: '/pricing', label: 'See plans' } }))).toEqual({ href: '/pricing', external: false })
    expect(linkOf(notice('b', { link: { url: 'https://status.example.com' } }))).toEqual({ href: 'https://status.example.com', external: true })
    expect(linkOf(notice('c'))).toBeNull()
  })

  it('reads nothing, and says what is missing on a dismissal, for an app without the dismiss function', async () => {
    const backend = createBackendMock({ user: {}, queries: { [LIST]: [notice('a')] } })
    const api: AnnouncementsApiRefs = { getAnnouncements: makeFunctionReference<'query'>(LIST) as AnnouncementsApiRefs['getAnnouncements'] }
    const state = await inPage(() => useAnnouncements({ api }))
    expect(ids(state)).toEqual(['a'])
    await expect(state.dismiss('a')).rejects.toThrow('needs `dismissAnnouncement`')
    expect(ids(state)).toEqual(['a'])
    expect(backend.calls).toEqual([])

    // Without even the list, the notice reads nothing and says nothing.
    const silent = await inPage(() => useAnnouncements({ api: {} }))
    expect(ids(silent)).toEqual([])
  })
})

describe('useAnnouncementsAdmin', () => {
  it('rejects each change the backend does not export, naming the function to re-export', async () => {
    createBackendMock({ user: { role: 'admin' } })
    const admin = await inPage(() => useAnnouncementsAdmin({ api: {} }))
    await expect(admin.publish({ message: 'x', expiresAt: Date.now() + DAY })).rejects.toThrow('`publishAnnouncement`')
    await expect(admin.end('a')).rejects.toThrow('`endAnnouncement`')
    await expect(admin.preview('a')).rejects.toThrow('`previewAnnouncement`')
    await expect(admin.send('a')).rejects.toThrow('`sendAnnouncement`')
    await expect(admin.cancel('a')).rejects.toThrow('`cancelAnnouncement`')
    expect(admin.error.value).not.toBeNull()
    // Without its read, the console never loads: nothing to wait for.
    expect(admin.isLoading.value).toBe(false)
    expect(admin.announcements.value).toEqual([])
  })

  it('reads nothing for a visitor: no console, no refusal, no error', async () => {
    const backend = createBackendMock()
    backend.state.queries['email:getAnnouncementsConsole'] = null
    const admin = await inPage(() => useAnnouncementsAdmin())
    expect(admin.console.value).toBeNull()
    expect(admin.isRefused.value).toBe(false)
    expect(admin.isLoading.value).toBe(false)
    expect(admin.error.value).toBeNull()
  })

  it('reads as loading while the session does, and answers what each change resolves', async () => {
    const backend = createBackendMock({ user: { role: 'admin' }, isLoading: true })
    backend.stub('email:publishAnnouncement', () => ({ id: 'a1' }))
    backend.stub('email:endAnnouncement', () => ({ ended: false }))
    backend.stub('email:sendAnnouncement', () => ({ sendAt: null }))
    backend.stub('email:cancelAnnouncement', () => ({ cancelled: true }))
    const admin = await inPage(() => useAnnouncementsAdmin())
    expect(admin.console.value).toBeUndefined()
    expect(admin.isLoading.value).toBe(true)

    backend.state.isLoading = false
    backend.state.queries['email:getAnnouncementsConsole'] = { announcements: [], topics: [], audiences: { accounts: false, waitlist: false }, canBroadcast: false, postalAddress: false }
    await flushPromises()
    expect(admin.isLoading.value).toBe(false)
    expect(await admin.publish({ message: 'Hi', expiresAt: 1 })).toBe('a1')
    expect(await admin.end('a1')).toBe(false)
    expect(await admin.send('a1', 5)).toBeNull()
    expect(backend.callsTo('email:sendAnnouncement')).toEqual([{ id: 'a1', scheduledAt: 5 }])
    expect(await admin.cancel('a1')).toBe(true)
  })
})
