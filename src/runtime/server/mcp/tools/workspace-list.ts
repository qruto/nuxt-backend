import { makeFunctionReference } from 'convex/server'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'workspace-list',
  description: 'List the signed-in user\'s workspaces with their role and which one is active.',
  scope: 'workspace:read',
  annotations: { readOnlyHint: true },
  enabled: event => builtinToolEnabled('workspace-list', event),
  handler: async () => {
    const { fetchQuery } = useBackendMcp()
    const workspaces = await fetchQuery(makeFunctionReference<'query'>(backendMcpFunction('listWorkspaces')))
    return { workspaces: workspaces ?? [] }
  },
})
