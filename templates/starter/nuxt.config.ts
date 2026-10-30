export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  // The document's language, which screen readers pronounce the page in.
  // The packaged pages declare their own; this covers the app's pages.
  app: { head: { htmlAttrs: { lang: 'en' } } },
  css: ['~/assets/main.css'],
  compatibilityDate: '2026-10-14',
})
