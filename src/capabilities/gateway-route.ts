// What doctor's `deployment-ai-gateway-api-key` finding says, read back by
// `status`: whether the key is what the named models lack, or the gateway
// order could not be read. Shared by the finding and the capability's
// detection, so a reworded hint cannot drift between them.

/**
 * The fix hint of `deployment-ai-gateway-api-key` when the key is what the
 * named models lack, in dev and under `--prod`: `status` reads it to tell a
 * missing key from an order that never reads one (`setupAi({ gateway:
 * 'convex' })`, or a region pin with no `'vercel'`).
 */
export const GATEWAY_KEY_FIX = {
  dev: 'Add AI_GATEWAY_API_KEY to .env.local and run `npx nuxt-backend env push`.',
  prod: 'Set production\'s own AI_GATEWAY_API_KEY on the deployment: `npx convex env set --prod AI_GATEWAY_API_KEY` (env push never sends .env.local\'s development key to production).',
} as const

/**
 * How `deployment-ai-gateway-api-key` starts when doctor cannot read the
 * gateway order: `status` then leaves the ai capability to billing, since
 * no route is known to be missing.
 */
export const GATEWAY_ORDER_UNREAD = 'Doctor cannot read the gateway order'

/** Whether a route finding's fix is setting the gateway key. */
export function gatewayKeyIsTheFix(finding: { fixHint: string }): boolean {
  return finding.fixHint.startsWith(GATEWAY_KEY_FIX.dev) || finding.fixHint.startsWith(GATEWAY_KEY_FIX.prod)
}
