// The nuxt-backend.dev playground as a standalone app. Most files here are
// copied from the website by the package's `pnpm playground:sync`, so they
// match the live playground byte for byte; this config is one of the few that
// are written for the example (see README.md).

// Docs pages the playground links to live on the docs site.
const DOCS_SECTIONS = ['getting-started', 'guide', 'platform', 'agents', 'tooling', 'production', 'api-reference']

export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'Nuxt backend playground',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@500;600&family=JetBrains+Mono:wght@400;500;600;700&family=Nunito:ital,wght@0,400..800;1,400..800&display=swap',
        },
      ],
    },
  },
  // The site's order: the reset Tailwind gives it, the package's neutral
  // stylesheet, then the site's own layer on top. `backend.css: false` keeps
  // the module from appending ui.css after app.css.
  css: ['~/assets/reset.css', 'nuxt-backend/ui.css', '~/app.css'],
  routeRules: {
    '/': { redirect: '/playground' },
    ...Object.fromEntries(DOCS_SECTIONS.map(section => [
      `/${section}/**`,
      { redirect: `https://nuxt-backend.dev/${section}/**` },
    ])),
  },
  compatibilityDate: '2026-09-01',
  // Every playground page renders in the playground shell, set here once like
  // the site does. /login and /playground/offline opt out themselves.
  hooks: {
    'pages:extend'(pages) {
      const isPlaygroundRoute = (path: string) =>
        (path === '/playground' || path.startsWith('/playground/')) && path !== '/playground/offline'
      const walk = (list: typeof pages) => {
        for (const page of list) {
          if (page.path && isPlaygroundRoute(page.path)) page.meta = { ...page.meta, layout: 'playground' }
          if (page.children?.length) walk(page.children)
        }
      }
      walk(pages)
    },
  },
  backend: {
    css: false,
    // The playground mounts the packaged pages under its own shell
    // (/playground/saas/*, /playground/vanilla/*), so the root-level ones stay
    // off. /login is this app's own page, which the module detects.
    pages: {
      pricing: false,
      settings: false,
      profile: false,
      security: false,
    },
  },
})
