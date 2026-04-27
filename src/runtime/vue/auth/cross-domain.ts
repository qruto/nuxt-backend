import { authClient } from './client'

type CrossDomainAuthClient = typeof authClient & {
  crossDomain?: {
    oneTimeToken?: {
      verify: (args: { token: string }) => Promise<{
        data?: { session?: { token?: string } | null } | null
      }>
    }
    updateSession?: () => void
  }
}

const OTT_QUERY_PARAM = 'ott'

function readOneTimeTokenFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location?.href) return null

  const url = new URL(window.location.href)
  const token = url.searchParams.get(OTT_QUERY_PARAM)
  if (!token) return null

  url.searchParams.delete(OTT_QUERY_PARAM)
  window.history.replaceState({}, '', url)
  return token
}

async function exchangeOneTimeTokenForSession(token: string): Promise<void> {
  const client = authClient as CrossDomainAuthClient
  const verify = client.crossDomain?.oneTimeToken?.verify
  if (!verify) return

  const result = await verify({ token })
  const sessionToken = result?.data?.session?.token
  if (!sessionToken) return

  await authClient.getSession({
    fetchOptions: {
      headers: { Authorization: `Bearer ${sessionToken}` },
    },
  })
  client.crossDomain?.updateSession?.()
}

/**
 * Exchange a `?ott=...` one-time token (set by the Better Auth cross-domain
 * plugin when redirecting from an auth origin) for a full session.
 *
 * Safe to call unconditionally — returns early when the URL has no `ott`
 * parameter or the cross-domain plugin is not installed on the auth client.
 */
export async function consumeCrossDomainOneTimeToken(): Promise<void> {
  const token = readOneTimeTokenFromUrl()
  if (!token) return

  try {
    await exchangeOneTimeTokenForSession(token)
  }
  catch (error) {
    console.warn('[nuxt-backend] failed to consume cross-domain one-time token', error)
  }
}
