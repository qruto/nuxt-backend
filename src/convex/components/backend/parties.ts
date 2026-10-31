import { v } from 'convex/values'
import type { QueryCtx } from './_generated/server.js'
import type { Doc } from './_generated/dataModel.js'
import { BACKEND_EVENTS, isBackendEventType } from '../../events.js'

// How the audit trail and the notifications name people: the pseudonym an
// erased account's id becomes, the names a page reads once, and whether an
// administrator is the one who acted.

/** What an erased account's ids become: one pseudonym per erasure, the same in every row it rewrites. */
export const ERASED_PREFIX = 'erased:'

/**
 * Who someone named is to the reader: `you`, the reader; `user`, another
 * account, by its name; `administrator`, an administrator, unnamed to the
 * account they acted on; `app`, nobody signed in (a webhook, a job);
 * `erased`, an account since erased.
 */
export const vPartyKind = v.union(v.literal('you'), v.literal('user'), v.literal('administrator'), v.literal('app'), v.literal('erased'))

/** The names a page reads, each once. */
export function nameReader(ctx: QueryCtx) {
  const users = new Map<string, Promise<string | null>>()
  const workspaces = new Map<string, Promise<string | null>>()
  const cached = (cache: Map<string, Promise<string | null>>, key: string, read: () => Promise<string | null>) => {
    if (!cache.has(key)) cache.set(key, read())
    return cache.get(key)!
  }
  return {
    user: (id: string) => cached(users, id, async () => {
      const userId = ctx.db.normalizeId('user', id)
      return userId ? (await ctx.db.get('user', userId))?.name ?? null : null
    }),
    workspace: (id: string) => cached(workspaces, id, async () => {
      const workspaceId = ctx.db.normalizeId('organization', id)
      return workspaceId ? (await ctx.db.get('organization', workspaceId))?.name ?? null : null
    }),
  }
}

/** Someone a row names, as its reader may know them (`id` is null for anyone unnamed). */
export interface NamedParty {
  kind: 'you' | 'user' | 'administrator' | 'app' | 'erased'
  id: string | null
  name: string | null
}

/**
 * Who an id is to the reader: `app` for none, `erased` for an account since
 * erased, `you` for the reader, `administrator` (unnamed) when an
 * administrator acted on the reader's account, else the other account by its
 * name.
 */
export async function partyOf(names: ReturnType<typeof nameReader>, id: string | undefined, viewerId: string, administrator: boolean): Promise<NamedParty> {
  if (id === undefined) return { kind: 'app', id: null, name: null }
  if (id.startsWith(ERASED_PREFIX)) return { kind: 'erased', id: null, name: null }
  if (id === viewerId) return { kind: 'you', id, name: await names.user(id) }
  if (administrator) return { kind: 'administrator', id: null, name: null }
  return { kind: 'user', id, name: await names.user(id) }
}

/**
 * Whether the actor of a row is an administrator acting on the account the
 * row is about: unnamed in that account's own activity, which says only that
 * an administrator did it. In a package kind of an account's own, only an
 * administrator acts on another account (a role set, a visit, a device
 * signed out from the admin routes), whatever the kind's area; an app's own
 * kinds name whoever acted.
 */
export function administratorActs(row: Pick<Doc<'auditEvents'>, 'type' | 'actorId' | 'subjectId'>): boolean {
  return isBackendEventType(row.type)
    && BACKEND_EVENTS[row.type].scope === 'account'
    && row.actorId !== undefined
    && row.actorId !== row.subjectId
}
