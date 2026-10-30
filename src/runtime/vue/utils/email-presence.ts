import type { FunctionReference } from 'convex/server'
import { inject, watch } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import { useApiNamespace } from './namespace'

/** The storage key of the day this tab last told the backend. */
const SEEN_KEY = 'nuxt-backend:email-presence'

/** Today, as the key reads it. */
const today = () => new Date().toISOString().slice(0, 10)

function seenToday(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === today()
  }
  catch {
    return false
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, today())
  }
  catch {
    // A tab without storage tells the backend again on its next load.
  }
}

/**
 * Watch the session and, once it is signed in, record the person's time
 * zone and activity: once a day per tab. Runs in the app's injection context.
 *
 * @internal
 */
export function watchPresence(): void {
  const api = useApiNamespace<{ recordTimeZone?: FunctionReference<'mutation', 'public', { timeZone: string }, null> }>('email')
  const auth = inject(ConvexAuthStateKey, null)
  if (!api?.recordTimeZone || !auth) return
  const record = useMutation(api.recordTimeZone)
  watch(() => auth.isAuthenticated.value, (signedIn) => {
    if (!signedIn || seenToday()) return
    markSeen()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    void record({ timeZone: timeZone || 'UTC' }).catch(() => {})
  }, { immediate: true })
}
