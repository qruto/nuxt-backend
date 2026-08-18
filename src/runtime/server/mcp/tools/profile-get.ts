import { makeFunctionReference } from 'convex/server'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'profile-get',
  description: 'Get the signed-in user\'s profile: name, email, and verification state.',
  scope: 'profile',
  annotations: { readOnlyHint: true },
  enabled: event => builtinToolEnabled('profile-get', event),
  handler: async () => {
    const { fetchQuery } = useBackendMcp()
    const user = await fetchQuery(makeFunctionReference<'query'>(backendMcpFunction('getAuthUser')))
    return user ?? { error: 'No profile found for this session.' }
  },
})
