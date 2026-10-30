import { fileURLToPath } from 'node:url'
import Sonda from 'sonda/nuxt'
import { AGENT_SKILLS, CORE_SKILL } from '../src/guidance/skills'
import { readDocsPages } from './modules/docs-pages'
import { AGENT_LINKS, LLMS_DETAILS, llmsSections, SITEMAP_LABELS, skillsAddCommand } from './shared/agent-surfaces'
import { ASSISTANT_API_PATH, ASSISTANT_RATE_LIMIT, assistantEnabled, assistantFaqQuestions } from './shared/assistant'
import { DOCS_MCP_CARD, DOCS_MCP_NAME, DOCS_MCP_PAGE, DOCS_MCP_PATH, DOCS_MCP_RATE_LIMIT, DOCS_MCP_ROUTE, docsMcpUrl, MCP_SERVER_CARD_PATH } from './shared/docs-mcp'
import { docsRedirectRules } from './shared/docs-routes'
import { DOCS_VERSION } from './shared/docs-version'
import { routes } from './backend/routes'
import { MODULE_PAGES, ROOT_MODULE_PATHS } from './shared/module-pages'
import { isPlaygroundPath, mountPanelsPages, PANELS_BASE } from './shared/panels'
import { REPOSITORY } from './shared/page-keys'
import { SITE } from './shared/site'
import { THEME_COLOR } from './shared/theme-color'
import { insightsModules } from './shared/vercel'
import { codeThemeDark, codeThemeLight } from './shiki-themes'

/**
 * The error-reporting SDK's module options (`sentry` below): the site
 * reports errors, not performance, which Speed Insights measures. Its
 * tracing code, tree-shaken here, would weigh some 22 kB of every page's
 * initial JavaScript, past the bundle ceiling in the shape the live site
 * ships (CI's production-shape bundle check). And its build plugin sends
 * Sentry no usage telemetry.
 */
const sdkBuildOptions = { sentry: { telemetry: false, bundleSizeOptimizations: { excludeTracing: true, excludeDebugStatements: true } } }

// Bundle analysis is opt-in: `pnpm analyze` sets ANALYZE=true. Normal builds
// stay clean (no source maps, no report).
const analyze = process.env.ANALYZE === 'true'

// The canonical origin. Everything that needs an absolute URL — canonicals,
// OG image URLs, llms.txt and the sitemap (@nuxtjs/sitemap, which Docus
// registers) — reads it from here through `site.url`. Vercel builds `main`
// only (website/vercel.json), so there is no preview origin to account for.
const siteUrl = process.env.NUXT_SITE_URL || SITE.url

// One sentence for the site config (the meta description fallback) and
// llms.txt, from shared/site.ts; app.config.ts, the web manifest and the
// homepage repeat it, and test/docs/homepage.test.ts keeps them equal.
const siteDescription = SITE.description

// The whole site — product homepage, docs, and the playground — is one Nuxt
// app. Docus (extended as a layer) provides the docs theme, Nuxt Content,
// search, and SEO; `nuxt-backend` powers the live demos and the playground,
// which is Panels, the app the tutorial builds, copied from templates/panels
// (scripts/sync-panels.mjs) and mounted under /playground (shared/panels.ts).
export default defineNuxtConfig({
  extends: ['docus'],
  modules: [
    // Named here, and first, so nuxt-og-image finds it at setup. Nuxt UI pulls
    // @nuxt/fonts in as a dependency, but a dependency installs after every
    // listed module, and og-image checks for the fonts module once, in its own
    // setup: unlisted, it never reads the site's fonts and sets every social
    // card in its bundled Inter.
    '@nuxt/fonts',
    // Error reports come through its monitoring layer, as in any app: it
    // wires @sentry/nuxt (a dependency here) once a build sees a DSN, the
    // `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel integration sets, or MONITORING_DSN.
    'nuxt-backend',
    // Vercel's Web Analytics and Speed Insights (shared/vercel.ts): their
    // official modules, cookie-free, in a build on Vercel only, where their
    // scripts are served from the site's own origin.
    ...insightsModules(process.env),
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
          // Docus's list plus two. `http` for raw request/response samples,
          // which render as plain text without it.
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
  // What the docs assistant (`docus` below) offers before the first
  // message, a question per docs tab (shared/assistant.ts), and "Explain
  // with AI" in each page's aside (components/docs/DocsAsideRightBottom.vue).
  // Here rather than in app.config.ts, which cannot import; nothing there
  // sets `assistant`.
  appConfig: {
    assistant: {
      faqQuestions: assistantFaqQuestions(),
      explainWithAi: true,
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
    // Every route the docs ever published, the aliases and the short links
    // the CLI prints (shared/docs-routes.ts). Their Markdown twins redirect
    // in server/middleware/docs-twin-redirects.ts, off the browser's rules.
    ...docsRedirectRules(),
    // The site-wide default OG template — the machined plate. A route rule
    // decides the card's component even under an explicit `defineOgImage()`
    // (nuxt-og-image re-applies it once the page renders), so the homepage
    // names its own below.
    '/**': { ogImage: { component: 'Plate' } },
    // The homepage's own card, the landing plate: the rule above would
    // otherwise draw it on the docs plate whatever Docus's template asks.
    '/': { ogImage: { component: 'Landing' } },
    // The product homepage and docs prerender to static HTML. The playground
    // (Panels and the module's pages) and login are interactive pages backed
    // by live Convex queries — render them at runtime (SSR) instead.
    // Prerendering them would crawl live pages that open Convex WebSockets,
    // which keep `nuxt build` from exiting. They are the running app, not
    // docs: no search engine indexes them, no sitemap lists them, and they get
    // no OG image, as nothing about a signed-in session is worth rendering
    // into a social card, and each one would cost a render.
    [PANELS_BASE]: { prerender: false, ogImage: false, robots: false, sitemap: false },
    [`${PANELS_BASE}/**`]: { prerender: false, ogImage: false, robots: false, sitemap: false },
    '/login': { prerender: false, ogImage: false, robots: false, sitemap: false },
    // The playground tour Panels replaced: its feature pages go to the
    // playground, and the module's pages from their old group to where they
    // mount now.
    [`${PANELS_BASE}/client/**`]: { redirect: PANELS_BASE },
    [`${PANELS_BASE}/platform/**`]: { redirect: PANELS_BASE },
    [`${PANELS_BASE}/saas/**`]: { redirect: PANELS_BASE },
    [`${PANELS_BASE}/vanilla/**`]: { redirect: `${PANELS_BASE}/**` },
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
    // The docs MCP (shared/docs-mcp.ts), which the docs host and the docs
    // assistant both reach through this route: a bucket per IP of its own,
    // published as above. A request from the docs host is counted here, by
    // the caller's IP (server/middleware/docs-mcp-host.ts). Its tool calls
    // carry names such as `<PricingTable>`, which the XSS validator would
    // refuse as markup; the server only reads.
    [DOCS_MCP_ROUTE]: {
      security: {
        rateLimiter: { ...DOCS_MCP_RATE_LIMIT, headers: true },
        xssValidator: false,
      },
    },
    // The MCP server card answers by host (server/plugins/agent-surfaces.ts),
    // each describing the docs MCP at the docs host. A prerendered file would
    // be served on both hosts, so it renders per request; the docs pages link
    // it, which would otherwise prerender it.
    [MCP_SERVER_CARD_PATH]: { prerender: false },
    // The docs assistant's chat endpoint (shared/assistant.ts): a question
    // is one request, in a bucket per IP of its own. On Vercel the Firewall
    // holds the same budget across every instance
    // (server/middleware/0.firewall.ts). A question names components as
    // `<PricingTable>`, which the XSS validator would refuse as markup; the
    // chat renders the answer as Markdown, never the question as HTML. The
    // route itself (server/routes/__docus__/assistant.ts) caps the body and
    // what of it reaches the model.
    [ASSISTANT_API_PATH]: {
      security: {
        rateLimiter: { ...ASSISTANT_RATE_LIMIT, headers: true },
        xssValidator: false,
      },
    },
  },
  // `app.css` is auto-imported by Docus (its css module appends `<srcDir>/app.css`
  // after Tailwind + Nuxt UI), so it isn't listed in `css` to avoid a double import.
  // Sonda reads source maps to report true post-minify/tree-shake sizes.
  sourcemap: { client: analyze },
  compatibilityDate: '2026-10-14',
  telemetry: false,
  // The playground is Panels in its own shell (layouts/panels.vue, the
  // template's default layout), not the Docus docs chrome: the layout and the
  // hidden Docus header and footer are set here for every playground route,
  // so the synced pages stay the template's bytes. `/login` is not one: a
  // standalone full-screen page that opts out of layouts (login.vue).
  hooks: {
    // Panels' pages under /playground. Registered here, before any module's
    // hook, so the module finds Panels' welcome at its welcome path when it
    // mounts its pages, and its admin console adopts Panels' Demo tab.
    'pages:extend'(pages) {
      mountPanelsPages(pages, fileURLToPath(new URL('./pages', import.meta.url)))
    },
    // After every module has added its pages, so the module's pages under
    // /playground get the shell too.
    'pages:resolved'(pages) {
      // `/playground/offline` is the standalone page a build without a
      // deployment redirects to (middleware/playground-offline.global.ts);
      // like /login it opts out of layouts itself.
      const walk = (list: typeof pages, parent = '') => {
        for (const page of list) {
          const path = page.path.startsWith('/') ? page.path : `${parent}/${page.path}`
          if (isPlaygroundPath(path) && path !== `${PANELS_BASE}/offline`) {
            page.meta = { ...page.meta, layout: 'panels', header: false, footer: false }
          }
          if (page.children?.length) walk(page.children, path)
        }
      }
      walk(pages)
    },
  },
  // What agents find on the site (nuxt-agent-discovery, which Docus
  // registers); shared/agent-surfaces.ts says what each document holds, and
  // /docs/develop/agents/docs-for-agents lists them for people.
  agentDiscovery: {
    // The consumer agent skills (the core, nuxt-backend, and a task skill per
    // feature) live at the repository root (skills/), where
    // `npx skills add qruto/nuxt-backend` finds them. Docus serves the same
    // folder at /.well-known/skills, so
    // `npx skills add https://nuxt-backend.dev` lists them too.
    skills: { dir: '../skills' },
    // The playground (Panels and the module's pages) and /login are the
    // running app, not docs: no Markdown twin, no entry in sitemap.md or llms.txt, and an agent that
    // asks for one gets the page itself rather than a Markdown 404.
    excludePrefixes: { extend: [PANELS_BASE, ...ROOT_MODULE_PATHS] },
    // llms.txt's preamble: the version line, when to use the package and
    // when not, and how an agent should work.
    llms: { details: LLMS_DETAILS },
    // sitemap.md by tab, in the header's order, every page with its kind
    // (server/plugins/agent-surfaces.ts orders and labels it).
    sitemap: { markdown: { expand: ['/docs'], labels: SITEMAP_LABELS } },
    discovery: {
      // The card describes the docs MCP (shared/docs-mcp.ts), which this site
      // serves on its docs host; the site has no MCP endpoint of its own, so
      // server/plugins/agent-surfaces.ts fills in the docs MCP's URL and tools.
      mcpServerCard: {
        endpoint: DOCS_MCP_PATH,
        name: DOCS_MCP_NAME,
        ...DOCS_MCP_CARD,
        documentation: DOCS_MCP_PAGE,
        repository: REPOSITORY.url,
        license: 'MIT',
        version: DOCS_VERSION.line,
      },
      // The public-surface manifest and the rename map (the core skill's
      // files, which `skills` above serves and prerenders), the doctor
      // report's schema and the page that lists all of it: in the discovery
      // Link header, the API catalog and the Markdown 404.
      links: AGENT_LINKS,
    },
  },
  backend: {
    // The module's pages in the playground beside Panels (shared/module-pages.ts),
    // Panels' welcome among them, at routes.welcome.
    pages: MODULE_PAGES,
    // After sign-in, people land on their strips, as in the template.
    redirects: { afterSignIn: routes.strips },
  },
  // The error-reporting SDK's module, which the monitoring layer installs
  // once a build sees a DSN (above), with the options sdkBuildOptions says.
  // Nothing here names a DSN. Spread, as the key is typed only in a build
  // that installs the SDK.
  ...sdkBuildOptions,
  // With the toolkit off, its auto-imports are off too, and Docus's two docs
  // tools (its layer's server/mcp/tools/, which server/docs-mcp/tools.ts
  // imports) call `defineMcpTool` without importing it: a build would answer
  // the docs MCP with a ReferenceError. Name the one helper they rely on.
  nitro: {
    imports: {
      imports: [{ name: 'defineMcpTool', from: '@nuxtjs/mcp-toolkit/server' }],
    },
  },
  // The docs assistant (shared/assistant.ts): Docus's own, on for a build
  // that can reach its model through the AI Gateway, keyless through the
  // deployment's OIDC token on Vercel, or with AI_GATEWAY_API_KEY anywhere.
  // Without either, nothing of it renders and no endpoint answers. Not
  // Docus's own detection, which counts any OIDC token at build time, one
  // pulled into a local env file included. Its endpoint is the site's
  // (server/routes/__docus__/assistant.ts), which Docus's handler gives way
  // to: the same handler, with checks on what the chat sends in front. It
  // answers from the docs MCP's route (DOCS_MCP_ROUTE), the same server
  // mcp.nuxt-backend.dev serves. A build's Docus calls that path
  // in-process, forwarding the visitor's IP, so the route's per-IP budget
  // is the visitor's, and no request leaves the function. The docs host's
  // URL would send every visitor's calls from the function's one egress IP,
  // into a single bucket of the route's limit and of the Firewall's.
  docus: {
    assistant: {
      enabled: assistantEnabled(process.env),
      apiPath: ASSISTANT_API_PATH,
      mcpServer: DOCS_MCP_ROUTE,
    },
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
  // explicitly. The details preamble comes from `agentDiscovery.llms` above.
  //
  // One section per tab, titled as the tab is, with every hand-written page
  // of the tab as a link, its landing first and the rest in reading order
  // (shared/agent-surfaces.ts). The links are listed here rather than
  // queried by path, because a query comes back in path order, and
  // llms-full.txt follows these links: it reads as the docs do. The
  // generated API reference is left out of both: the Reference section names
  // its index in prose, and /sitemap.md lists it. The playground, the skills
  // and the notes are what the content can't know about; /playground is
  // excluded from agent discovery, so its link stays the page and
  // llms-full.txt skips it.
  llms: {
    domain: siteUrl,
    title: 'Nuxt backend',
    description: siteDescription,
    full: {
      title: 'Nuxt backend — complete documentation',
      description: 'Every hand-written documentation page of nuxt-backend in reading order, tab by tab, as one Markdown document.',
    },
    sections: [
      ...llmsSections(readDocsPages(fileURLToPath(new URL('./content', import.meta.url))), siteUrl),
      {
        title: 'Live playground',
        description:
          'Panels, the app the tutorial builds, running on the package for people: sign in with a one-time code or a '
          + 'passkey, then turn an idea into a comic strip against a real Convex deployment in sandbox mode. It is an '
          + 'app, not documentation, so it has no Markdown twin.',
        links: [
          {
            title: 'Playground',
            description: 'The tutorial\'s app, live, behind a sign-in.',
            href: `${siteUrl}${PANELS_BASE}`,
          },
        ],
      },
      {
        title: 'Agent skills',
        description:
          'The nuxt-backend skills for coding agents: the core skill holds the rules, commands and env of an app built on '
          + 'the package and routes each task to a task skill. Install them all with '
          + `\`${skillsAddCommand(siteUrl)}\`; in an app, \`npx nuxt-backend init --agents\` `
          + 'copies the ones its version ships, and `node_modules/nuxt-backend/skills/` holds them too.',
        links: [
          ...AGENT_SKILLS.map(({ name, covers }) => ({
            title: name,
            description: name === CORE_SKILL.name ? `Read it first: ${covers}.` : `The task skill for ${covers}.`,
            href: `${siteUrl}/.well-known/skills/${name}/SKILL.md`,
          })),
          {
            title: 'Skills index',
            description: 'Every skill the site publishes, with its files.',
            href: `${siteUrl}/.well-known/skills/index.json`,
          },
        ],
      },
    ],
    notes: [
      'The docs describe `nuxt-backend`: one npm package that installs a Nuxt module and an all-in-one Convex backend component.',
      `The docs answer as an MCP server too, read-only and with no sign-in: ${docsMcpUrl(siteUrl)} (${siteUrl}${DOCS_MCP_PAGE}).`,
    ],
  },
  // The site serves no MCP endpoint of its own: Docus's toolkit would mount
  // one at `/mcp` with its two docs tools, and the docs answer as an MCP
  // server on their own host instead, with those two tools and more
  // (server/api/docs-mcp.ts, shared/docs-mcp.ts).
  mcp: {
    enabled: false,
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
  //     explicit `defineOgImage()` call. The docs page asks for the plate
  //     by name, and Docus's landing template asks for `Landing`, which
  //     components/OgImage/Landing.takumi.vue answers in place of Docus's.
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
