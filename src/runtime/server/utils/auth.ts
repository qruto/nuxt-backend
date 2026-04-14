import type { H3Event } from 'h3'
import { useRequestEvent, useRuntimeConfig } from '#imports'

const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
] as const

function getCookieHeader(event: H3Event): string {
  const directHeader = (event as { headers?: { get?: (name: string) => string | null } }).headers
  if (directHeader?.get) {
    return directHeader.get('cookie') ?? ''
  }

  const nodeHeaders = (
    event as { node?: { req?: { headers?: Record<string, string | string[] | undefined> } } }
  ).node?.req?.headers
  const raw = nodeHeaders?.cookie
  if (Array.isArray(raw)) {
    return raw.join('; ')
  }
  return typeof raw === 'string' ? raw : ''
}

export function extractSessionToken(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) {
    return null
  }

  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim()
    for (const cookieName of SESSION_COOKIE_NAMES) {
      const prefix = `${cookieName}=`
      if (trimmed.startsWith(prefix)) {
        return trimmed.slice(prefix.length)
      }
    }
  }

  return null
}

export async function exchangeSessionTokenForConvexToken(
  cookieHeader: string,
  siteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!extractSessionToken(cookieHeader)) {
    return null
  }

  const response = await fetchImpl(`${siteUrl}/api/auth/convex/token`, {
    headers: {
      Cookie: cookieHeader,
    },
  })

  if ([401, 403].includes(response.status)) {
    return null
  }

  if (!response.ok) {
    throw new Error(
      `[nuxt-backend] Auth token exchange failed with status ${response.status}.`,
    )
  }

  const payload = (await response.json().catch(() => null)) as { token?: string } | null
  return payload?.token ?? null
}

function getRequestEvent(event?: H3Event) {
  const resolvedEvent = event ?? useRequestEvent()
  if (!resolvedEvent) {
    throw new Error('[nuxt-backend] No active request event is available for auth resolution.')
  }
  return resolvedEvent
}

function getConfiguredSiteUrl() {
  const siteUrl = useRuntimeConfig().backend.siteUrl
  if (!siteUrl) {
    throw new Error(
      '[nuxt-backend] CONVEX_SITE_URL is not configured. Auth helpers cannot exchange session cookies for Convex tokens.',
    )
  }
  return siteUrl
}

export async function getToken(event?: H3Event): Promise<string | null> {
  const resolvedEvent = getRequestEvent(event)
  const cookieHeader = getCookieHeader(resolvedEvent)
  if (!extractSessionToken(cookieHeader)) {
    return null
  }

  return exchangeSessionTokenForConvexToken(cookieHeader, getConfiguredSiteUrl())
}

export async function isAuthenticated(event?: H3Event): Promise<boolean> {
  return Boolean(await getToken(event))
}
