import Sonda from 'sonda/nuxt'

// Bundle analysis is opt-in: `pnpm analyze` sets ANALYZE=true. Normal builds
// stay clean (no source maps, no report).
const analyze = process.env.ANALYZE === 'true'

// The whole site — product homepage, docs, and the interactive playground — is
// one Nuxt app. Docus (extended as a layer) provides the docs theme, Nuxt
// Content, search, and SEO; `nuxt-backend` powers the live demos & playground.
export default defineNuxtConfig({
  extends: ['docus'],
  modules: [
    'nuxt-backend',
    Sonda({ enabled: analyze }),
  ],
  devtools: { enabled: true },
  app: {
    head: {
      meta: [
        { name: 'color-scheme', content: 'light dark' },
        { name: 'theme-color', content: '#161616', media: '(prefers-color-scheme: dark)' },
        { name: 'theme-color', content: '#e8e8e8', media: '(prefers-color-scheme: light)' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Gabarito:wght@400;500;600;700&family=Nunito:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
        },
      ],
    },
  },
  site: {
    name: 'Nuxt backend',
  },
  // Use Node's built-in `node:sqlite` for Nuxt Content's local DB instead of the
  // `better-sqlite3` native addon — no node-gyp compile, no prebuilds, no
  // `allowBuilds` entry. Requires Node >= 22.5 at build & runtime (we pin >=24).
  content: {
    experimental: { sqliteConnector: 'native' },
  },
  // The product homepage and docs prerender to static HTML. The playground and
  // login are interactive, authenticated pages backed by live Convex queries —
  // render them at runtime (SSR) instead. Prerendering them would crawl live
  // pages that open Convex WebSockets, which keep `nuxt build` from exiting.
  routeRules: {
    '/playground': { prerender: false },
    '/playground/**': { prerender: false },
    '/login': { prerender: false },
  },
  // `app.css` is auto-imported by Docus (its css module appends `<srcDir>/app.css`
  // after Tailwind + Nuxt UI), so it isn't listed in `css` to avoid a double import.
  // Sonda reads source maps to report true post-minify/tree-shake sizes.
  sourcemap: { client: analyze },
  compatibilityDate: 'latest',
  nitro: {
    prerender: {
      ignore: ['/playground', '/login'],
    },
  },
  // The playground section (and the login page) use their own depth-design shell,
  // not the Docus docs chrome. Set the layout + hide the Docus header/footer for
  // those routes centrally so individual pages don't each need `definePageMeta`.
  hooks: {
    'pages:extend'(pages) {
      const isPlaygroundRoute = (path: string) =>
        path === '/login' || path === '/playground' || path.startsWith('/playground/')
      const walk = (list: typeof pages) => {
        for (const page of list) {
          if (page.path && isPlaygroundRoute(page.path)) {
            page.meta = { ...page.meta, layout: 'playground', header: false, footer: false }
          }
          if (page.children?.length) walk(page.children)
        }
      }
      walk(pages)
    },
  },
  backend: {
    // url: 'http://127.0.0.1:3210',
    // siteUrl: 'http://127.0.0.1:3211',
  },
  // Docus / Nuxt Content compile a SQLite WASM module in the browser (search +
  // client-side content queries). The bundled nuxt-security CSP must allow
  // WebAssembly compilation — extend `script-src` with `'wasm-unsafe-eval'`
  // (these mirror nuxt-security's defaults plus that one addition).
  security: {
    headers: {
      contentSecurityPolicy: {
        'script-src': [
          '\'self\'',
          'https:',
          '\'unsafe-inline\'',
          '\'strict-dynamic\'',
          '\'wasm-unsafe-eval\'',
          '\'nonce-{{nonce}}\'',
        ],
      },
    },
  },
})
