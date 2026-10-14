// The nuxt-backend.dev playground as a standalone app. Most files here are
// copied from the website by the package's `pnpm playground:sync`, so they
// match the live playground byte for byte; this config is one of the few that
// are written for the example (see README.md).

// Docs pages the playground links to live on the docs site, all under /docs.
const DOCS_SECTIONS = ['docs']

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
          href: 'https://fonts.googleapis.com/css2?family=Anybody:ital,wdth,wght@0,50..150,100..900;1,50..150,100..900&family=Handjet:wght@500;700&family=Martian+Mono:wdth,wght@75..112.5,100..800&display=swap',
        },
      ],
    },
  },
  // The reset Tailwind gives the site, then the site's own stylesheet. The
  // module puts its neutral, layered stylesheet ahead of both.
  css: ['~/assets/reset.css', '~/app.css'],
  routeRules: {
    '/': { redirect: '/playground' },
    ...Object.fromEntries(DOCS_SECTIONS.map(section => [
      `/${section}/**`,
      { redirect: `https://nuxt-backend.dev/${section}/**` },
    ])),
  },
  compatibilityDate: '2026-09-01',
  // Every playground page renders in the playground shell, set here once like
  // the site does, after the module has added the pages it mounts under
  // /playground/vanilla. /login and /playground/offline opt out themselves.
  hooks: {
    'pages:resolved'(pages) {
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
    // The account pages mount in the playground's vanilla group, the
    // zero-config look. /login is this app's own page, which the module
    // detects; the invitation and consent pages stay at the root, where
    // emails and agents link.
    pages: {
      pricing: '/playground/vanilla/pricing',
      settings: '/playground/vanilla/settings',
      profile: '/playground/vanilla/profile',
      security: '/playground/vanilla/security',
    },
  },
  // The app's own agent tools live in server/agent/tools/, as on the site
  // (whose docs theme keeps tools of its own in the default server/mcp/).
  mcp: {
    dir: 'agent',
  },
})
