import { makeFunctionReference } from 'convex/server'
import { backendMcpFunction } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'billing-plans',
  description: 'List the configured billing products (plans and credit packs) with live pricing.',
  scope: 'billing:read',
  annotations: { readOnlyHint: true },
  handler: async () => {
    const { fetchQuery } = useBackendMcp()
    const products = await fetchQuery(makeFunctionReference<'query'>(backendMcpFunction('getConfiguredProducts')))
    return products ?? {}
  },
})
