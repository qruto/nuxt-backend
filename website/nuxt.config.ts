import Sonda from 'sonda/nuxt'
import { DOCS_TABS, docsRedirectRules } from './shared/docs-routes'
import { BACKEND_PAGE_DEFS } from '../src/pages'
import { DOCS_VERSION } from './shared/docs-version'
import { SITE } from './shared/site'
import { THEME_COLOR } from './shared/theme-color'
import { codeThemeDark, codeThemeLight } from './shiki-themes'

// Bundle analysis is opt-in: `pnpm analyze` sets ANALYZE=true. Normal builds
// stay clean (no source maps, no report).
const analyze = process.env.ANALYZE === 'true'

// The canonical origin. Everything that needs an absolute URL — canonicals,
// OG image URLs, llms.txt and the sitemap (@nuxtjs/sitemap, which Docus
// registers) — reads it from here through `site.url`. Vercel builds `main`
// only (website/vercel.json), so there is no preview origin to account for.
const siteUrl = process.env.NUXT_SITE_URL || 'https://nuxt-backend.dev'

// Where the module's pages mount on this site. The pages an email or an agent
// links to stay at the root (`/login` is the site's own page); every other
// one mounts in the playground's vanilla group, the untouched zero-config
// look, so the site serves no indexable `/pricing`. A page the module adds
// later lands there without an edit here.
const ROOT_PAGES = new Set(['login', 'acceptInvitation', 'agentConsent'])
const MODULE_PAGES = Object.fromEntries(BACKEND_PAGE_DEFS
  .filter(def => !ROOT_PAGES.has(def.key))
  .map(def => [def.key, `/playground/vanilla${def.defaultPath}`]))
// The module pages left at the root render their own <main>, which Docus's
// default layout would wrap in a second (UMain): like /login, they go bare.
const BARE_MODULE_PATHS = new Set(BACKEND_PAGE_DEFS
  .filter(def => ROOT_PAGES.has(def.key) && def.key !== 'login')
  .map(def => def.defaultPath))

// One sentence for the site config (the meta description fallback) and
// llms.txt, from shared/site.ts; app.config.ts, the web manifest and the
// homepage repeat it, and test/docs/homepage.test.ts keeps them equal.
const siteDescription = SITE.description

// The whole site — product homepage, docs, and the interactive playground — is
// one Nuxt app. Docus (extended as a layer) provides the docs theme, Nuxt
// Content, search, and SEO; `nuxt-backend` powers the live demos & playground.
export default defineNuxtConfig({
  extends: ['docus'],
  modules: [
    // Named here, and first, so nuxt-og-image finds it at setup. Nuxt UI pulls
    // @nuxt/fonts in as a dependency, but a dependency installs after every
    // listed module, and og-image checks for the fonts module once, in its own
    // setup: unlisted, it never reads the site's fonts and sets every social
    // card in its bundled Inter.
    '@nuxt/fonts',
    'nuxt-backend',
    Sonda({ enabled: analyze }),
    // Keeps `onServerPrefetch` in the client build, where Nuxt strips it by
    // default. Vue numbers useId() past every component that registers one,
    // and Nuxt Icon registers one per icon, so with the calls gone from the
    // client every id after the header's icons differed from the server's,
    // and a tab's or an accordion's aria-controls pointed at nothing. A
    // module, because the default list is merged with defu, which appends.
    (_options, nuxt) => {
      const { client } = nuxt.options.optimization.treeShake.composables
      if (client.vue) client.vue = client.vue.filter(name => name !== 'onServerPrefetch')
    },
  ],
  // pages/__parts.vue is the parts gallery (design.md §Parts): a dev tool,
  // so a production build never sees it.
  $production: {
    ignore: ['pages/__parts.vue'],
  },
  devtools: { enabled: true },
  app: {
    // A cross-fade between pages. Nuxt skips it under
    // `prefers-reduced-motion: reduce`.
    viewTransition: true,
    head: {
      meta: [
        { name: 'color-scheme', content: 'light dark' },
        // The page ground per scheme; plugins/theme-color.client.ts follows
        // the mode a visitor picks.
        { key: 'theme-color-dark', name: 'theme-color', content: THEME_COLOR.dark, media: '(prefers-color-scheme: dark)' },
        { key: 'theme-color-light', name: 'theme-color', content: THEME_COLOR.light, media: '(prefers-color-scheme: light)' },
        { name: 'apple-mobile-web-app-title', content: 'Nuxt backend' },
      ],
      // The favicon set generated from the house mark (`pnpm run icons:generate`
      // rasterises `public/favicon.svg`, the flat variant of `public/logo.svg`):
      // a 96px PNG for browsers that ignore SVG icons, the vector itself, the
      // ICO for legacy consumers, the iOS touch icon, and the web manifest.
      //
      // `tagPriority` is load-bearing. Docus's own `app/app.vue` hardcodes a
      // keyless `useHead({ link: [{ rel: 'icon', href: '/favicon.ico' }] })`
      // that nothing can dedupe away — and a component's `useHead` merges
      // after `app.head`, so it would otherwise render last and win (browsers
      // take the final `rel="icon"` candidate). Pushing these past unhead's
      // default priority (100) puts our vector last. Verify against a real
      // response, not the config: the SVG link must be the last `rel="icon"`.
      //
      // Fonts have no <link>s: @nuxt/fonts self-hosts every family named in
      // app.css's `@theme --font-*` vars — see `fonts` below. No third-party origin, no render-blocking
      // stylesheet, and the OG renderer gets the same font data.
      link: [
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png', tagPriority: 120 },
        { rel: 'shortcut icon', href: '/favicon.ico', tagPriority: 120 },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png', tagPriority: 120 },
        { rel: 'manifest', href: '/site.webmanifest', tagPriority: 120 },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg', tagPriority: 121 },
      ],
    },
  },
  site: {
    url: siteUrl,
    name: 'Nuxt backend',
    description: siteDescription,
  },
  // The visitor's colour mode, under a key of this site's own: another
  // Nuxt app on the same origin (localhost) keeps its choice.
  colorMode: { storageKey: 'nuxt-backend-color-mode' },
  // Use Node's built-in `node:sqlite` for Nuxt Content's local DB instead of the
  // `better-sqlite3` native addon — no node-gyp compile, no prebuilds, no
  // `allowBuilds` entry. Requires Node >= 22.5 at build & runtime (we pin >=24).
  content: {
    experimental: { sqliteConnector: 'native' },
    build: {
      markdown: {
        // The generated reference documents members at h4; the default
        // depth (2) keeps them out of "On this page".
        toc: { depth: 3 },
        highlight: {
          // Docus's list plus two. `http` for raw request/response samples —
          // the MCP gate's 401 challenge renders as plain text without it.
          // `dotenv` so the `.env.local` samples can be fenced as what they
          // are rather than borrowing `bash`, as they do today.
          langs: ['bash', 'diff', 'json', 'js', 'ts', 'html', 'css', 'vue', 'shell', 'mdc', 'md', 'yaml', 'http', 'dotenv'],
        },
      },
    },
  },
  // Syntax highlighting: the two house themes from shiki-themes.ts. See the
  // note there for why the objects are passed directly. All three keys are set
  // on purpose: the emitted CSS is `html .shiki span { color:
  // var(--shiki-default) }` with `html.dark …` overriding it, so `default` is
  // what light mode actually paints, and a key left unset lets @nuxt/ui's
  // Material default survive the merge. The cast is the documented gap
  // between @nuxtjs/mdc's `theme` type (strings only) and what both
  // build-time consumers actually accept.
  mdc: {
    highlight: {
      theme: {
        default: codeThemeLight,
        light: codeThemeLight,
        dark: codeThemeDark,
      } as unknown as Record<string, string>,
    },
  },
  // Docus serves this as the version in /openapi.json; it would otherwise read
  // website/package.json, which has none, and say 0.0.0.
  runtimeConfig: {
    public: {
      docus: { version: DOCS_VERSION.line },
    },
  },
  routeRules: {
    // Every route the docs ever published, its Markdown twins, the aliases
    // and the short links the CLI prints (shared/docs-routes.ts).
    ...docsRedirectRules(),
    // The site-wide default OG template — the machined plate. Explicit
    // `defineOgImage()` calls win over it (see the `ogImage` note below).
    '/**': { ogImage: { component: 'Plate' } },
    // The product homepage and docs prerender to static HTML. The playground and
    // login are interactive, authenticated pages backed by live Convex queries —
    // render them at runtime (SSR) instead. Prerendering them would crawl live
    // pages that open Convex WebSockets, which keep `nuxt build` from exiting.
    // They get no OG image either: nothing about a signed-in session is worth
    // rendering into a social card, and each one would cost a render.
    '/playground': { prerender: false, ogImage: false },
    '/playground/**': { prerender: false, ogImage: false },
    '/login': { prerender: false, ogImage: false },
    // The only rate-limited surface (see `security` below for why it is not
    // global). `/api/**` is one API call per request, so a per-minute budget
    // means what it says; declaring `security` here also gives these routes
    // their own bucket key instead of sharing the site-wide `/**` one.
    // `headers: true` publishes the budget (x-ratelimit-*) so a client can
    // see it coming. The IP comes from h3's `getRequestIP(…, { xForwardedFor:
    // true })`, which already takes the first x-forwarded-for entry behind a
    // proxy — `ipHeader` would hand the limiter the raw header instead.
    '/api/**': {
      security: {
        rateLimiter: {
          tokensPerInterval: 240,
          interval: 60_000,
          headers: true,
        },
      },
    },
  },
  // `app.css` is auto-imported by Docus (its css module appends `<srcDir>/app.css`
  // after Tailwind + Nuxt UI), so it isn't listed in `css` to avoid a double import.
  // Sonda reads source maps to report true post-minify/tree-shake sizes.
  sourcemap: { client: analyze },
  compatibilityDate: '2026-10-14',
  telemetry: false,
  // The playground section uses its own depth-design shell, not the Docus docs
  // chrome. Set the layout + hide the Docus header/footer for those routes
  // centrally so individual pages don't each need `definePageMeta`.
  // `/login` is NOT included: it's a standalone full-screen page that opts out
  // of layouts entirely (`layout: false` in login.vue) — wrapping it in the
  // playground layout would squeeze its centered card into the sidebar column.
  hooks: {
    // After every module has added its pages, so the ones the module mounts
    // under /playground/vanilla get the shell too.
    'pages:resolved'(pages) {
      // `/playground/offline` is the standalone page a build without a
      // deployment redirects to (middleware/playground-offline.global.ts);
      // like /login it opts out of layouts itself.
      const isPlaygroundRoute = (path: string) =>
        (path === '/playground' || path.startsWith('/playground/')) && path !== '/playground/offline'
      const walk = (list: typeof pages) => {
        for (const page of list) {
          if (page.path && isPlaygroundRoute(page.path)) {
            page.meta = { ...page.meta, layout: 'playground', header: false, footer: false }
          }
          else if (page.path && BARE_MODULE_PATHS.has(page.path)) {
            page.meta = { ...page.meta, layout: false, header: false, footer: false }
          }
          if (page.children?.length) walk(page.children)
        }
      }
      walk(pages)
    },
  },
  // The consumer agent skill lives at the repository root (skills/), where
  // `npx skills add qruto/nuxt-backend -s nuxt-backend` finds it. Docus
  // serves the same folder at /.well-known/skills, so
  // `npx skills add https://nuxt-backend.dev -s nuxt-backend` works too.
  agentDiscovery: {
    skills: { dir: '../skills' },
  },
  backend: {
    pages: MODULE_PAGES,
  },
  // Self-hosted webfonts. Families are declared in app.css's `@theme` block as
  // `--font-sans` and `--font-display` (Anybody), `--font-mono` (Martian Mono)
  // and `--font-lcd` (Handjet); @nuxt/fonts scans those declarations,
  // downloads the faces at build time and serves them from `/_fonts/`.
  //
  // Providers are pinned rather than discovered: @nuxt/fonts walks its
  // provider list per family, so naming `google` keeps a cold cache from
  // resolving a family somewhere else. Nothing sits in `public/fonts`: the
  // social cards read the same faces as the pages (see `global` below).
  //
  // Anybody and Martian Mono are variable in weight and width: display runs
  // Anybody wide, prose at its normal width, and code and labels take Martian
  // Mono's narrower cuts. Google serves the width axis only when it is asked
  // for, through unifont's `experimental.variableAxis` (a family-level
  // `experimental` key is not forwarded; `providerOptions.google` is).
  // scripts/check-website-css.mjs fails the build when the built faces lose
  // the axis. Handjet is the LCD's face and nothing else.
  //
  // No `<link rel="preload" as="font">`. nuxt-security computes its SRI
  // hashes in `nitro:build:before`, but @nuxt/fonts writes the real font
  // bytes into its public-asset dir only in nitro's later `rollup:before`
  // hook — until then every `_fonts/*.woff2` is an empty placeholder. A
  // preloaded face would ship `integrity` of an empty file, the browser
  // would reject the response, and the face would silently fall back.
  // `@font-face` URLs carry no integrity, so without the preload they load.
  //
  // `global: true` on the two text families is what the OG renderer
  // needs: nuxt-og-image reads its font data out of @nuxt/fonts' generated
  // `nuxt-fonts-global.css`, and a family that only ever arrives through CSS
  // scanning (a Tailwind v4 `@theme --font-*` var, which is how app.css
  // declares them) never lands there. Global emission adds the `@font-face`
  // rules to a stylesheet every page already loads; the files themselves stay
  // lazy. It also skips the metric-matched fallback faces @nuxt/fonts writes
  // for an injected family, so app.css writes Anybody's and Martian Mono's by
  // hand (scripts/check-website-css.mjs holds them in the build).
  //
  // That only works when og-image can see @nuxt/fonts at all, which is why
  // the module is listed first in `modules`. Probe a card by requesting its
  // og:image URL with `.json` in place of `.png` and reading its `fonts`.
  fonts: {
    defaults: { subsets: ['latin', 'latin-ext'], preload: false },
    families: [
      {
        name: 'Anybody',
        provider: 'google',
        weights: ['100 900'],
        styles: ['normal', 'italic'],
        global: true,
        providerOptions: { google: { experimental: { variableAxis: { wdth: [['50', '150']] } } } },
      },
      {
        name: 'Martian Mono',
        provider: 'google',
        weights: ['100 800'],
        styles: ['normal'],
        global: true,
        providerOptions: { google: { experimental: { variableAxis: { wdth: [['75', '112.5']] } } } },
      },
      { name: 'Handjet', provider: 'google', weights: [500, 700], styles: ['normal'] },
    ],
  },
  // Docus bundles every icon the client may draw, found by scanning sources —
  // but Nuxt Icon's scan skips `.ts`, and the agent links name their brand
  // icons in shared/agent-prompt.ts. Unbundled, an icon the client drew first
  // (a tab switch, a client-side page change) stayed blank until it was
  // fetched.
  icon: {
    clientBundle: {
      scan: { globInclude: ['**/*.{vue,jsx,tsx,md,mdc,mdx,yml,yaml,ts}'] },
    },
  },
  // llms.txt / llms-full.txt (nuxt-llms, registered by Docus). Docus defaults
  // `domain`/`title`/`description` from the site config, but a missing domain
  // makes the module bail before it registers the routes — so set it here
  // explicitly. The section map is the one an agent reads first: one section
  // per area of the docs tree, and the generated TypeDoc pages left out — the
  // hand-written pages are what an agent should read, the reference is a
  // lookup surface it can reach by link. The playground section and the notes
  // are what content can't know about.
  llms: {
    domain: siteUrl,
    title: 'Nuxt backend',
    description: siteDescription,
    full: {
      title: 'Nuxt backend — complete documentation',
      description: 'Every documentation page of nuxt-backend, concatenated as one markdown document.',
    },
    sections: [
      // One section per tab (shared/docs-routes.ts); `LIKE '/tab%'` takes the
      // tab's own landing as well as the pages below it.
      ...DOCS_TABS.map(tab => ({
        title: tab.title,
        contentCollection: 'docs' as const,
        contentFilters: [
          { field: 'path', operator: 'LIKE' as const, value: `${tab.path}%` },
          ...(tab.exclude ? [{ field: 'path', operator: 'NOT LIKE' as const, value: `${tab.exclude}%` }] : []),
        ],
      })),
      {
        title: 'Live playground',
        description:
          'A running instance of the package: sign in with a one-time code or a passkey, then '
          + 'drive auth, billing, credits, email and webhooks against a real Convex deployment.',
        links: [
          {
            title: 'Playground',
            description: 'The interactive demo — every backend surface, live.',
            href: `${siteUrl}/playground`,
          },
        ],
      },
      {
        title: 'Agent skill',
        description:
          'The nuxt-backend skill for coding agents: the rules, commands, env and customization steps '
          + `of an app built on the package. Install it with \`npx skills add ${siteUrl} -s nuxt-backend\`.`,
        links: [
          {
            title: 'SKILL.md',
            description: 'The skill itself, served from /.well-known/skills.',
            href: `${siteUrl}/.well-known/skills/nuxt-backend/SKILL.md`,
          },
        ],
      },
    ],
    notes: [
      'The docs describe `nuxt-backend`: one npm package that installs a Nuxt module and an all-in-one Convex backend component.',
      DOCS_VERSION.released
        ? `They describe the ${DOCS_VERSION.line} line, the current release on npm.`
        : `They describe the ${DOCS_VERSION.line} line, which is not on npm yet: until it is, install the pkg.pr.new build of main.`,
      'Routes under /playground require a signed-in session and run against a live Convex deployment — they are demos, not documentation.',
      'The site exposes an OAuth-protected MCP endpoint at /mcp; agents authenticate as a real user before any tool is listed.',
    ],
  },
  // `/mcp` is this package's OAuth-gated agent surface — the product demo, and
  // the reason the route must stay where it is: an agent signs in as a real
  // user (RFC 9728 challenge → better-auth OAuth → token exchange) and only
  // then sees the account/billing/workspace tools.
  //
  // Docus ships two docs tools of its own (`list-pages`, `get-page`) in its
  // layer's `server/mcp/tools/`, and @nuxtjs/mcp-toolkit auto-discovers that
  // directory across every layer into ONE handler mounted at `mcp.route`.
  // There is no second route to move them to: `route` configures that single
  // auto-discovery endpoint, and named handlers (the toolkit's other option)
  // are file-based and still mount under `/mcp/<name>` — inside the prefix
  // the backend's auth gate covers. Left alone, the docs tools would sit
  // behind the OAuth challenge and 401 for every anonymous documentation
  // agent, which is worse than not shipping them.
  //
  // So the docs MCP is off: `dir` points auto-discovery at `server/agent/`
  // (which the Docus layer has no copy of) instead of `server/mcp/`. The
  // package's own built-in tools are unaffected — it contributes them by
  // absolute path through the toolkit's `mcp:definitions:paths` hook — and
  // this app's own tools live in `server/agent/tools/` (`todo-list`).
  // Docs agents read the site through /llms.txt and /llms-full.txt instead.
  mcp: {
    dir: 'agent',
  },
  // OG images (nuxt-og-image, registered by Docus and running its Takumi
  // renderer). Two notes that still hold on 6.9:
  //   • the module-level `fonts` option is gone — font data now comes from
  //     @nuxt/fonts, so the plate's Anybody (700 and 400) and Martian Mono
  //     (500) are the faces declared above. `fontSubsets` only covers
  //     families that @nuxt/fonts does NOT resolve.
  //   • `defaults.component` is gone too (the documented replacements are
  //     naming a component `OgImage/Default.<renderer>.vue`, or a route rule).
  //     The `/**` rule below is the route-rule form: it sits *under* an
  //     explicit `defineOgImage('Docs' | 'Landing', …)` call, which is how
  //     Docus's page templates keep their own plates.
  ogImage: {
    // The plate is a fixed 1200×630 slab (the standard 1.91:1 card); the
    // module's own default canvas is 1200×600, which would crop 30px off it.
    defaults: { width: 1200, height: 630 },
    fontSubsets: ['latin', 'latin-ext'],
    // Cards prerender while the build is still writing @nuxt/fonts' files
    // into .output/public/_fonts, so an early card finds no local file and
    // fetches the face from the provider instead. The default 3 s budget is
    // too short for that under a full parallel prerender: a few cards per
    // build fell back to Inter, a different few each time. The same budget
    // covers remote images a card fetches at runtime. The render budget
    // (15 s by default) has to outlast it, or a slow fetch leaves no time
    // to draw the card.
    security: { imageFetchTimeout: 15_000, renderTimeout: 30_000 },
  },
  // Docus / Nuxt Content compile a SQLite WASM module in the browser (search +
  // client-side content queries). The bundled nuxt-security CSP must allow
  // WebAssembly compilation — extend `script-src` with `'wasm-unsafe-eval'`
  // (these mirror nuxt-security's defaults plus that one addition).
  security: {
    // The bundled rate limiter is OFF site-wide, and deliberately so. Its
    // bucket key is `ip + resolveSecurityRoute(event)`, and that route is the
    // matched route-rule PATTERN — which, because of the `/**` ogImage rule
    // above, is `/**` for every request on the site. Left at the module
    // default (150 tokens / 5 min) that put every document, every /_nuxt
    // chunk, every font and every API call of every visitor into ONE counter:
    // a couple of ordinary page loads exhausted it and the site started
    // answering 429 with a Nuxt error page. A budget that a single page's
    // asset graph can spend is not a rate limit, it is an outage.
    //
    // Limiting therefore lives on the routes where a request is a request:
    // `/api/**` below, which covers the auth proxy and the agent surface.
    // Documents and static assets are unlimited here and belong behind the
    // CDN/edge in front of the deploy.
    rateLimiter: false,
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
