import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// Private routes are kept out of search indexes by the page's own robots
// meta tag, with or without @nuxtjs/robots: the plugin for every page
// `auth` guards (the app's own, and its children). The frame's `noindex` for
// a public page that reads a token from its link is page-frame.test.ts's.

const { useHead } = vi.hoisted(() => ({ useHead: vi.fn() }))
mockNuxtImport('useHead', () => useHead)

/** The route the plugin reads: its matched records' page meta. */
const current = shallowRef<{ matched: Array<{ meta: Record<string, unknown> }> }>({ matched: [] })
mockNuxtImport('useRouter', original => () => new Proxy((original as () => object)(), { get: (router, key) => (key === 'currentRoute' ? current : Reflect.get(router, key)) }))

const { default: plugin } = await import('../../src/runtime/vue/plugins/noindex')

const NOINDEX = [{ name: 'robots', content: 'noindex, nofollow' }]

/** The meta the plugin's head entry gives the current route. */
function metaNow(): unknown {
  useHead.mockClear()
  ;(plugin as unknown as { setup: () => void }).setup()
  const entry = useHead.mock.calls.at(-1)?.[0] as MaybeRefOrGetter<{ meta: unknown }>
  return toValue(entry).meta
}

describe('the noindex plugin', () => {
  beforeEach(() => {
    current.value = { matched: [] }
  })

  it('tags a page that asks for a sign-in, or for rules, hidden ones included', () => {
    for (const auth of [true, { role: 'admin' }, { role: 'admin', hidden: true }, { workspace: true }]) {
      current.value = { matched: [{ meta: { auth } }] }
      expect(metaNow(), JSON.stringify(auth)).toEqual(NOINDEX)
    }
  })

  it('tags a page below a guarded parent: the admin console\'s own tabs', () => {
    current.value = { matched: [{ meta: { auth: { role: 'admin', hidden: true } } }, { meta: { adminTab: { label: 'Featured' } } }] }
    expect(metaNow()).toEqual(NOINDEX)
  })

  it('leaves a public page alone', () => {
    expect(metaNow()).toEqual([])
    current.value = { matched: [{ meta: {} }, { meta: { auth: false } }] }
    expect(metaNow()).toEqual([])
  })

  it('follows the route: the entry is a getter, read again on each navigation', () => {
    ;(plugin as unknown as { setup: () => void }).setup()
    const entry = useHead.mock.calls.at(-1)?.[0] as () => { meta: unknown }
    expect(typeof entry).toBe('function')
    expect(entry().meta).toEqual([])
    current.value = { matched: [{ meta: { auth: true } }] }
    expect(entry().meta).toEqual(NOINDEX)
  })
})
