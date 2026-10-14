/**
 * Where to resume an agent's authorization the OAuth provider paused for
 * sign-in, or null for a plain sign-in. The provider sends the person to the
 * login page with the authorize request as the query; signing in resumes it
 * with a full navigation back to the provider's authorize route, which then
 * opens the consent page. (The provider also tries to resume from inside the
 * sign-in request, but that answer reaches a `fetch`, not the window.)
 */
export function agentAuthorizationUrl(search: string, authRoute: string): string | null {
  const params = new URLSearchParams(search)
  if (!params.get('client_id') || !params.get('response_type')) return null
  return `${authRoute}/mcp/authorize?${params.toString()}`
}

/** The same-origin auth route the module publishes (`backend.authRoute`). */
export function publishedAuthRoute(runtimeConfig: { public: Record<string, unknown> }): string {
  return (runtimeConfig.public.backend as { authRoute?: string } | undefined)?.authRoute ?? '/api/auth'
}
