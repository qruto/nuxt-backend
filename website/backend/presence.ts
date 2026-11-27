import { setupPresence } from 'nuxt-backend/presence'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { internalMutation } from './_generated/server'

// Who else has a strip open, live (app/components/StripViewers.vue). A
// strip's room is `strip:<id>`, and it lets in the members of the strip's
// workspace only: the same people who may open the strip. Membership is read
// fresh from the member table, as `workspace` functions read it, because a
// removed member's sign-in can still name the workspace for a while.
export const { list, heartbeat, disconnect, presence } = setupPresence(components, {
  canJoin: async ({ roomId, userId, claims }, ctx) => {
    const id = roomId.startsWith('strip:') ? ctx.db.normalizeId('strips', roomId.slice('strip:'.length)) : null
    const strip = id ? await ctx.db.get(id) : null
    if (strip === null || strip.hidden || strip.workspaceId !== claims.activeOrganizationId) return false
    const member = await ctx.runQuery(components.backend.adapter.findOne, {
      model: 'member',
      where: [{ field: 'organizationId', value: String(strip.workspaceId) }, { field: 'userId', value: userId }],
    })
    return member !== null
  },
})

// A heartbeat lets people in but never takes them out, so the mutations that
// take access away do: hiding a strip empties its room (admin.ts), and a
// member removed from a workspace leaves its strips' rooms (auth.ts).
export const leaveWorkspace = internalMutation({
  args: { workspaceId: v.string(), userId: v.string() },
  handler: async (ctx, { workspaceId, userId }) => {
    // The rooms the account was in, offline ones too, up to a thousand (the
    // component reads 104 by default).
    for (const { roomId } of await presence.listUser(ctx, userId, false, 1_000)) {
      const id = roomId.startsWith('strip:') ? ctx.db.normalizeId('strips', roomId.slice('strip:'.length)) : null
      const strip = id ? await ctx.db.get(id) : null
      if (strip?.workspaceId === workspaceId) await presence.removeRoomUser(ctx, roomId, userId)
    }
  },
})
