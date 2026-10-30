// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import * as loader from '../../website/modules/deferred-backend-client/runtime/loader'
import { BackendClientChunkError } from '../../website/modules/deferred-backend-client/runtime/loader'
import * as liveDemo from '../../website/utils/live-demo'
import { DEMO_STATUS, demoDeployment } from '../../website/utils/live-demo'
import { component, NuxtLink } from './sfc'

// The docs' live demos, run in a DOM: a `::demo-*` block is a <DemoBlock>,
// which holds its live part in <DeferredBackend> until the backend client
// has loaded. Nothing loads before the block scrolls into view, or, for a
// demo that waits for the reader (signing in), before they start it; a
// reader on a keyboard keeps their place throughout.

type Status = 'unavailable' | 'deferred' | 'loaded'

/** The deferred client plugin's two calls, with a load the test settles by hand: `true`, or the failure. */
function client(status: Status = 'deferred') {
  const state = { status, settle: (_outcome: true | Error) => {} }
  const load = vi.fn(() => new Promise<void>((resolve, reject) => {
    state.settle = (outcome) => {
      if (outcome === true) {
        state.status = 'loaded'
        resolve()
      }
      else {
        reject(outcome)
      }
    }
  }))
  return { state, load, nuxtApp: { $loadBackendClient: load, $backendClientStatus: () => state.status } }
}

/** A plugin that failed to start: no chunk problem, so trying again may help. */
const broken = () => new Error('plugin')
/** The client's chunk would not fetch, as the loader reports it. */
const missingChunk = () => new BackendClientChunkError(new TypeError('Failed to fetch dynamically imported module'))

/** IntersectionObserver as the test drives it: `enter()` scrolls every observed block into view. */
class Observer {
  static all: Observer[] = []
  observed: Element[] = []
  callback: (entries: Array<{ isIntersecting: boolean }>) => void
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    this.callback = callback
    Observer.all.push(this)
  }

  observe(element: Element) {
    this.observed.push(element)
  }

  disconnect() {
    this.observed = []
  }

  static enter() {
    for (const observer of Observer.all) if (observer.observed.length) observer.callback([{ isIntersecting: true }])
  }
}

beforeEach(() => {
  Observer.all = []
  vi.stubGlobal('IntersectionObserver', Observer)
  reloadNuxtApp.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

/** The live part a demo would load lazily: here, a marked paragraph. */
const Live = defineComponent({ setup: () => () => h('p', { 'data-live': '' }, 'live') })

const reloadNuxtApp = vi.fn()

function parts(nuxtApp: object, url = 'https://happy-otter-123.convex.cloud') {
  const globals = { useNuxtApp: () => nuxtApp, useRuntimeConfig: () => ({ public: { convex: { url } } }), reloadNuxtApp }
  return {
    DeferredBackend: component('website/components/DeferredBackend.vue', { '../modules/deferred-backend-client/runtime/loader': loader }, globals),
    DemoBlock: component('website/components/DemoBlock.vue', { '../utils/live-demo': liveDemo }, globals),
    Key: component('website/components/Key.vue'),
    Led: component('website/components/Led.vue'),
    NuxtLink,
  }
}

function demo(nuxtApp: object, props: Record<string, unknown> = {}, url?: string) {
  const components = parts(nuxtApp, url)
  return mount(components.DemoBlock, {
    props: { title: 'Sign in with a code', api: 'useLoginFlow()', playground: '/playground/platform/account', ...props },
    slots: { default: () => h(Live), about: () => 'What it shows.' },
    global: { components },
    attachTo: document.body,
  })
}

describe('a demo the reader starts (load="click")', () => {
  it('loads nothing until the start key is pressed, then renders its live part', async () => {
    const backend = client()
    const block = demo(backend.nuxtApp, { load: 'click' })
    await flushPromises()
    Observer.enter()
    expect(backend.load).not.toHaveBeenCalled()
    expect(block.find('[data-live]').exists()).toBe(false)
    expect(block.text()).toContain('Live demo · Ready')
    expect(block.text()).toContain('Nothing loads until you start it')

    const start = block.get('button.k-go')
    expect(start.text()).toBe('Start the demo')
    await start.trigger('click')
    expect(backend.load).toHaveBeenCalledOnce()
    expect(block.text()).toContain('Live demo · Connecting')
    expect(block.get('[data-deferred-backend]').attributes('aria-busy')).toBe('true')

    backend.state.settle(true)
    await flushPromises()
    expect(block.find('[data-live]').exists()).toBe(true)
    expect(block.text()).toContain('Live demo · Live')
    expect(block.find('button.k-go').exists()).toBe(false)
    block.unmount()
  })

  // The key the reader pressed goes away with the fallback: focus moves into
  // the block, not to the page, and the key stays focusable while it loads.
  it('keeps a keyboard reader\'s place: a focusable busy key, then focus in the live block', async () => {
    const backend = client()
    const block = demo(backend.nuxtApp, { load: 'click' })
    await flushPromises()
    const start = block.get('button.k-go')
    expect(start.attributes('type')).toBe('button')
    ;(start.element as HTMLButtonElement).focus()
    await start.trigger('click')
    expect(start.attributes('disabled')).toBeUndefined()
    expect(start.attributes('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(start.element)

    backend.state.settle(true)
    await flushPromises()
    const live = block.get('[data-deferred-backend]')
    expect(live.attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(live.element)
    block.unmount()
  })

  it('says it failed and tries again on the same key, which keeps focus', async () => {
    const backend = client()
    const block = demo(backend.nuxtApp, { load: 'click' })
    await flushPromises()
    const start = block.get('button.k-go')
    ;(start.element as HTMLButtonElement).focus()
    await start.trigger('click')
    backend.state.settle(broken())
    await flushPromises()
    expect(block.text()).toContain('Live demo · Offline')
    expect(block.text()).toContain('could not connect')

    const retry = block.get('button.k-go')
    expect(retry.element).toBe(start.element)
    expect(retry.text()).toBe('Try again')
    expect(document.activeElement).toBe(start.element)
    await retry.trigger('click')
    expect(backend.load).toHaveBeenCalledTimes(2)
    backend.state.settle(true)
    await flushPromises()
    expect(block.find('[data-live]').exists()).toBe(true)
    block.unmount()
  })

  // A tab left open across a deploy asks for a chunk the build no longer
  // has: the same URL cannot load again, so the key reloads the page.
  it('offers to reload a page that outlived the deploy that built it, on the same key', async () => {
    const backend = client()
    const block = demo(backend.nuxtApp, { load: 'click' })
    await flushPromises()
    const start = block.get('button.k-go')
    ;(start.element as HTMLButtonElement).focus()
    await start.trigger('click')
    backend.state.settle(missingChunk())
    await flushPromises()
    expect(block.text()).toContain('Live demo · Out of date')
    expect(block.text()).toContain('Reload the page to run it')
    const reload = block.get('button.k-go')
    expect(reload.element).toBe(start.element)
    expect(reload.text()).toBe('Reload the page')
    expect(document.activeElement).toBe(start.element)

    await reload.trigger('click')
    expect(reloadNuxtApp).toHaveBeenCalledWith({ persistState: true, force: true })
    expect(backend.load).toHaveBeenCalledOnce()
    block.unmount()
  })

  // Offline, a reload would only show the browser's own error page.
  it('asks an offline reader to check their connection, and tries again', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const backend = client()
    const block = demo(backend.nuxtApp, { load: 'click' })
    await flushPromises()
    await block.get('button.k-go').trigger('click')
    backend.state.settle(missingChunk())
    await flushPromises()
    expect(block.text()).toContain('Live demo · Offline')
    expect(block.text()).toContain('Check your connection')
    await block.get('button.k-go').trigger('click')
    expect(reloadNuxtApp).not.toHaveBeenCalled()
    expect(backend.load).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
    block.unmount()
  })

  it('goes live at once on a page that loaded the client already', async () => {
    const backend = client('loaded')
    const block = demo(backend.nuxtApp, { load: 'click' })
    await flushPromises()
    expect(block.find('[data-live]').exists()).toBe(true)
    expect(block.text()).toContain('Live demo · Live')
    expect(backend.load).not.toHaveBeenCalled()
    // Nobody pressed a key: focus stays where the reader is.
    expect(block.get('[data-deferred-backend]').attributes('tabindex')).toBeUndefined()
    block.unmount()
  })
})

describe('a demo that only reads (load="visible")', () => {
  it('loads the client when it scrolls into view, and not before', async () => {
    const backend = client()
    const block = demo(backend.nuxtApp)
    await flushPromises()
    expect(backend.load).not.toHaveBeenCalled()
    expect(block.find('button.k-go').exists()).toBe(false)
    // Unlit and Ready, so not "Connecting" yet: nothing is loading.
    expect(block.text()).toContain('Live demo · Ready')
    expect(block.text()).toContain('It connects when it scrolls into view.')
    expect(block.text()).not.toContain('Connecting')

    Observer.enter()
    await nextTick()
    expect(backend.load).toHaveBeenCalledOnce()
    expect(block.text()).toContain('Live demo · Connecting')
    expect(block.text()).toContain('Connecting to the backend…')
    backend.state.settle(true)
    await flushPromises()
    expect(block.find('[data-live]').exists()).toBe(true)
    block.unmount()
  })

  it('offers a retry when it fails, and keeps the key while the retry loads', async () => {
    const backend = client()
    const block = demo(backend.nuxtApp)
    await flushPromises()
    Observer.enter()
    backend.state.settle(broken())
    await flushPromises()
    const retry = block.get('button.k-xs')
    expect(retry.text()).toBe('Try again')
    await retry.trigger('click')
    expect(backend.load).toHaveBeenCalledTimes(2)
    expect(block.get('button.k-xs').element).toBe(retry.element)
    expect(retry.attributes('aria-busy')).toBe('true')
    backend.state.settle(true)
    await flushPromises()
    expect(block.find('[data-live]').exists()).toBe(true)
    block.unmount()
  })
})

describe('a build without a backend', () => {
  it.each(['click', 'visible'])('says so at once, and loads nothing (load="%s")', async (load) => {
    const backend = client('unavailable')
    const block = demo(backend.nuxtApp, { load }, '')
    await flushPromises()
    Observer.enter()
    expect(backend.load).not.toHaveBeenCalled()
    expect(block.text()).toContain('Live demo · No backend')
    expect(block.text()).toContain('pnpm dev')
    expect(block.find('button.k-go').exists()).toBe(false)
    // No deployment to name in the footer either.
    expect(block.text()).not.toContain('Runs against')
    block.unmount()
  })
})

describe('the frame', () => {
  it('names the demo, its call, its deployment and its playground page', async () => {
    const block = demo(client().nuxtApp, { load: 'click' })
    await flushPromises()
    const section = block.get('section')
    const title = block.get(`#${section.attributes('aria-labelledby')}`)
    expect(title.text()).toBe('Sign in with a code')
    expect(block.get('code').text()).toBe('useLoginFlow()')
    expect(block.text()).toContain('What it shows.')
    expect(block.text()).toContain('Runs against happy-otter-123.convex.cloud')
    expect(block.get('a[href="/playground/platform/account"]').text()).toBe('Open in the playground')
    block.unmount()
  })

  // Locally the site runs against your own deployment: the footer says so.
  it('says when the deployment runs on this machine', async () => {
    const block = demo(client().nuxtApp, {}, 'http://127.0.0.1:3210')
    await flushPromises()
    expect(block.text()).toContain('Runs against 127.0.0.1:3210, on this machine')
    block.unmount()
  })

  // Prerendered: the fallback and the mark the bundle check reads, never the
  // live part, and no call for the client (the plugin runs in the browser).
  it('renders on the server without the client', async () => {
    const components = parts({})
    const app = createSSRApp({ render: () => h(components.DemoBlock, { title: 'A live counter', load: 'click' }, { default: () => h(Live) }) })
    for (const [name, part] of Object.entries(components)) app.component(name, part)
    const html = await renderToString(app)
    expect(html).toContain('data-deferred-backend')
    expect(html).toContain('data-state="idle"')
    expect(html).not.toContain('data-live')
    expect(html).toContain('Start the demo')
  })
})

describe('the deployment a demo names', () => {
  it.each([
    ['https://happy-otter-123.convex.cloud', { host: 'happy-otter-123.convex.cloud', local: false }],
    ['http://127.0.0.1:3210', { host: '127.0.0.1:3210', local: true }],
    ['http://localhost:3210', { host: 'localhost:3210', local: true }],
    ['http://[::1]:3210', { host: '[::1]:3210', local: true }],
    ['https://convex.nuxt-backend.localhost', { host: 'convex.nuxt-backend.localhost', local: true }],
  ])('%s', (url, expected) => {
    expect(demoDeployment(url)).toEqual(expected)
  })

  it('is none without a URL, or with one that does not parse', () => {
    expect(demoDeployment(undefined)).toBeUndefined()
    expect(demoDeployment('')).toBeUndefined()
    expect(demoDeployment('not a url')).toBeUndefined()
  })

  it('tells every state by a word as well as its light', () => {
    const words = Object.values(DEMO_STATUS).map(status => status.word)
    expect(new Set(words).size).toBe(words.length)
  })
})
