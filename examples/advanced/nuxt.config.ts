export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  css: ['nuxt-backend/auth.css', '~/assets/main.css'],
  backend: {
    // CUSTOMIZATION: the built-in /accept-invitation page is disabled — this
    // app ships its own at /join (see app/pages/join.vue), matching the
    // Convex-side `organization.invitationPath` in convex/auth.ts.
    invitationPage: false,
  },
})
