import { routes } from './backend/routes'

export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  // The document's language, which screen readers pronounce the page in, and
  // its title. The packaged pages declare their own; this covers the app's.
  app: { head: { title: 'Panels', htmlAttrs: { lang: 'en' } } },
  css: ['~/assets/main.css'],
  compatibilityDate: '2026-10-14',
  backend: {
    // After sign-in, people land on their strips. Panels' own paths are in
    // backend/routes.ts, which the backend's links read too.
    redirects: { afterSignIn: routes.strips },
    // app/pages/welcome.vue replaces the packaged first run at its path.
    pages: { welcome: routes.welcome },
  },
})
