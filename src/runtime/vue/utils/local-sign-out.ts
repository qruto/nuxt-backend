// Which session this tab signed out itself. The session-ended watch reads it
// to tell a sign-out the app asked for (and navigates after on its own) from
// a session that ended under the page: only the second sends the person to
// sign in.

/** The session `useAuth().signOut` is ending, or `null`. */
let ending: string | null = null

/**
 * The key a session is known by on both sides: the session's id, else its
 * user's id (the same rule as the base module's `authVersion`), or `null`
 * when nobody is signed in.
 */
export function sessionKey(data: unknown): string | null {
  const value = data as { session?: { id?: unknown }, user?: { id?: unknown } } | null | undefined
  const key = value?.session?.id ?? value?.user?.id
  return typeof key === 'string' && key ? key : null
}

/**
 * The session as the auth server last settled it: its key when signed in
 * (`'signed-in'` for an answer without one), `null` when signed out,
 * `undefined` while the answer is pending.
 */
export function settledSessionKey(state: { isPending: boolean, data: unknown }): string | null | undefined {
  if (state.isPending) return undefined
  return state.data ? sessionKey(state.data) ?? 'signed-in' : null
}

/** Remember that this tab is signing `key` out; `null` forgets it (a sign-out that failed). */
export function markLocalSignOut(key: string | null): void {
  ending = key
}

/** Whether `key` is the session this tab signed out itself. Answers once: the mark is spent. */
export function takeLocalSignOut(key: string): boolean {
  if (ending !== key) return false
  ending = null
  return true
}
