import { defineEventHandler } from 'nuxt/server'
import { PUSH_WORKER_SCOPE } from '../../convex/web-push'
import { PUSH_WORKER_SOURCE } from './push-worker-source'

// `/_backend/push/worker.js`: the service worker web push needs on Chromium,
// Firefox and Safari before 18.4. It shows the message the deployment sent
// (the Declarative Web Push payload Safari 18.4 shows by itself: a title, a
// body, the link it opens, its language) and opens or focuses the app on a
// click. It caches nothing and controls no page: its scope is
// `/_backend/push/`, so a service worker the app has at `/` keeps its own.

export default defineEventHandler((event) => {
  event.res.headers.set('Content-Type', 'text/javascript; charset=utf-8')
  // Browsers check for a new worker on every navigation; a day's cache is the most they honor.
  event.res.headers.set('Cache-Control', 'no-cache')
  event.res.headers.set('Service-Worker-Allowed', PUSH_WORKER_SCOPE)
  return PUSH_WORKER_SOURCE
})
