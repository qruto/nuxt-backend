// What a Convex identity says about the caller: a person's session. Session
// JWTs from the convex plugin carry `sessionId`.

/** The Better Auth session behind a Convex identity. Session JWTs carry it as `sessionId`. */
export function identitySessionId(identity: unknown): string | null {
  const sessionId = (identity as { sessionId?: unknown } | null)?.sessionId
  return typeof sessionId === 'string' ? sessionId : null
}
