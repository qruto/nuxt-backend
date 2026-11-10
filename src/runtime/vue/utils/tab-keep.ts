// A key a tab keeps between its pages, out of the address: an access link's
// token or an invite code (`kept-invite.ts`), a waitlist status token (the
// `/waitlist` page). In the tab's session storage, so it lasts as long as
// the tab and is never bookmarked, copied with the address or logged with
// it, and reaches no server until a call sends it. A browser that refuses
// storage keeps it in memory for the page instead.

/** One value a tab keeps under its storage key. */
export interface TabKeep {
  /** The value this tab keeps, or `null`. */
  read: () => string | null
  /** Keep a value for this tab. */
  keep: (value: string) => void
  /** Drop the kept value. */
  drop: () => void
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  }
  catch {
    return null
  }
}

/** The value a tab keeps under `key`. */
export function tabKeep(key: string): TabKeep {
  let memory: string | null = null
  return {
    read: () => {
      try {
        return storage()?.getItem(key) ?? memory
      }
      catch {
        return memory
      }
    },
    keep: (value) => {
      memory = value
      try {
        storage()?.setItem(key, value)
      }
      catch {
        // Kept in memory only.
      }
    },
    drop: () => {
      memory = null
      try {
        storage()?.removeItem(key)
      }
      catch {
        // Nothing kept.
      }
    },
  }
}

/**
 * The token in the address's fragment (`#<token>`), taken off the address
 * at once, so it is neither bookmarked nor copied with it. A fragment that
 * is no valid encoding is read as it stands. `null` without one.
 */
export function takeFragment(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  let token: string
  try {
    token = decodeURIComponent(hash).trim()
  }
  catch {
    token = hash.trim()
  }
  if (!token) return null
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  return token
}
