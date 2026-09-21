import Sonda from 'sonda/nuxt'

// Bundle analysis is opt-in: `pnpm analyze` sets ANALYZE=true. Normal builds
// stay clean (no source maps, no report).
const analyze = process.env.ANALYZE === 'true'

// The canonical origin. Everything that needs an absolute URL — canonicals,
// OG image URLs, llms.txt — reads it from here (via `site.url`), so a preview
// deployment only has to set `NUXT_SITE_URL`.
// A Vercel preview is its own origin: canonical URLs, OG images and llms.txt
// on `*-git-<branch>-razum.vercel.app` must not point at the production site.
const siteUrl = process.env.NUXT_SITE_URL
  || (process.env.VERCEL_ENV === 'preview' && (process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL)
    ? `https://${process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL}`
    : 'https://nuxt-backend.dev')

// …except the sitemap. @nuxtjs/sitemap is not installed; /sitemap.xml is
// Docus's own route, and it builds each `<loc>` as `siteUrl ? siteUrl + loc :
// loc` where `siteUrl` comes from `inferSiteURL()` — which reads ONLY env vars
// (NUXT_PUBLIC_SITE_URL, NUXT_SITE_URL, VERCEL_*, URL, CI_PAGES_URL,
// CF_PAGES_URL) and never consults nuxt-site-config. So a deploy that relies
// on the fallback above shipped a sitemap of bare paths — invalid per the
// protocol, and easy to miss because canonical and og:url were absolute.
// Publishing the one canonical string back into the env closes that gap.
process.env.NUXT_SITE_URL ||= siteUrl

// ── Code colour ───────────────────────────────────────────────────────────
// The site has three colours and no brand hue, so the code blocks get the
// same three. Shiki's default here was @nuxt/ui's Material pair
// (material-theme-lighter / -palenight), which paints comments violet,
// strings lime and numbers orange — five hues that design.md explicitly
// rules out ("no brand accent, no blue, no violet").
//
// The two themes below are built from the ramps in app.css and nothing else:
// a titanium grey ramp carries structure (identifiers, punctuation,
// comments), amber marks the language's own machinery (keywords, storage,
// tags — "look here"), green marks values (strings, numbers, insertions —
// "go"), red marks what is wrong (invalid, deleted). Every colour clears
// 4.5:1 on the ground code sits on (`--sink`: #dadada light, #151515 dark);
// the ratios are in the comments.
//
// `theme` is typed `string | Record<string, string>` by @nuxtjs/mdc, but both
// consumers resolve a ThemeRegistration object at build time (@nuxt/content's
// `_getHighlightPlugin` passes non-strings straight through; @nuxtjs/mdc
// inlines them into its bundled-themes map keyed by `name`). Naming them as
// strings instead would make @nuxtjs/mdc emit an
// `import('@shikijs/themes/<name>')` that cannot resolve, so the objects are
// passed directly and the narrower type is cast away here.
//
// All THREE keys are set on purpose: the emitted CSS is
// `html .shiki span { color: var(--shiki-default) }` with `html.dark …`
// overriding it, so `default` is what light mode actually paints. Leaving any
// key unset lets @nuxt/ui's Material default survive the merge.
const codeInk = {
  light: {
    fg: '#1c1c1c', //  12.19:1 on #dadada — --ink
    dim: '#333333', //   9.04:1 — identifiers
    punct: '#4a4a4a', // 6.34:1 — punctuation & operators
    faint: '#5c5c5c', // 4.78:1 — comments
    warn: '#723e04', //  6.24:1 — --color-amber-600
    ok: '#065d2b', //    5.76:1 — --color-green-600
    okAlt: '#136d36', // 4.60:1 — --color-green-500
    err: '#8b1e1e', //   6.52:1 — --color-red-600
  },
  dark: {
    fg: '#ededed', //   15.60:1 on #151515 — --ink
    dim: '#c8c8c8', //  10.91:1 — --color-zinc-300
    punct: '#a8a8a8', //  7.68:1 — --ink-dim
    faint: '#8a8a8a', //  5.29:1 — comments
    warn: '#ce9622', //   6.97:1 — --color-amber-400
    ok: '#49b567', //     7.03:1 — --color-green-400
    okAlt: '#7dd296', // 10.03:1 — --color-green-300
    err: '#ee6d69', //    6.11:1 — --color-red-400
  },
} as const

function machinedTheme(name: string, type: 'light' | 'dark', bg: string) {
  const c = codeInk[type]
  return {
    name,
    type,
    bg,
    fg: c.fg,
    settings: [
      { settings: { foreground: c.fg, background: bg } },
      {
        scope: ['comment', 'punctuation.definition.comment', 'string.comment'],
        settings: { foreground: c.faint, fontStyle: 'italic' },
      },
      {
        scope: ['punctuation', 'meta.brace', 'meta.delimiter', 'keyword.operator', 'punctuation.definition.tag'],
        settings: { foreground: c.punct },
      },
      {
        scope: [
          'keyword', 'keyword.control', 'storage', 'storage.type', 'storage.modifier',
          'variable.language', 'constant.language', 'support.type.primitive',
          'entity.name.tag', 'markup.heading', 'keyword.other.unit',
        ],
        settings: { foreground: c.warn },
      },
      {
        scope: [
          'string', 'string.template', 'constant.character', 'punctuation.definition.string',
          'markup.inline.raw', 'markup.fenced_code', 'markup.inserted',
        ],
        settings: { foreground: c.ok },
      },
      {
        scope: ['constant.numeric', 'constant.language.boolean', 'constant.other', 'support.constant'],
        settings: { foreground: c.okAlt },
      },
      {
        scope: [
          'entity.name.function', 'support.function', 'meta.function-call',
          'entity.name.class', 'entity.name.type', 'support.class', 'support.type',
        ],
        settings: { foreground: c.fg },
      },
      {
        scope: [
          'variable', 'variable.other', 'support.variable', 'meta.object-literal.key',
          'entity.other.attribute-name', 'meta.attribute', 'meta.property-name',
        ],
        settings: { foreground: c.dim },
      },
      {
        scope: ['invalid', 'invalid.illegal', 'markup.deleted', 'message.error'],
        settings: { foreground: c.err },
      },
    ],
  }
}

// `--sink` in app.css: the ground `pre.slot` and the inline code chips sit on.
const codeThemeLight = machinedTheme('nuxt-backend-light', 'light', '#dadada')
const codeThemeDark = machinedTheme('nuxt-backend-dark', 'dark', '#151515')

// One sentence, used in three places that each want their own copy: the site
// config (meta description fallback), the SEO app config, and llms.txt.
const siteDescription
  = 'The all-in-one SaaS backend for Nuxt on Convex — authentication, billing, '
    + 'credits, transactional email, webhooks and an agent (MCP) surface from a '
    + 'single package.'

// OLD → NEW documentation routes, from the pre-`platform/` content tree. Every
// pair becomes a permanent (301) redirect below, so links published against the
// old structure — and search-engine indexes — keep landing on the live page.
const movedRoutes: Record<string, string> = {
  '/backend-components/overview': '/platform/overview',
  '/backend-components/email': '/platform/email/sending',
  '/backend-components/billing': '/platform/billing/subscriptions',
  '/backend-components/webhooks': '/platform/webhooks',
  '/backend-components/rate-limiting': '/platform/rate-limiting',
  '/backend-components/workflows': '/platform/workflows',
  '/backend-components/migrations': '/platform/migrations',
  '/backend-components/aggregates': '/platform/aggregates',
  '/backend-components/search': '/platform/search',
  '/backend-components': '/platform/overview',
  '/backend/auth-setup': '/platform/auth/setup',
  '/backend/customizing-auth': '/platform/auth/customizing',
  '/backend/local-installation': '/tooling/local-installation',
  '/backend/testing': '/tooling/testing',
  '/backend': '/platform/auth/setup',
  '/api-reference/theming': '/guide/customization',
}

const movedRouteRules = Object.fromEntries(
  Object.entries(movedRoutes).map(([from, to]) => [from, { redirect: { to, statusCode: 301 as const } }]),
)

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
        { name: 'apple-mobile-web-app-title', content: 'Nuxt backend' },
      ],
      // The favicon set generated from the house mark (`public/logo.svg`):
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
      // Fonts have no <link>s any more: @nuxt/fonts (shipped with Nuxt UI)
      // self-hosts every family named in app.css's `@theme --font-*` vars —
      // see `fonts` below. No third-party origin, no render-blocking
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
  // Use Node's built-in `node:sqlite` for Nuxt Content's local DB instead of the
  // `better-sqlite3` native addon — no node-gyp compile, no prebuilds, no
  // `allowBuilds` entry. Requires Node >= 22.5 at build & runtime (we pin >=24).
  content: {
    experimental: { sqliteConnector: 'native' },
  },
  // Syntax highlighting — the two house themes defined above. See the note
  // there for why the objects are passed directly and why all three keys are
  // set. The cast is the documented gap between @nuxtjs/mdc's `theme` type
  // (strings only) and what both build-time consumers actually accept.
  mdc: {
    highlight: {
      theme: {
        default: codeThemeLight,
        light: codeThemeLight,
        dark: codeThemeDark,
      } as unknown as Record<string, string>,
    },
  },
  routeRules: {
    // Permanent redirects for the pre-`platform/` docs tree (see `movedRoutes`).
    ...movedRouteRules,
    // The site-wide default OG template — the machined plate. Explicit
    // `defineOgImage()` calls win over it (see the `ogImage` note above).
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
  compatibilityDate: 'latest',
  nitro: {
    prerender: {
      ignore: ['/playground', '/login'],
    },
  },
  typescript: {
    // `@nuxt/content` is Docus's dependency, not this app's. Under pnpm's
    // isolated layout nothing beneath website/node_modules would resolve it,
    // and Content's generated `.nuxt/content/types.d.ts` imports it to augment
    // `Collections` — with `skipLibCheck` that unresolved import fails
    // silently, leaving every Docus component reading `Collections['docs']`
    // untyped. This workspace runs the hoisted linker (see pnpm-workspace.yaml)
    // so the import resolves today; the alias keeps it resolving if that
    // deviation is ever reverted.
    hoist: ['@nuxt/content'],
  },
  telemetry: false,
  // The playground section uses its own depth-design shell, not the Docus docs
  // chrome. Set the layout + hide the Docus header/footer for those routes
  // centrally so individual pages don't each need `definePageMeta`.
  // `/login` is NOT included: it's a standalone full-screen page that opts out
  // of layouts entirely (`layout: false` in login.vue) — wrapping it in the
  // playground layout would squeeze its centered card into the sidebar column.
  hooks: {
    'pages:extend'(pages) {
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
          if (page.children?.length) walk(page.children)
        }
      }
      walk(pages)
    },
  },
  backend: {
    // url: 'http://127.0.0.1:3210',
    // siteUrl: 'http://127.0.0.1:3211',
    // The playground mounts the SaaS page components under its own chrome
    // (/playground/saas/*) and the vanilla group shows the zero-config look
    // (/playground/vanilla/*) — so the root-level default pages stay off.
    // `login` stays default-but-shadowed by app/pages/login.vue (route
    // override demo); the accept-invitation page stays module-mounted.
    pages: {
      pricing: false,
      settings: false,
      profile: false,
      security: false,
    },
  },
  // This app is run from the repository root (`pnpm dev` starts the component
  // watcher, Convex and Nuxt together), so the base module must not rewrite
  // its `dev` script into `convex dev --start 'nuxt dev'` on the first boot.
  convex: { devScript: false },
  // Self-hosted webfonts. Families are declared in app.css's `@theme` block as
  // `--font-sans` (Nunito), `--font-display` (Bai Jamjuree) and `--font-mono`
  // (JetBrains Mono); @nuxt/fonts scans those declarations, downloads the
  // faces at build time and serves them from `/_fonts/`.
  //
  // Providers are pinned rather than discovered: @nuxt/fonts walks its
  // provider list per family (and also auto-scans `public/fonts`, which holds
  // the two OFL TTFs kept for the OG plate), so naming `google` keeps a cold
  // cache from resolving a family somewhere else — or resolving only the one
  // weight that happens to sit in `public/fonts`.
  //
  // Weights are the ones the site actually sets. Nunito carries body copy in
  // both slopes (the italic is used at 400); Bai Jamjuree is display-only and
  // preloaded because it paints the first heading in the viewport; JetBrains
  // Mono is code and the engraved mono labels.
  //
  // `global: true` on the two display/mono families is what the OG renderer
  // needs: nuxt-og-image reads its font data out of @nuxt/fonts' generated
  // `nuxt-fonts-global.css`, and a family that only ever arrives through CSS
  // scanning (a Tailwind v4 `@theme --font-*` var, which is how app.css
  // declares them) never lands there. Global emission adds the `@font-face`
  // rules to a stylesheet every page already loads; the files themselves stay
  // lazy.
  //
  // KNOWN GAP — this is necessary but not yet sufficient: the plate still
  // renders in the module's bundled Inter. Probe it by requesting an og:image
  // URL with `.json` in place of `.png` and reading its `fonts` array; today
  // that array is two `"family":"Inter"` fallbacks and neither house family.
  // The break is inside nuxt-og-image 6.7.8: the `#og-image/fonts` virtual
  // only awaits its component font-requirement scan (and only runs
  // `prepareWoff2Fonts`) when `hasSatoriRenderer()` is true, so on a
  // takumi-only setup `resolveOgImageFonts` filters `allFonts` against a
  // requirement set that has not been populated. Neither documented
  // workaround is safe here: a `.satori.vue` twin of the plate makes the
  // module detect a satori renderer whose `satori` dependency is not
  // installed, and `provider: 'local'` would repoint the two families at
  // `public/fonts`, which holds a single weight of each (600 and 500) — the
  // site would lose Bai Jamjuree 500 and JetBrains Mono 400/600/700 and serve
  // TTFs instead of woff2. Fix belongs upstream, or behind a module bump.
  fonts: {
    defaults: { subsets: ['latin', 'latin-ext'] },
    families: [
      { name: 'Bai Jamjuree', provider: 'google', weights: [500, 600], styles: ['normal'], preload: true, global: true },
      { name: 'Nunito', provider: 'google', weights: [400, 500, 600, 700, 800], styles: ['normal', 'italic'] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500, 600, 700], styles: ['normal'], global: true },
    ],
  },
  // llms.txt / llms-full.txt (nuxt-llms, registered by Docus). Docus defaults
  // `domain`/`title`/`description` from the site config, but a missing domain
  // makes the module bail before it registers the routes — so set it here
  // explicitly. @nuxt/content contributes one section per docs collection;
  // what's below is what content can't know about.
  llms: {
    domain: siteUrl,
    title: 'Nuxt backend',
    description: siteDescription,
    full: {
      title: 'Nuxt backend — complete documentation',
      description: 'Every documentation page of nuxt-backend, concatenated as one markdown document.',
    },
    sections: [
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
    ],
    notes: [
      'The docs describe `nuxt-backend`: one npm package that installs a Nuxt module and an all-in-one Convex backend component.',
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
  // this app's future tools belong in `server/agent/tools/`.
  // Docs agents read the site through /llms.txt and /llms-full.txt instead.
  mcp: {
    dir: 'agent',
  },
  // OG images (nuxt-og-image, registered by Docus and running its Takumi
  // renderer). Two notes on this version (6.7):
  //   • the module-level `fonts` option is gone — font data now comes from
  //     @nuxt/fonts, so the plate's "Bai Jamjuree" 600 and "JetBrains Mono"
  //     500 are the faces declared above. `fontSubsets` only covers families
  //     that @nuxt/fonts does NOT resolve.
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
