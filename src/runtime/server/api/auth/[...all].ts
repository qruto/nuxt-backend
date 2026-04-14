import type { H3Event } from 'h3'
import {
  defineEventHandler,
  getRequestURL,
  readRawBody,
  setResponseStatus,
  setHeaders,
  appendResponseHeader,
  send,
  createError,
} from 'h3'
import { useRuntimeConfig } from '#imports'

const SKIP_RESPONSE_HEADERS = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
  'set-cookie',
])

function buildForwardHeaders(event: H3Event, targetHost: string): Headers {
  const headers = new Headers()
  for (const [key, value] of event.headers.entries()) {
    headers.append(key, value)
  }
  headers.set('host', targetHost)
  headers.set('accept-encoding', 'identity')
  headers.delete('content-length')
  return headers
}

/**
 * Proxy all /api/auth/* requests to the Convex site URL.
 * Keeps auth cookies on the same origin (no CORS issues).
 *
 * Uses manual fetch with redirect: 'manual' to preserve OAuth redirect
 * responses that must be returned to the browser as-is.
 */
export default defineEventHandler(async (event: H3Event) => {
  const config = useRuntimeConfig()
  const siteUrl = config.backend.siteUrl

  if (!siteUrl) {
    throw createError({
      statusCode: 500,
      message: '[nuxt-backend] CONVEX_SITE_URL is not configured. Auth proxy cannot forward requests.',
    })
  }

  const requestUrl = getRequestURL(event)
  const targetPath = requestUrl.pathname + requestUrl.search
  const targetUrl = `${siteUrl}${targetPath}`
  const targetHost = new URL(siteUrl).host

  const forwardHeaders = buildForwardHeaders(event, targetHost)

  let body: string | undefined
  if (['POST', 'PUT', 'PATCH'].includes(event.method)) {
    body = (await readRawBody(event, 'utf8')) || undefined
  }

  let response: Response
  try {
    response = await fetch(targetUrl, {
      method: event.method,
      headers: forwardHeaders,
      body,
      redirect: 'manual',
    })
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      message: `[nuxt-backend] Auth proxy failed to reach ${siteUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }

  // Forward response status
  setResponseStatus(event, response.status, response.statusText)

  // Forward Set-Cookie headers (can be multiple)
  const cookies = response.headers.getSetCookie?.() || []
  for (const cookie of cookies) {
    appendResponseHeader(event, 'set-cookie', cookie)
  }

  // Forward other response headers
  for (const [key, value] of response.headers.entries()) {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      setHeaders(event, { [key]: value })
    }
  }

  // For redirects (OAuth flows), return empty body and let browser follow Location header
  if (response.status >= 300 && response.status < 400) {
    return ''
  }

  const responseBody = new Uint8Array(await response.arrayBuffer())
  return send(event, responseBody)
})
