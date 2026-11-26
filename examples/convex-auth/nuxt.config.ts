export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  app: { head: { title: 'Convex Auth example', htmlAttrs: { lang: 'en' } } },
  compatibilityDate: '2026-10-14',
  telemetry: false,
  backend: {
    // Convex Auth in place of Better Auth: sign-in only. The package's pages,
    // its page guard, workspaces, billing, AI credits and the account
    // features are off; nuxt-convex-module's Convex Auth integration runs.
    // https://nuxt-backend.dev/docs/build/auth/convex-auth
    auth: 'convex-auth',
  },
})
