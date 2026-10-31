import { describe, expect, it, vi } from 'vitest'
import { expandAiExport } from '../../src/convex/integrations/ai/account-export'

// An account export reads chat messages and knowledge passages through the
// handles the backend component's rows carry, and never hands the handles on.

describe('the AI part of an account export', () => {
  it('reads each thread\'s messages and each document\'s text through its handle', async () => {
    const runQuery = vi.fn(async (handle: string, args: Record<string, unknown>) => handle === 'function://agent;messages:listMessagesByThreadId'
      ? { page: [
          { _creationTime: 0, text: 'A fox', message: { role: 'user' }, status: 'success' },
          { _creationTime: 1000, text: 'Once upon a time', message: { role: 'assistant' }, status: 'success' },
          { _creationTime: 2000, message: { role: 'tool' } },
        ], args }
      : { page: [{ text: 'First passage.' }, { text: 'Second passage.' }] })
    const data = {
      chats: [{ threadId: 't1', chat: 'helper', owner: 'org_1', title: 'A fox', updatedAt: 5, read: 'function://agent;messages:listMessagesByThreadId' }],
      knowledge: [{ id: 'd1', owner: 'org_1', title: 'Notes', status: 'ready', entryId: 'e1', createdAt: 3, read: 'function://rag;chunks:list' }],
    }

    const expanded = await expandAiExport({ runQuery } as never, data)

    expect(expanded).toEqual({
      chats: [{ threadId: 't1', chat: 'helper', owner: 'org_1', title: 'A fox', updatedAt: 5, messages: [
        { role: 'user', text: 'A fox', status: 'success', at: new Date(0).toISOString() },
        { role: 'assistant', text: 'Once upon a time', status: 'success', at: new Date(1000).toISOString() },
      ] }],
      knowledge: [{ id: 'd1', owner: 'org_1', title: 'Notes', status: 'ready', entryId: 'e1', createdAt: 3, text: 'First passage.\nSecond passage.' }],
    })
    expect(runQuery).toHaveBeenCalledWith('function://agent;messages:listMessagesByThreadId', expect.objectContaining({ threadId: 't1', order: 'asc' }))
  })

  it('keeps a row whose component cannot be read, with what it could not read left null', async () => {
    const runQuery = vi.fn(async () => {
      throw new Error('Component not found')
    })
    const expanded = await expandAiExport({ runQuery } as never, { chats: [{ threadId: 't1', chat: 'helper', owner: 'org_1', title: 'x', updatedAt: 1, read: 'h' }], knowledge: [] })
    expect(expanded).toEqual({ chats: [expect.objectContaining({ threadId: 't1', messages: null })], knowledge: [] })
  })

  it('adds nothing for an account with neither', async () => {
    expect(await expandAiExport({ runQuery: vi.fn() } as never, { chats: [], knowledge: [] })).toEqual({})
  })
})
