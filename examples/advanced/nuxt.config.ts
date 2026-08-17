export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  backend: {
    // CUSTOMIZATION: the built-in /accept-invitation page is disabled — this
    // app ships its own at /join (see app/pages/join.vue), matching the
    // Convex-side `organization.invitationPath` in backend/auth.ts.
    pages: { acceptInvitation: false },
  },
})
