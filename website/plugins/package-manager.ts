import { isPackageManager, PM_HEAD_SCRIPT, PM_STORAGE_KEY } from '~~/shared/pm'

// The reader's package manager (shared/pm.ts, composables/usePackageManager.ts).
//
// - On the server: the head script that sets `html[data-pm]` from
//   localStorage before the body paints, as color mode does. Through
//   `useHead`, so nuxt-security gives it the page's nonce (a hash, on a
//   prerendered page). Server only: the client never inserts an inline
//   script of its own, which the CSP would refuse.
// - On the client, once mounted: the state takes what the head script set,
//   and a pick made in another tab (its `storage` event) moves this one.
export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.server) {
    useHead({ script: [{ key: 'package-manager', innerHTML: PM_HEAD_SCRIPT, tagPriority: 'critical' }] })
    return
  }
  const { pm } = usePackageManager()
  nuxtApp.hook('app:mounted', () => {
    const stamped = document.documentElement.getAttribute('data-pm')
    if (isPackageManager(stamped)) pm.value = stamped
    window.addEventListener('storage', (event) => {
      if (event.key !== PM_STORAGE_KEY) return
      const next = isPackageManager(event.newValue) ? event.newValue : 'npm'
      document.documentElement.setAttribute('data-pm', next)
      pm.value = next
    })
  })
})
