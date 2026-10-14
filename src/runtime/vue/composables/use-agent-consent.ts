import { onMounted, ref, type Ref } from 'vue'
import { unwrapAuth } from '../utils/auth-result'
import { useAuth } from './use-auth'

/** What an agent asks for, as the server stored it — never as its URL says. */
export interface AgentConsentRequest {
  clientId: string
  /** The name the agent registered under: self-declared, never verified. */
  clientName: string | null
  /** The host approving sends the browser (and the authorization code) to. */
  redirectHost: string
  /** Every scope the agent asked for. */
  scopes: string[]
  /** When the request lapses, in epoch milliseconds. */
  expiresAt: number
}

/**
 * `loading` until the request is read; `ready` to decide; `missing` when it
 * expired, was already answered or belongs to another account; `answered`
 * once the browser is on its way back to the agent.
 */
export type AgentConsentState = 'loading' | 'ready' | 'missing' | 'answered'

export interface UseAgentConsentReturn {
  request: Ref<AgentConsentRequest | null>
  state: Ref<AgentConsentState>
  /** `true` while an answer is being sent. */
  isPending: Ref<boolean>
  /** Message of the last failure; cleared when the next answer starts. */
  error: Ref<string | null>
  /** Grant the request and send the browser back to the agent. Throws on failure. */
  approve: () => Promise<void>
  /** Refuse the request and send the browser back to the agent with `access_denied`. Throws on failure. */
  deny: () => Promise<void>
}

type AuthFetch = (path: string, options: { method: 'POST', body: Record<string, unknown> }) => Promise<unknown>

/**
 * The consent code the provider put in the page URL, read once and taken out
 * of the address bar so it is never copied, bookmarked or kept in history.
 */
function takeConsentCode(): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const code = url.searchParams.get('consent_code')
  if (code) {
    url.searchParams.delete('consent_code')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }
  return code
}

/** Schemes a navigation could run script or reach local files through. */
const UNSAFE_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'blob:', 'file:'])

/**
 * The agent's callback, when it is safe to navigate to. It comes from the
 * agent's own registration, which the provider already screens for script
 * schemes; this keeps the page from depending on that. Web agents use
 * `http(s)`, native ones a scheme of their own (RFC 8252), both allowed.
 */
function agentCallback(url: string): string | null {
  try {
    const target = new URL(url)
    return UNSAFE_SCHEMES.has(target.protocol) ? null : target.href
  }
  catch {
    return null
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed'
}

/**
 * The consent step of an agent's authorization: loads what the agent asks
 * for from the server (its self-declared name, where approving redirects,
 * every scope) and answers it. The page it runs on is where the OAuth
 * provider sends every authorization (`pages.agentConsent`, `/oauth/consent`
 * by default); `<AgentConsent>` is the ready-made UI over it.
 */
export function useAgentConsent(): UseAgentConsentReturn {
  const authFetch = (useAuth().client as unknown as { $fetch: AuthFetch }).$fetch
  const request = ref<AgentConsentRequest | null>(null)
  const state = ref<AgentConsentState>('loading')
  const isPending = ref(false)
  const error = ref<string | null>(null)
  let code: string | null = null

  const withCode = (body: Record<string, unknown>) => (code ? { ...body, consent_code: code } : body)

  onMounted(async () => {
    code = takeConsentCode()
    try {
      request.value = unwrapAuth<AgentConsentRequest>(await authFetch('/agent-consent/request', { method: 'POST', body: withCode({}) }))
      state.value = 'ready'
    }
    catch (cause) {
      error.value = messageOf(cause)
      state.value = 'missing'
    }
  })

  async function answer(accept: boolean): Promise<void> {
    error.value = null
    isPending.value = true
    try {
      const { redirectURI } = unwrapAuth<{ redirectURI: string }>(await authFetch('/oauth2/consent', { method: 'POST', body: withCode({ accept }) }))
      const callback = agentCallback(redirectURI)
      if (!callback) throw new Error('The agent\'s return address is not one this page will open.')
      state.value = 'answered'
      // A full navigation: the agent's callback is another origin, often a
      // port on the person's own machine.
      // fallow-ignore-next-line security-sink -- the provider-issued callback of a registered client, scheme-checked by agentCallback; verified 2026-10-14
      window.location.assign(callback)
    }
    catch (cause) {
      error.value = messageOf(cause)
      throw new Error(error.value, { cause })
    }
    finally {
      isPending.value = false
    }
  }

  return {
    request,
    state,
    isPending,
    error,
    approve: () => answer(true),
    deny: () => answer(false),
  }
}
