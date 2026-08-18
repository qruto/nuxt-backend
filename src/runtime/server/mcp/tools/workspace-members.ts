import { makeFunctionReference } from 'convex/server'
import { z } from 'zod'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'workspace-members',
  description: 'List the members of one of the signed-in user\'s workspaces (default: the active one).',
  scope: 'workspace:read',
  annotations: { readOnlyHint: true },
  inputSchema: {
    organizationId: z.string().optional().describe('Workspace id from workspace-list (default: the active workspace).'),
  },
  enabled: event => builtinToolEnabled('workspace-members', event),
  handler: async ({ organizationId }) => {
    const { fetchQuery } = useBackendMcp()
    const members = await fetchQuery(
      makeFunctionReference<'query'>(backendMcpFunction('listWorkspaceMembers')),
      organizationId ? { organizationId } : {},
    )
    return members ?? { error: 'Not a member of this workspace.' }
  },
})
