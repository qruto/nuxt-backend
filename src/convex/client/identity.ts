// What a Convex identity says about the caller: a person's session or an
// agent's token. Session JWTs from the convex plugin carry `sessionId`; the
// MCP agent exchange (integrations/mcp.ts) mints tokens that carry the OAuth
// `clientId` instead, and no session.

/**
 * The Better Auth session behind a Convex identity. Session JWTs carry it as
 * `sessionId`; agent tokens from the MCP exchange carry none.
 */
export function identitySessionId(identity: unknown): string | null {
  const sessionId = (identity as { sessionId?: unknown } | null)?.sessionId
  return typeof sessionId === 'string' ? sessionId : null
}

/**
 * The OAuth client behind an agent token from the MCP exchange, which mints
 * it as the `clientId` claim; `null` for a person's session.
 */
export function identityClientId(identity: unknown): string | null {
  const clientId = (identity as { clientId?: unknown } | null)?.clientId
  return typeof clientId === 'string' && clientId ? clientId : null
}
