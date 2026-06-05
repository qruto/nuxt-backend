export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  app: {
    head: {
      meta: [
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', content: '#0b0f14', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#f8fafc', media: '(prefers-color-scheme: light)' },
      ],
    },
  },
  css: ['~/app.css'],
  compatibilityDate: 'latest',
  backend: {
    url: 'http://127.0.0.1:3210',
    siteUrl: 'http://127.0.0.1:3211',
  },
})
