import { defineEventHandler } from 'h3'
import { readBackendMcpRuntimeConfig, readConvexSiteUrl } from './config'

const WELL_KNOWN_PATH = '/.well-known/oauth-authorization-server'
const CACHE_TTL_MS = 5 * 60_000

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-protocol-version',
} as const

let cached: { body: string, fetchedAt: number } | null = null

/**
 * RFC 8414 authorization-server metadata at the app origin (both the root
 * form and the `/api/auth` path-suffix form, via the prefix registration).
 * Proxies the better-auth mcp plugin's document — the same one the auth
 * proxy serves under `/api/auth/.well-known/…` — fetched from the Convex
 * site directly (skipping a self-request through the proxy) and cached: the
 * document only changes on deploys.
 */
export default defineEventHandler(async (event) => {
  const config = readBackendMcpRuntimeConfig(event)
  if (!config) return

  const path = event.path.split('?')[0] ?? ''
  if (path !== WELL_KNOWN_PATH && !path.startsWith(`${WELL_KNOWN_PATH}/`)) return
  if (event.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  const siteUrl = readConvexSiteUrl(event)
  if (!siteUrl) {
    return new Response(JSON.stringify({ error: 'authorization_server_unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
    })
  }

  if (!cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
    const upstream = await fetch(`${siteUrl}${config.authBase}${WELL_KNOWN_PATH}`).catch(() => null)
    if (!upstream?.ok) {
      // Serve a stale copy over an outage; fail only with nothing to serve.
      if (!cached) {
        return new Response(JSON.stringify({ error: 'authorization_server_unreachable' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
        })
      }
    }
    else {
      cached = { body: await upstream.text(), fetchedAt: Date.now() }
    }
  }

  return new Response(cached.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      ...CORS_HEADERS,
    },
  })
})
