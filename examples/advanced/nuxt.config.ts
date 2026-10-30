export default defineNuxtConfig({
  // CUSTOMIZATION: @nuxtjs/i18n translates the packaged pages and components.
  // i18n/locales/fr.json holds their `backend.*` messages; nuxt-backend
  // registers its English ones for `en` itself.
  modules: ['@nuxtjs/i18n', 'nuxt-backend'],
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  compatibilityDate: '2026-10-14',
  telemetry: false,
  backend: {
    // CUSTOMIZATION: the invitation page lives at /join, the one place the
    // path is written: the module carries it to backend/paths.generated.ts,
    // which invitation emails link from. The app's own page there
    // (app/pages/join.vue) replaces the built-in one.
    pages: { acceptInvitation: '/join' },
  },
  i18n: {
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    locales: [
      { code: 'en', language: 'en-US', file: 'en.json', name: 'English' },
      { code: 'fr', language: 'fr-FR', file: 'fr.json', name: 'Français' },
    ],
  },
})
