import { makeFunctionReference } from 'convex/server'
import { z } from 'zod'
import { backendMcpFunction, builtinToolEnabled } from '../builtin'
import { defineBackendMcpTool, useBackendMcp } from '../index'

export default defineBackendMcpTool({
  name: 'profile-update',
  // Name-only on purpose: email changes stay in the verified web flow, so an
  // agent can never move the account to an unproven address.
  description: 'Update the signed-in user\'s display name. Email cannot be changed here.',
  scope: 'profile:write',
  annotations: { destructiveHint: false, idempotentHint: true },
  inputSchema: {
    name: z.string().min(1).max(256).describe('The new display name.'),
  },
  enabled: event => builtinToolEnabled('profile-update', event),
  handler: async ({ name }) => {
    const { fetchMutation } = useBackendMcp()
    await fetchMutation(makeFunctionReference<'mutation'>(backendMcpFunction('updateProfile')), { name })
    return { ok: true, name }
  },
})
