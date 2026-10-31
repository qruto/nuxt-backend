import { beforeAll, describe, expect, it, vi } from 'vitest'
import { useNuxtApp } from '#imports'
import { backendError } from '../../src/convex/errors'

// The monitoring layer's capture plugin over a stand-in for the SDK: an
// event about a refusal from the error catalog is dropped, one about a
// failed call is tagged with its function, and a composable's failed action
// is reported unless it is a refusal. How a failure is read loads with the
// first one, so every check waits on the processor's answer.

const sdk = vi.hoisted(() => ({
  processors: [] as Array<(event: { tags?: Record<string, unknown> }, hint: { originalException: unknown }) => unknown>,
  captured: [] as Array<{ error: unknown, tags: Record<string, unknown> }>,
}))

vi.mock('@sentry/nuxt', () => ({
  addEventProcessor: (processor: (typeof sdk.processors)[number]) => sdk.processors.push(processor),
  captureException: (error: unknown, context: { tags: Record<string, unknown> }) => sdk.captured.push({ error, tags: context.tags }),
}))

const { default: plugin } = await import('../../src/runtime/monitoring/sdk/capture.client')

describe('the capture plugin', () => {
  let app: ReturnType<typeof useNuxtApp>
  let processor: (typeof sdk.processors)[number]
  beforeAll(() => {
    app = useNuxtApp()
    ;(plugin as unknown as { setup: (nuxtApp: typeof app) => void }).setup(app)
    processor = sdk.processors[0]!
  })

  it('drops an event about a catalog refusal, and tags one about a failed call', async () => {
    expect(await processor({}, { originalException: backendError('unauthenticated') })).toBeNull()
    const crash = new Error('[CONVEX M(billing:checkout)] Server Error')
    expect(await processor({ tags: { kept: 'yes' } }, { originalException: crash })).toEqual({ tags: expect.objectContaining({ 'kept': 'yes', 'backend.function': 'billing:checkout' }) })
    const plain = new Error('a page\'s own')
    expect(await processor({}, { originalException: plain })).toEqual({})
  })

  it('reports a failed action the app handled, and never a refusal', async () => {
    const crash = new Error('[CONVEX A(ai:transform)] Server Error')
    // The package's own hook, which the app's hook types do not list.
    const callHook = app.callHook.bind(app) as unknown as (name: string, context: { cause: unknown }) => Promise<void>
    await callHook('backend:error', { cause: backendError('unauthenticated') })
    await callHook('backend:error', { cause: crash })
    expect(sdk.captured.map(entry => entry.error)).toEqual([crash])
    expect(sdk.captured[0]!.tags).toMatchObject({ 'backend.function': 'ai:transform', 'backend.source': 'browser' })
  })
})
