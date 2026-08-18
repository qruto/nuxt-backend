import { makeFunctionReference } from 'convex/server'
import { getRequestURL } from 'h3'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'billing-checkout-link',
  // Links only, by design: the agent hands the URL to the human, who pays in
  // the browser. No tool in this package executes a payment.
  description: 'Create a checkout link for one or more products. Returns a URL for the user to open and pay in their browser — the agent never executes the payment.',
  scope: 'billing:checkout',
  annotations: { destructiveHint: false, openWorldHint: true },
  inputSchema: {
    productIds: z.array(z.string()).min(1).describe('Product ids from billing-plans.'),
    successPath: z.string().regex(/^\//, 'Must be an app-relative path.').optional()
      .describe('App path to land on after payment (default "/").'),
  },
  enabled: event => builtinToolEnabled('billing-checkout-link', event),
  handler: async ({ productIds, successPath }) => {
    const { fetchAction } = useBackendMcp()
    // App-relative success paths only — an absolute successUrl would let a
    // prompt-injected agent bounce the paying user to an attacker origin.
    const origin = getRequestURL(useEvent(), { xForwardedHost: true, xForwardedProto: true }).origin
    const { url } = await fetchAction(
      makeFunctionReference<'action'>(backendMcpFunction('generateCheckoutLink')),
      { productIds, origin, successUrl: `${origin}${successPath ?? '/'}` },
    ) as { url: string }
    return { url, note: 'Hand this URL to the user — checkout completes in their browser.' }
  },
})
