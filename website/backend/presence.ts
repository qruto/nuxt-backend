import { setupPresence } from 'nuxt-backend/presence'
import { components } from './_generated/api'

// Who else has a strip open, live (app/components/StripViewers.vue). A
// strip's room is `strip:<id>`, and it lets in the members of the strip's
// workspace only: the same people who may open the strip.
export const { list, heartbeat, disconnect } = setupPresence(components, {
  canJoin: async ({ roomId, claims }, ctx) => {
    const id = roomId.startsWith('strip:') ? ctx.db.normalizeId('strips', roomId.slice('strip:'.length)) : null
    const strip = id ? await ctx.db.get(id) : null
    return strip !== null && !strip.hidden && strip.workspaceId === claims.activeOrganizationId
  },
})
