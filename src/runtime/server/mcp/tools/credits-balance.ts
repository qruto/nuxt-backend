import { makeFunctionReference } from 'convex/server'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'credits-balance',
  description: 'Get the prepaid credit balances (per meter) of the billing entity.',
  scope: 'billing:read',
  annotations: { readOnlyHint: true },
  enabled: event => builtinToolEnabled('credits-balance', event),
  handler: async () => {
    const { fetchQuery } = useBackendMcp()
    const credits = await fetchQuery(makeFunctionReference<'query'>(backendMcpFunction('getCredits')))
    return credits ?? { meters: [] }
  },
})
