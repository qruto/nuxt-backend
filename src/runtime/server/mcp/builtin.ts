import type { H3Event } from 'h3'
import { readBackendMcpRuntimeConfig } from './config'

/**
 * The scaffold-named Convex functions the built-in tools call. Keys are the
 * override map's vocabulary (`backend.mcp.functions`); values assume the
 * scaffolded `auth.ts` / `billing.ts` module names.
 */
export const BACKEND_MCP_FUNCTION_DEFAULTS = {
  getAuthUser: 'auth:getAuthUser',
  updateProfile: 'auth:updateProfile',
  getConfiguredProducts: 'billing:getConfiguredProducts',
  getCurrentSubscription: 'billing:getCurrentSubscription',
  getCredits: 'billing:getCredits',
  generateCheckoutLink: 'billing:generateCheckoutLink',
  generateCustomerPortalUrl: 'billing:generateCustomerPortalUrl',
  listWorkspaces: 'auth:listWorkspaces',
  listWorkspaceMembers: 'auth:listWorkspaceMembers',
} as const

export type BackendMcpFunctionKey = keyof typeof BACKEND_MCP_FUNCTION_DEFAULTS

/** The built-in agent tools, by MCP tool name. */
export type BackendMcpToolName
  = 'profile-get' | 'profile-update'
    | 'billing-plans' | 'billing-subscription' | 'credits-balance'
    | 'billing-checkout-link' | 'billing-portal-link'
    | 'workspace-list' | 'workspace-members'

/** Resolve a built-in tool's Convex function ref (`backend.mcp.functions` wins). */
export function backendMcpFunction(key: BackendMcpFunctionKey, event?: H3Event): string {
  return readBackendMcpRuntimeConfig(event)?.functions[key] ?? BACKEND_MCP_FUNCTION_DEFAULTS[key]
}

/** Whether a built-in tool survived `backend.mcp.tools.builtin` config. */
export function builtinToolEnabled(name: BackendMcpToolName, event: H3Event): boolean {
  const config = readBackendMcpRuntimeConfig(event)
  return config ? config.tools[name] !== false : false
}
