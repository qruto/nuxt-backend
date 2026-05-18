export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  css: ['~/app.css'],
  compatibilityDate: 'latest',
  backend: {
    url: 'http://127.0.0.1:3210',
    siteUrl: 'http://127.0.0.1:3211',
  },
})
