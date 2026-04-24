import { defineEventHandler, proxyRequest, getRequestURL } from 'h3'
import { useRuntimeConfig } from '#imports'

/**
 * Proxy all /api/auth/* requests to the Convex site URL.
 * This keeps auth cookies on the same origin (no CORS issues).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const siteUrl = config.backend.siteUrl

  if (!siteUrl) {
    throw new Error('[nuxt-backend] NUXT_PUBLIC_CONVEX_SITE_URL is not configured. Auth proxy cannot forward requests.')
  }

  const requestUrl = getRequestURL(event)
  const targetPath = requestUrl.pathname + requestUrl.search
  const targetUrl = `${siteUrl}${targetPath}`

  return proxyRequest(event, targetUrl)
})
