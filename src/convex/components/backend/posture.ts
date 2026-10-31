import { v } from 'convex/values'
import { env, internalAction } from './_generated/server.js'
import { emailPosture } from '../../email-posture.js'

/**
 * What the deployment tells `nuxt-backend doctor --prod` of itself, facts
 * derived from its own env that no listing of names can give: its email
 * sender's domain and, read with its own key, what the email provider says
 * of that domain, the last week's bounces and complaints, and the quota
 * used. Internal: only the Convex CLI calls it (`convex run --component
 * backend posture:email`), with the deployment's admin key. The key never
 * leaves the deployment, and no address does.
 */

const vCount = v.number()

/** What the provider answered the deployment's key (src/convex/email-posture.ts). */
const vProviderReadout = v.object({
  access: v.union(v.literal('full'), v.literal('sending'), v.literal('refused'), v.literal('unreachable')),
  reason: v.optional(v.string()),
  domain: v.optional(v.union(v.object({ status: v.string(), sending: v.boolean() }), v.literal('absent'))),
  week: v.optional(v.object({ sent: vCount, delivered: vCount, bounced: vCount, complained: vCount })),
  quota: v.optional(v.object({ daily: v.optional(vCount), monthly: v.optional(vCount) })),
})

/** The deployment's email posture: its sender's domain, and the provider's answers (`null` without a key). */
const vEmailPosture = v.object({
  sender: v.union(v.object({ domain: v.string() }), v.literal('unset'), v.literal('malformed')),
  provider: v.union(vProviderReadout, v.null()),
})

/** The deployment's email posture, for `doctor --prod`. */
export const email = internalAction({
  args: {},
  returns: vEmailPosture,
  handler: async () => emailPosture({ from: env.EMAIL_FROM, apiKey: env.EMAIL_API_KEY }),
})
