// The invite code or access link token a tab keeps between the check
// (`useInvite`, the `/invite` page) and the sign-in that hands it over
// (`useLoginFlow`): in the tab's session storage, so it lasts as long as the
// tab and never reaches a server until the code check sends it. A browser
// that refuses storage keeps it in memory for the page instead.

const KEY = 'nuxt-backend:invite'
let memory: string | null = null

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  }
  catch {
    return null
  }
}

/** The code or token this tab keeps, or `null`. */
export function keptInvite(): string | null {
  try {
    return storage()?.getItem(KEY) ?? memory
  }
  catch {
    return memory
  }
}

/** Keep a code or token for this tab's next sign-in. */
export function keepInvite(code: string): void {
  memory = code
  try {
    storage()?.setItem(KEY, code)
  }
  catch {
    // Kept in memory only.
  }
}

/** Drop the kept code or token: after a sign-up used it, or a check found it dead. */
export function forgetInvite(): void {
  memory = null
  try {
    storage()?.removeItem(KEY)
  }
  catch {
    // Nothing kept.
  }
}

/**
 * An access link's token from the address's fragment (`/invite#<token>`),
 * stripped from the address so it is neither bookmarked nor shared on.
 * `null` without one.
 */
export function takeInviteFromAddress(): string | null {
  if (typeof window === 'undefined') return null
  const token = decodeURIComponent(window.location.hash.replace(/^#/, '')).trim()
  if (!token) return null
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  return token
}
