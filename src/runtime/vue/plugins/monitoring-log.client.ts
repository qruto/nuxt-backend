// The `backend:error` hook is typed beside the action state, which this file imports.
import { defineNuxtPlugin } from '#imports'
import { isReportable, LOCAL_LOG_ROUTE, localEntry } from '../../monitoring/report'
import type { BackendErrorContext } from '../utils/action-state'

/**
 * Dev only: what the browser captures goes to the dev server's local error
 * log, which DevTools › Monitoring lists: the stand-in for an
 * error-reporting service while no DSN is set, and its echo while one is. A
 * composable's failed action (`backend:error`), a Vue error and an unhandled
 * rejection; a refusal from the error catalog is the app working as
 * designed and is left out, as a report leaves it out.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:monitoring-log',
  setup(nuxtApp) {
    const seen = new WeakSet<object>()
    const send = (error: unknown) => {
      if (!isReportable(error)) return
      if (typeof error === 'object' && error !== null) {
        if (seen.has(error)) return
        seen.add(error)
      }
      // fallow-ignore-next-line security-sink -- destination is the dev server's own same-origin route constant, never input; verified 2026-10-19
      void fetch(LOCAL_LOG_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localEntry(error, 'browser', Date.now())),
        keepalive: true,
      }).catch(() => {
        // The log is a convenience: a dev server that went away loses the entry, nothing else.
      })
    }
    nuxtApp.hook('backend:error', ({ cause }: BackendErrorContext) => send(cause))
    nuxtApp.hook('vue:error', error => send(error))
    nuxtApp.hook('app:error', error => send(error))
    window.addEventListener('unhandledrejection', event => send(event.reason))
  },
})
