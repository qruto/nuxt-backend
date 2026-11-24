/**
 * Who is here: Convex's presence component, behind the backend's sign-in.
 * A heartbeat counts the signed-in account, never an id the browser names;
 * the room token it hands back is what lists the room, so only someone the
 * room let in reads who else is there, by name.
 *
 * Experimental: it follows the presence component's pre-1.0 shapes, so this
 * entry's shape may change in a minor release.
 *
 * @module
 * @experimental
 */
import { Presence } from '@convex-dev/presence'
import { v } from 'convex/values'
import { type FunctionReference, type GenericMutationCtx, type GenericDataModel, mutationGeneric, queryGeneric, type RegisteredMutation, type RegisteredQuery } from 'convex/server'
import { backendError } from '../errors.js'
import { ownCaller } from './access.js'

/** The presence component's handle, `components.presence`. */
type PresenceComponent = ConstructorParameters<typeof Presence>[0]

/** The component handles `setupPresence` reads: pass the whole generated `components` object. */
export interface PresenceComponents {
  presence: PresenceComponent
  backend: { adapter: { findOne: FunctionReference<'query', 'internal'> } }
}

/** Who a room may let in, asked on every heartbeat. */
export interface PresenceRoomCheck {
  /** The room the browser names, as `useRoomPresence` was given it. */
  roomId: string
  /** The signed-in account. */
  userId: string
  /** Its identity claims: its role, its active workspace (`activeOrganizationId`) and the rest. */
  claims: Record<string, unknown>
}

/** Options for {@link setupPresence}. */
export interface SetupPresenceOptions {
  /**
   * Whether a signed-in account may join a room, with the mutation's `ctx` to read your tables by. Unset, every signed-in
   * account may join any room; refuse one by returning `false`, and the
   * heartbeat answers `forbidden`. Rooms are the app's own strings: a
   * document's id, `workspace:<id>`.
   *
   * @example
   * ```ts
   * canJoin: ({ roomId, claims }) => !roomId.startsWith('workspace:') || roomId === `workspace:${claims.activeOrganizationId}`
   * ```
   */
  canJoin?: (room: PresenceRoomCheck, ctx: GenericMutationCtx<GenericDataModel>) => boolean | Promise<boolean>
  /** How many people a room lists at most. Default 50. */
  limit?: number
}

/** One person in a room, as `useRoomPresence` and the base module's `<FacePile>` read it. */
export interface RoomMember {
  userId: string
  online: boolean
  lastDisconnected: number
  /** Their name, when the account has one. */
  name?: string
  /** Their picture, when the account has one. */
  image?: string
}

/** What {@link setupPresence} returns: the three functions `backend/presence.ts` exports, and the component's own client. */
export interface PresenceSetup {
  /**
   * The room's people, by the room token a heartbeat handed back: who is online first, as the component orders them.
   * Signed out, or as an administrator acting as someone, it lists nobody and refuses.
   */
  list: RegisteredQuery<'public', { roomToken: string }, Promise<RoomMember[]>>
  /** Keep the signed-in account in a room. The browser's `userId` is checked against the account, never trusted. */
  heartbeat: RegisteredMutation<'public', { roomId: string, userId: string, sessionId: string, interval: number }, Promise<{ roomToken: string, sessionToken: string }>>
  /** Leave the room the session token names, as a tab closes. */
  disconnect: RegisteredMutation<'public', { sessionToken: string }, Promise<null>>
  /**
   * The component's client, for a room of your own (`listRoom`, `removeRoomUser`, `removeRoom`), which checks no sign-in.
   * A room token stays valid once `canJoin` stops letting its holder in: `removeRoomUser` ends it at once.
   */
  presence: Presence
}

/** The fewest and most heartbeat intervals the server accepts, in milliseconds. */
const INTERVAL = { min: 1_000, max: 5 * 60_000 }
/** The longest room id: a document's id or a key of the app's own. */
const ROOM_ID_MAX = 256

/**
 * Who is here, for a page, a document or a workspace: Convex's presence
 * component (`@convex-dev/presence`, mounted as `presence` in
 * `convex.config.ts`) behind the backend's sign-in. Export what it returns
 * from `backend/presence.ts`, and `useRoomPresence(roomId)` keeps the
 * signed-in person in the room and lists who else is there.
 *
 * @example
 * ```ts [backend/presence.ts]
 * import { setupPresence } from 'nuxt-backend/presence'
 * import { components } from './_generated/api'
 *
 * export const { list, heartbeat, disconnect } = setupPresence(components)
 * ```
 */
export function setupPresence(components: PresenceComponents, options: SetupPresenceOptions = {}): PresenceSetup {
  const presence = new Presence(components.presence)
  const limit = options.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TypeError('[nuxt-backend] setupPresence({ limit }): a whole number from 1 to 200.')
  const findUser = components.backend.adapter.findOne

  const heartbeat = mutationGeneric({
    args: { roomId: v.string(), userId: v.string(), sessionId: v.string(), interval: v.number() },
    handler: async (ctx, { roomId, userId, sessionId, interval }) => {
      const caller = await ownCaller(ctx, 'presence:heartbeat')
      if (userId !== caller) throw backendError('forbidden', { reason: 'presence_user' }, '[nuxt-backend] presence:heartbeat: a heartbeat counts the signed-in account only.')
      if (!roomId || roomId.length > ROOM_ID_MAX) throw backendError('invalid_input', { field: 'roomId' }, `[nuxt-backend] presence:heartbeat: a room id of 1 to ${ROOM_ID_MAX} characters.`)
      if (!sessionId || sessionId.length > 128) throw backendError('invalid_input', { field: 'sessionId' }, '[nuxt-backend] presence:heartbeat: a session id of 1 to 128 characters.')
      if (options.canJoin) {
        const claims = await ctx.auth.getUserIdentity() as unknown as Record<string, unknown>
        if (!await options.canJoin({ roomId, userId: caller, claims }, ctx)) throw backendError('forbidden', { reason: 'presence_room' }, `[nuxt-backend] presence:heartbeat: ${JSON.stringify(roomId)} does not let this account in.`)
      }
      return presence.heartbeat(ctx, roomId, caller, sessionId, Math.min(INTERVAL.max, Math.max(INTERVAL.min, interval)))
    },
  })

  const list = queryGeneric({
    args: { roomToken: v.string() },
    handler: async (ctx, { roomToken }): Promise<RoomMember[]> => {
      // A token outlives the sign-in that earned it: names and pictures go to a signed-in caller only.
      await ownCaller(ctx, 'presence:list')
      const people = await presence.list(ctx, roomToken, limit)
      return Promise.all(people.map(async ({ userId, online, lastDisconnected }) => {
        const user = await ctx.runQuery(findUser, { model: 'user', where: [{ field: '_id', value: userId }] }) as { name?: unknown, image?: unknown } | null
        return {
          userId,
          online,
          lastDisconnected,
          ...(typeof user?.name === 'string' && user.name ? { name: user.name } : {}),
          ...(typeof user?.image === 'string' && user.image ? { image: user.image } : {}),
        }
      }))
    },
  })

  const disconnect = mutationGeneric({
    args: { sessionToken: v.string() },
    handler: async (ctx, { sessionToken }) => presence.disconnect(ctx, sessionToken),
  })

  return { list, heartbeat, disconnect, presence }
}
