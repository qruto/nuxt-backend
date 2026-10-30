import type { FunctionHandle, GenericActionCtx, GenericDataModel } from 'convex/server'

// What an account export adds for chat and knowledge search: the backend
// component lists the account's threads and the documents it added, each
// with a handle into the app's Agent or RAG component; the export reads
// the messages and the passages through those handles, here in the app.

/** The most messages, or passages, one thread's or document's export carries. */
const EXPORT_ITEMS_MAX = 1000

interface ThreadExportRow { threadId: string, chat: string, owner: string, title: string, updatedAt: number, read: string }
interface DocumentExportRow { id: string, owner: string, title: string, key?: string, status: string, entryId?: string, createdAt: number, read: string }

type ReadCtx = Pick<GenericActionCtx<GenericDataModel>, 'runQuery'>

const page = { cursor: null, numItems: EXPORT_ITEMS_MAX }

/** A thread's messages, oldest first: who wrote each, its text and when. */
async function threadMessages(ctx: ReadCtx, row: ThreadExportRow) {
  const listed = await ctx.runQuery(row.read as FunctionHandle<'query'>, { threadId: row.threadId, order: 'asc', paginationOpts: page }) as { page?: Array<{ _creationTime: number, text?: string, message?: { role?: string }, status?: string }> }
  return (listed.page ?? [])
    .filter(message => message.message?.role === 'user' || message.message?.role === 'assistant')
    .map(message => ({ role: message.message!.role, text: message.text ?? '', status: message.status ?? null, at: new Date(message._creationTime).toISOString() }))
}

/** A document's text, as its passages hold it. */
async function documentText(ctx: ReadCtx, row: DocumentExportRow): Promise<string | null> {
  if (!row.entryId) return null
  const listed = await ctx.runQuery(row.read as FunctionHandle<'query'>, { entryId: row.entryId, order: 'asc', paginationOpts: page }) as { page?: Array<{ text: string }> }
  return (listed.page ?? []).map(chunk => chunk.text).join('\n')
}

/**
 * The export's `chats` and `knowledge`, read in full: each thread with its
 * messages, each document with its text. A thread or document whose
 * component cannot be read keeps its row, with what could not be read
 * left `null`.
 */
export async function expandAiExport(ctx: ReadCtx, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const chats = Array.isArray(data.chats) ? data.chats as ThreadExportRow[] : []
  const documents = Array.isArray(data.knowledge) ? data.knowledge as DocumentExportRow[] : []
  if (chats.length === 0 && documents.length === 0) return {}
  return {
    chats: await Promise.all(chats.map(async ({ read: _read, ...thread }) => ({
      ...thread,
      messages: await threadMessages(ctx, { read: _read, ...thread }).catch(() => null),
    }))),
    knowledge: await Promise.all(documents.map(async ({ read: _read, ...document }) => ({
      ...document,
      text: await documentText(ctx, { read: _read, ...document }).catch(() => null),
    }))),
  }
}
