import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient } from 'nuxt-convex-module/client'
import { failClientQuery, mountWithConvex } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
import { useAiStream } from '../../src/runtime/vue/composables/use-ai-stream'

// useAiStream against a real client: the start action and the persisted body
// go through ConvexVueClient (the body seeded as an optimistic result), and
// the stream endpoint is a stubbed fetch.

const startRef = makeFunctionReference<'action'>('ai:startEcho')
const bodyRef = makeFunctionReference<'query'>('ai:echoBody')
const seedRef = makeFunctionReference<'mutation'>('seed:default')
const url = 'https://site.test/ai/stream'
const unexpected = { code: 'unavailable', data: { service: 'backend', reason: 'unexpected' }, message: 'Something went wrong.' }

let client: ConvexVueClient

function seed(setup: (store: OptimisticLocalStore) => void) {
  void client.mutation(seedRef, {}, { optimisticUpdate: setup })
}

/** A stream endpoint answering with these chunks, one after another. */
function streaming(...chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }))
}

/** A stream endpoint whose first drive hangs until it is aborted, and whose next ones stream `text`. */
function hangingThenStreaming(text: string) {
  const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    if (fetch.mock.calls.length > 1) resolve(streaming(text))
    else init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
  }))
  return fetch
}

const mountStream = (options: Parameters<typeof useAiStream>[1] = { url }) =>
  mountWithConvex(client, () => useAiStream({ start: startRef, body: bodyRef }, options))

beforeEach(() => {
  client = new ConvexVueClient('https://127.0.0.1:3001', { logger: silentConnectLogger })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useAiStream', () => {
  it('drives a started stream to done, with no error', async () => {
    vi.spyOn(client, 'action').mockResolvedValue({ streamId: 's1' })
    const fetch = vi.fn(async () => streaming('stre', 'amed'))
    vi.stubGlobal('fetch', fetch)
    const { result } = await mountStream()

    expect(await result.start({ prompt: 'hi' })).toBe('s1')
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'POST', body: JSON.stringify({ streamId: 's1' }) }))
    expect(result.text.value).toBe('streamed')
    expect(result.status.value).toBe('done')
    expect(result.streamId.value).toBe('s1')
    expect(result.error.value).toBeNull()
  })

  it('is pending while the server has not accepted the start', async () => {
    let accept!: (value: { streamId: string }) => void
    vi.spyOn(client, 'action').mockImplementationOnce(() => new Promise((resolve) => {
      accept = resolve as never
    }))
    vi.stubGlobal('fetch', vi.fn(async () => streaming('ok')))
    const { result } = await mountStream()

    expect(result.isPending.value).toBe(false)
    const starting = result.start()
    expect(result.isPending.value).toBe(true)
    expect(result.status.value).toBe('pending')
    accept({ streamId: 's1' })
    await starting
    expect(result.isPending.value).toBe(false)
  })

  it('ends a refused start in error, with the refusal in error, and rejects', async () => {
    const refusal = new ConvexError({ code: 'insufficient_credits', meter: 'credits', balance: 0, need: 1 })
    vi.spyOn(client, 'action').mockRejectedValue(refusal)
    const { result } = await mountStream()

    await expect(result.start({ prompt: 'hi' })).rejects.toBe(refusal)
    expect(result.status.value).toBe('error')
    expect(result.isStreaming.value).toBe(false)
    expect(result.isPending.value).toBe(false)
    expect(result.error.value).toEqual({
      code: 'insufficient_credits',
      data: { meter: 'credits', balance: 0, need: 1 },
      message: 'Not enough credits: 0 left, 1 needed. Top up to continue.',
    })
  })

  it('reads a start that failed without a code as unavailable, and clears the last refusal first', async () => {
    seed(store => store.setQuery(bodyRef, { streamId: 's1' }, { text: 'earlier', status: 'done' }))
    const refusal = new ConvexError({ code: 'rate_limited', limit: 'ai', retryAfter: 2000 })
    const action = vi.spyOn(client, 'action').mockRejectedValueOnce(refusal)
    const { result } = await mountStream({ url, streamId: 's1' })
    expect(result.status.value).toBe('done')

    await expect(result.start()).rejects.toBe(refusal)
    expect(result.status.value).toBe('error')
    expect(result.error.value).toMatchObject({ code: 'rate_limited' })

    const offline = new Error('offline')
    action.mockRejectedValueOnce(offline)
    await expect(result.start()).rejects.toBe(offline)
    expect(result.error.value).toEqual(unexpected)
    expect((result.error.value as { cause?: unknown }).cause).toBe(offline)
    expect(result.status.value).toBe('error')
  })

  it('says why when there is no stream endpoint', async () => {
    const endpoint = ref<string | undefined>(url)
    vi.spyOn(client, 'action').mockRejectedValue(new ConvexError({ code: 'unauthenticated' }))
    const { result } = await mountStream({ url: endpoint })
    await expect(result.start()).rejects.toBeTruthy()
    expect(result.error.value).toMatchObject({ code: 'unauthenticated' })

    endpoint.value = undefined
    await expect(result.start()).rejects.toThrow(/no stream endpoint/)
    expect(result.error.value).toMatchObject({ code: 'unavailable', message: expect.stringMatching(/no stream endpoint/) })
    expect(result.status.value).toBe('error')
    expect(result.isPending.value).toBe(false)

    // A first start with no endpoint ends in error too, not idle.
    const fresh = await mountStream({ url: undefined })
    await expect(fresh.result.start()).rejects.toThrow(/no stream endpoint/)
    expect(fresh.result.status.value).toBe('error')
  })

  it('puts a failed drive in error and follows the persisted body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(client, 'action').mockResolvedValue({ streamId: 's1' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unknown or finished stream', { status: 404 })))
    seed(store => store.setQuery(bodyRef, { streamId: 's1' }, { text: 'saved so far', status: 'streaming' }))
    const { result } = await mountStream()

    await result.start()
    await flushPromises()
    expect(result.error.value).toEqual(unexpected)
    expect(result.text.value).toBe('saved so far')
    expect(result.status.value).toBe('streaming')
  })

  it('lets a newer start replace a drive: pending meanwhile, no failure, nothing logged', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    let accept!: (value: { streamId: string }) => void
    vi.spyOn(client, 'action')
      .mockResolvedValueOnce({ streamId: 's1' })
      .mockImplementationOnce(() => new Promise((resolve) => {
        accept = resolve as never
      }))
    vi.stubGlobal('fetch', hangingThenStreaming('second'))
    const { result } = await mountStream()

    await result.start()
    const second = result.start()
    await flushPromises()
    // The first drive's abort lands while the second start waits: it must
    // not read as idle, or as a failure.
    expect(result.status.value).toBe('pending')
    expect(result.isPending.value).toBe(true)
    accept({ streamId: 's2' })
    await second
    await flushPromises()
    expect(result.error.value).toBeNull()
    expect(result.status.value).toBe('done')
    expect(result.text.value).toBe('second')
    expect(logged).not.toHaveBeenCalled()
  })

  it('drives only the latest of two overlapping starts, and is pending until it is accepted', async () => {
    const accepts: Array<(value: { streamId: string }) => void> = []
    vi.spyOn(client, 'action').mockImplementation(() => new Promise((resolve) => {
      accepts.push(resolve as never)
    }))
    const fetch = vi.fn(async () => streaming('latest'))
    vi.stubGlobal('fetch', fetch)
    const { result } = await mountStream()

    const first = result.start()
    const second = result.start()
    accepts[0]!({ streamId: 's1' })
    expect(await first).toBe('s1')
    // The older start settling says nothing about the latest one.
    expect(result.isPending.value).toBe(true)
    expect(result.status.value).toBe('pending')
    accepts[1]!({ streamId: 's2' })
    expect(await second).toBe('s2')
    await flushPromises()
    expect(result.isPending.value).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ body: JSON.stringify({ streamId: 's2' }) }))
    expect(result.streamId.value).toBe('s2')
    expect(result.text.value).toBe('latest')
  })

  it('stops at once: idle, nothing pending, and a start that resolves later drives nothing', async () => {
    let accept!: (value: { streamId: string }) => void
    vi.spyOn(client, 'action').mockImplementationOnce(() => new Promise((resolve) => {
      accept = resolve as never
    }))
    const fetch = vi.fn(async () => streaming('late'))
    vi.stubGlobal('fetch', fetch)
    const { result } = await mountStream()

    const starting = result.start()
    result.stop()
    expect(result.status.value).toBe('idle')
    expect(result.isPending.value).toBe(false)
    accept({ streamId: 's1' })
    await starting
    await flushPromises()
    expect(fetch).not.toHaveBeenCalled()
    expect(result.status.value).toBe('idle')
  })

  it('puts a failed read of an attached stream in error instead of throwing', async () => {
    failClientQuery(client, bodyRef, new ConvexError({ code: 'forbidden', reason: 'not_owner' }))
    const { result } = await mountStream({ url, streamId: 's-foreign' })
    expect(result.error.value).toMatchObject({ code: 'forbidden', data: { reason: 'not_owner' } })
    expect(result.text.value).toBe('')
  })
})
