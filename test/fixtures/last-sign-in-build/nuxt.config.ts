// Build fixture for test/e2e/last-sign-in-ssr.test.ts: one page that shows
// how this browser last signed in, as `useAuth().lastSignInMethod` first
// reads it (src/runtime/vue/utils/last-sign-in.ts). `/` renders per
// request; `/cached` is served from Nitro's cache, one render for
// everyone.
export default defineNuxtConfig({
  devtools: { enabled: false },
  routeRules: { '/cached': { swr: 3600 } },
  compatibilityDate: '2026-10-01',
  telemetry: false,
})
