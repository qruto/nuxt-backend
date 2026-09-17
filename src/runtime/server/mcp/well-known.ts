import type { H3Event } from 'h3'
import { readBackendMcpRuntimeConfig, type BackendMcpRuntimeConfig } from './config'

/** Public metadata is fetched cross-origin by browser-based MCP clients. */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-protocol-version',
} as const

/**
 * The shared front of both `/.well-known` handlers, which run as global
 * middleware and answer only their own document: `undefined` when the MCP
 * surface is off or the request is for another path (let the request
 * through), a CORS preflight answer for `OPTIONS`, or the runtime config the
 * handler renders its document from. The path-suffix form
 * (`…/oauth-protected-resource/mcp`) matches too.
 */
export function wellKnownRequest(event: H3Event, wellKnownPath: string): BackendMcpRuntimeConfig | Response | undefined {
  const config = readBackendMcpRuntimeConfig(event)
  if (!config) return undefined

  const path = event.path.split('?')[0] ?? ''
  if (path !== wellKnownPath && !path.startsWith(`${wellKnownPath}/`)) return undefined
  if (event.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  return config
}
