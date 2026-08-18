export const DEFAULT_AUTH_ROUTE = '/api/auth'
export const COMPONENT_AUTH_ROUTE = '/'
/**
 * App page that handles workspace-invitation accept links
 * (`{SITE_URL}{path}?id=<invitationId>`). The Nuxt module registers this page
 * automatically (module option `pages.acceptInvitation`); the Convex side builds the
 * emailed URL from the same constant (`organization.invitationPath`).
 */
export const DEFAULT_INVITATION_PATH = '/accept-invitation'
/**
 * Default paths of the module-mounted pages (module option `pages`). Shared
 * Nuxt↔Convex constants — the login path is also the auth middleware's
 * redirect target, and settings/security paths are natural email
 * `callbackURL` defaults.
 */
export const DEFAULT_LOGIN_PATH = '/login'
export const DEFAULT_PRICING_PATH = '/pricing'
export const DEFAULT_SETTINGS_PATH = '/settings'
export const DEFAULT_PROFILE_PATH = '/profile'
export const DEFAULT_SECURITY_PATH = '/security'
/**
 * Route the agent token exchange mounts at (`registerBackendRoutes`'s
 * `mcpExchangePath`). The Nuxt module's MCP gate POSTs the agent's OAuth
 * Bearer here to trade it for a short-lived Convex JWT.
 */
export const DEFAULT_MCP_EXCHANGE_PATH = '/mcp/exchange'
/**
 * OAuth scopes the agent (MCP) surface understands. `openid`/`profile`/`email`
 * are the OIDC identity scopes (always granted by the provider); the rest gate
 * the built-in tools: reads never need more than `*:read`, `profile:write` is
 * name-only (email changes stay in the verified web flow), `billing:checkout`
 * only ever returns URLs for the human to open — no tool executes a payment —
 * and `act` is reserved for consumer-defined action tools (nothing built-in
 * uses it).
 */
export const BACKEND_MCP_SCOPES = [
  'openid',
  'profile',
  'email',
  'profile:write',
  'billing:read',
  'billing:checkout',
  'workspace:read',
  'act',
] as const

export type BackendMcpScope = (typeof BACKEND_MCP_SCOPES)[number]
