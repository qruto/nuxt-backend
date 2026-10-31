import { defineEventHandler, useRuntimeConfig } from 'nuxt/server'

// `/manifest.webmanifest`: the web app manifest the module builds from the
// brand app.config names and the two icons in `public/` (src/installable.ts),
// served only once both are in place. Browsers re-read it on their own
// schedule; a day's cache keeps it cheap.

export default defineEventHandler((event) => {
  event.res.headers.set('Content-Type', 'application/manifest+json; charset=utf-8')
  event.res.headers.set('Cache-Control', 'public, max-age=86400')
  return JSON.stringify((useRuntimeConfig() as { backendManifest?: unknown }).backendManifest ?? {})
})
