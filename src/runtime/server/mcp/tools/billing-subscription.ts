import { makeFunctionReference } from 'convex/server'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'billing-subscription',
  description: 'Get the current subscription of the billing entity (the active workspace or user).',
  scope: 'billing:read',
  annotations: { readOnlyHint: true },
  enabled: event => builtinToolEnabled('billing-subscription', event),
  handler: async () => {
    const { fetchQuery } = useBackendMcp()
    const subscription = await fetchQuery(makeFunctionReference<'query'>(backendMcpFunction('getCurrentSubscription')))
    return { subscription: subscription ?? null }
  },
})
