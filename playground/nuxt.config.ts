import Sonda from 'sonda/nuxt'

// Bundle analysis is opt-in: `pnpm analyze` sets ANALYZE=true. Normal builds
// stay clean (no source maps, no report).
const analyze = process.env.ANALYZE === 'true'

export default defineNuxtConfig({
  modules: [
    'nuxt-backend',
    Sonda({ enabled: analyze }),
  ],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'nuxt-backend · playground',
      meta: [
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', content: '#0c0c0e', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#f6f5f1', media: '(prefers-color-scheme: light)' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },
  css: ['~/app.css'],
  // Sonda reads source maps to report true post-minify/tree-shake sizes.
  sourcemap: { client: analyze },
  compatibilityDate: 'latest',
  backend: {
    // url: 'http://127.0.0.1:3210',
    // siteUrl: 'http://127.0.0.1:3211',
  },
})
