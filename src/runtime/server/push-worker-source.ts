// The push service worker's source, apart from its route handler so a test
// reads it without the server runtime (src/runtime/server/push-worker.ts serves it).

/** The worker's source: plain JavaScript, no import, as a service worker runs it. */
export const PUSH_WORKER_SOURCE = `/* nuxt-backend push worker */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let message = {}
  try { message = event.data ? event.data.json() : {} } catch { message = {} }
  const notification = message && typeof message.notification === 'object' && message.notification ? message.notification : {}
  const title = typeof notification.title === 'string' ? notification.title : ''
  if (!title) return
  const options = { data: { navigate: typeof notification.navigate === 'string' ? notification.navigate : '/' } }
  if (typeof notification.body === 'string') options.body = notification.body
  if (typeof notification.lang === 'string') options.lang = notification.lang
  event.waitUntil(self.registration.showNotification(title, options))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.navigate) || '/', self.location.origin)
  // Only the app's own pages open from a notification.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find(client => client.url === url)
    return open ? open.focus() : self.clients.openWindow(url)
  }))
})
`
