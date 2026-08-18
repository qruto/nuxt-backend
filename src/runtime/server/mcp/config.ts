import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * Server-side runtime config the module publishes under
 * `runtimeConfig.backendMcp` when the agent surface is enabled. Absent (and
 * every reader inert) when `backend.mcp: false`.
 */
export interface BackendMcpRuntimeConfig {
  /** The MCP endpoint route the gate owns. */
  route: string
  /** The auth proxy base (`backend.authRoute`), for the discovery documents. */
  authBase: string
  /** The deployment route the gate exchanges Bearers at. */
  exchangePath: string
  /** Scopes advertised by the protected-resource metadata. */
  scopes: string[]
  /** Per-tool disables for the built-in set (`{ 'tool-name': false }`). */
  tools: Partial<Record<string, boolean>>
  /** Convex function-ref overrides for the built-in tools. */
  functions: Partial<Record<string, string>>
}

export function readBackendMcpRuntimeConfig(event?: H3Event): BackendMcpRuntimeConfig | null {
  const config = (useRuntimeConfig(event as never) as { backendMcp?: BackendMcpRuntimeConfig }).backendMcp
  return config?.route ? config : null
}

/**
 * The Convex site URL (HTTP actions origin) published by the base module —
 * the exchange target. Server config first; the public copy is the fallback.
 */
export function readConvexSiteUrl(event?: H3Event): string | null {
  const config = useRuntimeConfig(event as never) as {
    convex?: { siteUrl?: string }
    public?: { convex?: { siteUrl?: string } }
  }
  return config.convex?.siteUrl || config.public?.convex?.siteUrl || null
}
