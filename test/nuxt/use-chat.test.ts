import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { makeFunctionReference } from 'convex/server'
import { ConvexError } from 'convex/values'
import type { OptimisticLocalStore } from 'convex/browser'
import { ConvexVueClient } from 'nuxt-convex-module/client'
import { mountWithConvex } from '../helpers/vue_test_utils'
import { silentConnectLogger } from '../helpers/silent-logger'
import { type ChatApiRefs, useChat } from '../../src/runtime/vue/composables/use-chat'

// useChat against a real client: the threads and the messages are seeded as
// optimistic results, the send and the remove are spied on.

const refs = {
  threads: makeFunctionReference<'query'>('chat:threads'),
  messages: makeFunctionReference<'query'>('chat:messages'),
  send: makeFunctionReference<'mutation'>('chat:send'),
  remove: makeFunctionReference<'mutation'>('chat:remove'),
}
const api = refs as unknown as ChatApiRefs
const seedRef = makeFunctionReference<'mutation'>('seed:default')

let client: ConvexVueClient

function seed(setup: (store: OptimisticLocalStore) => void) {
  void client.mutation(seedRef, {}, { optimisticUpdate: setup })
}

const firstPage = (threadId: string, numItems = 20) => ({ threadId, paginationOpts: { numItems, cursor: null } })

/** A page as the server answers it: newest first. */
const page = (...messages: Array<{ id: string, role: 'user' | 'assistant', text: string, status: string }>) => ({ page: [...messages].reverse(), isDone: true, continueCursor: '' })

beforeEach(() => {
  client = new ConvexVueClient('https://127.0.0.1:3001', { logger: silentConnectLogger })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useChat', () => {
  it('shows the threads, and the open thread oldest first with the reply being written', async () => {
    seed((store) => {
      store.setQuery(refs.threads, {}, [{ id: 't1', title: 'A fox', updatedAt: 1 }])
      store.setQuery(refs.messages, firstPage('t1'), page(
        { id: 'm1', role: 'user', text: 'A fox', status: 'done' },
        { id: 'm2', role: 'assistant', text: 'Once upon', status: 'streaming' },
      ))
    })
    const { result } = await mountWithConvex(client, () => useChat(api, { threadId: 't1' }))
    await flushPromises()

    expect(result.threads.value).toEqual([{ id: 't1', title: 'A fox', updatedAt: 1 }])
    expect(result.messages.value.map(message => message.text)).toEqual(['A fox', 'Once upon'])
    expect(result.status.value).toBe('streaming')
    expect(result.error.value).toBeNull()
  })

  it('starts a thread on the first send, and opens it', async () => {
    const mutation = vi.spyOn(client, 'mutation').mockResolvedValue('t9')
    const { result } = await mountWithConvex(client, () => useChat(api))

    expect(result.threadId.value).toBeUndefined()
    expect(await result.send('Hello')).toBe('t9')
    expect(mutation).toHaveBeenCalledWith(api.send, { text: 'Hello' }, expect.anything())
    expect(result.threadId.value).toBe('t9')

    await result.send('Again')
    expect(mutation).toHaveBeenLastCalledWith(api.send, { text: 'Again', threadId: 't9' }, expect.anything())

    result.newThread()
    expect(result.threadId.value).toBeUndefined()
  })

  it('rejects a refused send with what the server threw, and shows it in error', async () => {
    const refusal = new ConvexError({ code: 'insufficient_credits', meter: 'credits', balance: 5, need: 20 })
    vi.spyOn(client, 'mutation').mockRejectedValue(refusal)
    const { result } = await mountWithConvex(client, () => useChat(api))

    await expect(result.send('Too dear')).rejects.toBe(refusal)
    expect(result.status.value).toBe('error')
    expect(result.error.value).toMatchObject({ code: 'insufficient_credits', data: { balance: 5, need: 20 } })
  })

  it('reads a reply that could not be written as an error', async () => {
    seed(store => store.setQuery(refs.messages, firstPage('t1'), page(
      { id: 'm1', role: 'user', text: 'Hello?', status: 'done' },
      { id: 'm2', role: 'assistant', text: '', status: 'failed' },
    )))
    const { result } = await mountWithConvex(client, () => useChat(api, { threadId: 't1' }))
    await flushPromises()

    expect(result.status.value).toBe('error')
    expect(result.error.value).toMatchObject({ code: 'unavailable', data: { reason: 'provider_refused' } })
  })

  it('follows the thread a getter names, and loads older messages on demand', async () => {
    seed(store => store.setQuery(refs.messages, firstPage('t2'), { page: [{ id: 'm3', role: 'user', text: 'Newest', status: 'done' }], isDone: false, continueCursor: 'c' }))
    const open = ref<string | undefined>('t1')
    const { result } = await mountWithConvex(client, () => useChat(api, { threadId: () => open.value }))

    open.value = 't2'
    await flushPromises()
    expect(result.threadId.value).toBe('t2')
    expect(result.canLoadMore.value).toBe(true)
    const watched = vi.spyOn(client, 'watchQuery')
    result.loadMore()
    await flushPromises()
    expect(watched).toHaveBeenCalledWith(api.messages, firstPage('t2', 40), expect.anything())
  })

  it('removes a thread, closing it when it was open', async () => {
    const mutation = vi.spyOn(client, 'mutation').mockResolvedValue(null)
    const { result } = await mountWithConvex(client, () => useChat(api, { threadId: 't1' }))

    await result.remove('t1')
    expect(mutation).toHaveBeenCalledWith(api.remove, { threadId: 't1' }, expect.anything())
    expect(result.threadId.value).toBeUndefined()
  })
})
