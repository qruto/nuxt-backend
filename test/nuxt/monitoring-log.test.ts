import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { backendError } from '../../src/convex/errors'

// The dev-only plugin that copies what the browser captures to the dev
// server's local error log (DevTools › Monitoring): a composable's failed
// action, a Vue error, an app error and an unhandled rejection, each once,
// and never a refusal from the error catalog. The dev server's route is
// stood in for by `fetch`; nothing leaves the test.

const { default: plugin } = await import('../../src/runtime/vue/plugins/monitoring-log.client')

type Listener = (payload: unknown) => void
const hooks = new Map<string, Listener>()
const posted = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }))

/** What reached the log, as the dev server reads each entry. */
const entries = () => posted.mock.calls.map(([url, init]) => ({ url, method: init.method, keepalive: init.keepalive, entry: JSON.parse(String(init.body)) as Record<string, unknown> }))

beforeAll(() => {
  // The plugin's own hooks only: the app's other plugins stay out of the way.
  const app = { hook: (name: string, listener: Listener) => hooks.set(name, listener) }
  ;(plugin as unknown as { setup: (nuxtApp: typeof app) => void }).setup(app)
})
beforeEach(() => {
  vi.stubGlobal('fetch', posted)
  posted.mockClear()
})
afterEach(() => vi.unstubAllGlobals())

describe('the local error log plugin', () => {
  it('posts a failed call a composable reports, with its function and code, from the browser', () => {
    const crash = new Error('[CONVEX A(billing:checkout)] Server Error')
    hooks.get('backend:error')!({ error: { code: 'unexpected' }, cause: crash })
    const [sent] = entries()
    expect(sent).toMatchObject({ url: '/api/backend/_monitoring', method: 'POST', keepalive: true })
    expect(sent!.entry).toEqual({ at: expect.any(Number), source: 'browser', function: 'billing:checkout', code: 'none', message: crash.message })
  })

  it('posts a Vue error, an app error and an unhandled rejection, and an outage with what failed', () => {
    hooks.get('vue:error')!(new Error('render failed'))
    hooks.get('app:error')!(new Error('plugin failed'))
    const rejection = new Event('unhandledrejection') as Event & { reason: unknown }
    rejection.reason = backendError('unavailable', { service: 'email', reason: 'timeout' })
    window.dispatchEvent(rejection)
    expect(entries().map(sent => sent.entry)).toEqual([
      expect.objectContaining({ code: 'none', message: 'render failed' }),
      expect.objectContaining({ code: 'none', message: 'plugin failed' }),
      expect.objectContaining({ code: 'unavailable', reason: 'email/timeout' }),
    ])
  })

  it('leaves out a refusal from the error catalog: the app working as designed', () => {
    hooks.get('backend:error')!({ cause: backendError('unauthenticated') })
    hooks.get('vue:error')!(backendError('forbidden', { reason: 'not_admin' }))
    expect(posted).not.toHaveBeenCalled()
  })

  it('posts one error once, however many ways it was captured', () => {
    const crash = new Error('twice')
    hooks.get('backend:error')!({ cause: crash })
    hooks.get('vue:error')!(crash)
    // A value that is no object is posted each time: there is nothing to know it by.
    hooks.get('app:error')!('plain words')
    hooks.get('app:error')!('plain words')
    expect(entries().map(sent => sent.entry.message)).toEqual(['twice', 'plain words', 'plain words'])
  })

  it('loses only the entry when the dev server went away', async () => {
    posted.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(() => hooks.get('vue:error')!(new Error('offline'))).not.toThrow()
    // The rejection is caught: nothing reaches the page as unhandled.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(posted).toHaveBeenCalledOnce()
  })
})
