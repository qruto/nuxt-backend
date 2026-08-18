import { makeFunctionReference } from 'convex/server'
import { getRequestURL } from 'h3'
import { useEvent } from 'nitropack/runtime'
import { z } from 'zod'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'billing-portal-link',
  description: 'Create a customer-portal link for managing the subscription, invoices, and payment methods. Returns a URL for the user to open in their browser.',
  scope: 'billing:checkout',
  annotations: { destructiveHint: false, openWorldHint: true },
  inputSchema: {
    returnPath: z.string().regex(/^\//, 'Must be an app-relative path.').optional()
      .describe('App path to return to from the portal (default "/").'),
  },
  enabled: event => builtinToolEnabled('billing-portal-link', event),
  handler: async ({ returnPath }) => {
    const { fetchAction } = useBackendMcp()
    const origin = getRequestURL(useEvent(), { xForwardedHost: true, xForwardedProto: true }).origin
    const { url } = await fetchAction(
      makeFunctionReference<'action'>(backendMcpFunction('generateCustomerPortalUrl')),
      { returnUrl: `${origin}${returnPath ?? '/'}` },
    ) as { url: string }
    return { url, note: 'Hand this URL to the user — the portal opens in their browser.' }
  },
})
