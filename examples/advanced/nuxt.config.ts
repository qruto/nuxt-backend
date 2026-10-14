export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  compatibilityDate: '2026-10-14',
  telemetry: false,
  backend: {
    // CUSTOMIZATION: the invitation page lives at /join, matching the
    // Convex-side `organization.invitationPath` in backend/auth.ts. The app's
    // own page there (app/pages/join.vue) replaces the built-in one.
    pages: { acceptInvitation: '/join' },
  },
})
