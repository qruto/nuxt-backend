# The documentation site

The Nuxt app behind the docs, the landing page and the live playground.

It deploys to Vercel. The `vercel.json` next to this file is its whole configuration, because the
Vercel project's **Root Directory** is set to `website`.

## Why `buildCommand` isn't just `nuxt build`

The site depends on `nuxt-backend` and loads it as a Nuxt module. pnpm links the repository root
into `node_modules`, but that link points at a package whose `dist/` is gitignored. On a fresh
clone the build dies before rendering anything (`Failed to load tsconfig '../.nuxt/tsconfig.json'`,
then `Cannot resolve module "nuxt-backend"`). So the command builds the package first:

- On a shallow clone, which Vercel's is, it first fetches the rest of the history from the
  public repository. The docs date each page by its last commit, and the sitemap's `lastmod`
  comes from that date, so a page last changed before the clone would go undated. If the fetch
  fails, those pages go undated, never wrongly dated, and the build goes on.
- `dev:prepare:lib` generates the repository root's `.nuxt/tsconfig.json`, the module stub and
  the Convex component. Without it `nuxt-module-build` can't resolve compiler options.
- `build` then replaces the stub with a real build — the module, the component and the DevTools
  panel. The stub symlinks `dist/runtime` at `src/`, fine for development, not for a deploy.
- Then the site's own build, in one of two ways:
  - **production** (`VERCEL_ENV=production` and a `CONVEX_DEPLOY_KEY`): `convex deploy --cmd 'nuxt build'
    --cmd-url-env-var-name NUXT_PUBLIC_BACKEND_URL` pushes `website/backend/` to the playground's
    production deployment, regenerates `backend/_generated` against it and builds the site with
    `NUXT_PUBLIC_BACKEND_URL` set to that deployment — the [Convex + Vercel](https://docs.convex.dev/production/hosting/vercel)
    pattern.
  - **anything else**: a plain `nuxt build`, even when a deploy key is present. Vercel's Convex
    integration writes `CONVEX_DEPLOY_KEY` into every environment; checking `VERCEL_ENV` keeps a
    pull-request preview from ever pushing its code to the live deployment. The site's `backend/_generated` is committed
    (regenerated and diff-checked by CI's `website` job), so the build needs no deployment; the
    playground renders its offline state (`/playground/offline`, via
    `middleware/playground-offline.global.ts` — without it the module's `auth` middleware fails
    the gated pages on the server).

The steps live in `vercel-build.sh`, which `vercel.json` runs: Vercel caps `buildCommand` at 256
characters, and `vercel.json` allows no comments — its schema rejects unknown properties,
including `$comment`. That's what this file and the script's comments are for.

## Only `main` deploys

`vercel.json` turns deployments off for every branch but `main` (`git.deploymentEnabled`), as
`nuxt-convex-module` does. CI's `website` job already type-checks and builds the site on every
pull request that changes it, and a preview could only show the playground offline, so a preview deployment
repeated that work on every push to a pull request. Keeping the rule in `vercel.json` rather
than in the dashboard's Ignored Build Step keeps it reviewed with the code; leave that dashboard
setting on Automatic.

## Settings that live in Vercel, not here

| Setting | Value | Why |
| --- | --- | --- |
| Root Directory | `website` | The app isn't at the repository root |
| Include source files outside the Root Directory | **on** | The package is built from the repo root |
| Node.js version | 24.x | `engines.node` |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Uses the `packageManager` pin instead of Vercel's own pnpm |
| `VERCEL_FORCE_NO_BUILD_CACHE` | `1` | No restored `node_modules`: with the hoisted linker, a cached tree plus a changed lockfile fails `pnpm install` with `ERR_PNPM_EEXIST` on the nested `node_modules` it tries to rename. The install costs a minute more and is deterministic |
| Production env | `CONVEX_DEPLOY_KEY` (the playground's production deployment — the Convex integration sets it), `NUXT_SITE_URL=https://nuxt-backend.dev` | The live playground's Convex project and the canonical origin. `NUXT_PUBLIC_BACKEND_URL` is not set here: the build injects the deployment's URL (the `.convex.site` twin is derived from it — `NUXT_PUBLIC_CONVEX_SITE_URL` only for a custom domain) |
| Preview and Development env | **nothing Convex-related** — remove the `CONVEX_DEPLOY_KEY` the integration adds to them | Nothing but `main` builds, and the build command ignores a key outside production anyway; removing it keeps the production key where it is needed |
| Analytics, Speed Insights | **on** (each tab → Enable) | The site loads their scripts from `/_vercel/…` in a Vercel build (`shared/vercel.ts`); until each is on, its script answers 404 |
| Security → OIDC federation | **on** (the default), and the team can use the AI Gateway | The docs assistant reaches its model with the deployment's OIDC token: no `AI_GATEWAY_API_KEY` on the project. Without a token at build time the assistant is left out |
| Firewall rules | `docs-assistant`, `docs-mcp` (below) | The edge rate limits `server/middleware/0.firewall.ts` checks; an id with no rule lets every request through |
| AI Gateway → Budgets | a project budget (`vercel ai-gateway budgets set project <name> --limit <usd> --refresh-period monthly`) | Every docs-assistant question is a billed model call from an anonymous visitor: the budget caps the month whatever the rate limits let through |
| Integrations → Sentry | installed and linked to this project | It sets `NEXT_PUBLIC_SENTRY_DSN` and the source-map names; the package's monitoring layer wires `@sentry/nuxt` from them at build |
| Automatically expose System Environment Variables | **on** (the default) | The functions read `VERCEL` and `VERCEL_ENV` to check the Firewall |

The playground's production deployment (`determined-horse-300`, created by the Convex integration)
is configured from a checkout, with its production deploy key — Vercel → Settings → Environment
Variables → `CONVEX_DEPLOY_KEY` (Production). Check the key first: `echo "${CONVEX_DEPLOY_KEY%%|*}"`
must print `prod:determined-horse-300`. Then, from the repository root, after `pnpm build`:

1. `AUTH_SECRET`, `SITE_URL`, `BACKEND_ENVIRONMENT` and `EMAIL_DEV_INBOX` directly — `.env.local` has no `AUTH_SECRET`, and its `SITE_URL` is
   the local origin. Generate the secret **only when the deployment has none**: a new one signs every
   user and agent out and leaves the stored JWKS keys undecryptable
   ([troubleshooting](https://nuxt-backend.dev/docs/ship/operate/troubleshooting#sessions-fail-after-changing-auth_secret-by-hand)).
   The names are read first, and nothing is set if that read fails: a failed read piped straight
   into `grep` would look like a missing secret and replace the real one.

   ```sh
   names=$(npx convex env list --names-only) \
     && { printf '%s\n' "$names" | grep -qx AUTH_SECRET \
       || npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"; }
   npx convex env set SITE_URL https://nuxt-backend.dev
   npx convex env set BACKEND_ENVIRONMENT sandbox
   npx convex env set EMAIL_DEV_INBOX 1
   ```

   `EMAIL_DEV_INBOX=1` publishes the dev inbox to the playground's sign-in form, which shows the
   code sent to a test address. Playground accounts are test addresses nobody can open, so without
   it no visitor can sign in. `env push --prod` never sets it: it goes to dev deployments only.
2. The rest from `.env.local` — `pnpm cli env push --prod`. It never replaces a value already set,
   so step 1 survives. It refuses a bare `--force` (or `all`): from a dev `.env.local` that would
   overwrite `SITE_URL` with the local origin. Name each value to replace. `BACKEND_ENVIRONMENT` is `sandbox` on the live playground, set in step 1 (this push sets
   `production` only where it finds none): the playground runs in production mode and bills
   against the provider's sandbox, never its production.
3. The webhook secrets belong to the production endpoints (`https://determined-horse-300.convex.site/billing/events`
   and `/email/events`, registered in the Polar sandbox and Resend dashboards), not to the dev ones
   `env push` copies: set each with `npx convex env set`.
4. `npx convex run billing:syncProducts`, then `pnpm cli doctor --prod`.

Every `npx convex` above runs with the key in the environment; prefix it per command rather than
exporting it into a shell you keep using.

## Rate limits at the edge

`server/middleware/0.firewall.ts` asks the Vercel Firewall about three endpoints before they answer, each
against a rule of its own (`shared/firewall.ts`). Create each one in the dashboard: Firewall → Configure →
New Rule, **If** `@vercel/firewall` equals the id, **Then** Rate Limit, fixed window, counted by IP, `429`;
then Publish.

| Rule id | Counts | Budget per IP |
| --- | --- | --- |
| `docs-assistant` | the docs assistant's chat endpoint, `/__docus__/assistant` | 10 requests / 60 s |
| `docs-mcp` | the docs MCP: `/mcp` on `mcp.nuxt-backend.dev`, and `/api/docs-mcp` on the site | 120 requests / 60 s |

A request the site makes to itself (the docs host handing `/mcp` to `/api/docs-mcp`, the assistant reading
the docs) is not counted again, and the check hands the Firewall no cookies or tokens.
Off Vercel the middleware does nothing, and before a rule exists the Firewall lets the request through;
the per-IP limits in `nuxt.config.ts` (10 a minute for the assistant, 120 for the docs MCP) hold in every
server instance either way. [Deploy to Vercel](https://nuxt-backend.dev/docs/ship/deploy/vercel) is the
same setup written for apps.

## The preview on a pull request

Vercel builds `main` only, so the website has no per-branch preview: CI's `website` job builds
and type-checks it instead. The one preview is the package itself: the pkg.pr.new comment opens
`templates/starter` on StackBlitz, a real Nuxt app running the pull request's *package build*,
with **your** Convex (`npm run dev` logs you in to Convex in the StackBlitz terminal).

## The playground is a sandbox

The live playground is Panels, the app the tutorial builds: `templates/panels`, copied into this
site by `pnpm panels:sync` (`scripts/sync-panels.mjs`) and mounted under `/playground` with the
module's pages beside it. Edit it in the template, never here. Its deployment runs as a sandbox
(`BACKEND_ENVIRONMENT` is `sandbox`), where Panels holds itself to a public demo, and nothing in
it is real:

- **Accounts are sandbox identities**, `delivered+<16+ random characters>@resend.dev`, generated on
  `/login`. `canSignIn` and the email-change and invitation hooks in `backend/auth.ts` refuse any
  other address on a sandbox. Email runs in Resend's test mode, which delivers only to such
  addresses. Nobody can open those mailboxes, so the package's sandbox inbox shows their mail on
  `/login`.
- **Payments** go through the Polar sandbox (card `4242 4242 4242 4242`).
- **Strips** start from canned ideas an administrator draws once from the admin console's Demo
  tab; an idea of one's own needs a passkey sign-in, share links are off, and strips older than a
  day go each night (`backend/demo.ts`, `backend/crons.ts`). `spendLimit` in `backend/ai.ts`
  pauses AI for the rest of a costly day.
- **The admin** is a sandbox identity too, promoted with `functions:setUserRole`, signs in with a
  passkey only, and is the only one: no visitor is ever promoted. The admin console lists every
  sandbox account; an impersonation from it lasts thirty minutes and never visits another
  administrator.

## Running it locally

```sh
pnpm dev          # from the repository root — convex dev + the component watcher + nuxt dev
```

The site then reads the deployment `convex dev` wrote to `.env.local`, so the playground and the
live demos on the docs run against your own deployment, never the public one. A demo's footer
names the deployment it runs against, and says when it runs on this machine.

The docs assistant stays out of a local build unless `.env.local` holds an `AI_GATEWAY_API_KEY`
(`shared/assistant.ts`); with one, every question is a billed model call on that key. An OIDC token
`vercel env pull` wrote there does not count, and neither does the `VERCEL="1"` it writes beside it
(with `VERCEL_ENV="development"`). Vercel's analytics modules and the Firewall check stay out of every
build and server that is not on Vercel.

## The docs MCP host

The docs answer as a read-only MCP server at `https://mcp.nuxt-backend.dev/mcp`
([Docs MCP](https://nuxt-backend.dev/docs/develop/agents/docs-mcp)). It is this same app on a second
host: `server/middleware/docs-mcp-host.ts` answers `/mcp` on any host whose first label is `mcp`
from the docs MCP's route, `/api/docs-mcp`, so there is no rewrite in `vercel.json` and no second
project. On that host the middleware answers 404 for `/mcp/*`, lets the MCP
server card (`/.well-known/mcp/server-card.json`) through to the site's route, which describes the
docs MCP and is never prerendered, and
sends every other path to the site with a 308, so sign-in, cookies and the playground stay on one
origin. Prerendered files are the exception: Vercel serves them before the function on any host,
each with its canonical link to the site.

The host has to exist before this merges: main deploys straight to production, and every surface
that names the URL (the docs host's server card, llms.txt, the page header, the docs) goes live
with it. The host only needs to reach the project:

1. Vercel → the project → Settings → Domains → add `mcp.nuxt-backend.dev`, serving production (no
   redirect to the apex: the middleware tells the hosts apart, and `/mcp` must answer there).
2. At the DNS provider, the `CNAME` Vercel asks for, `mcp` → `cname.vercel-dns.com`.
3. `node scripts/check-website-agents.mjs --origin https://nuxt-backend.dev` then calls every
   tool on the host, as the weekly job does.

Locally, `https://mcp.nuxt-backend.localhost/mcp` reaches the dev server once the portless proxy
routes subdomains to their parent: start it with `portless proxy start --wildcard` (or set
`PORTLESS_WILDCARD=1` before the first `pnpm dev` starts it). Without that,
`https://nuxt-backend.localhost/api/docs-mcp` is the same server.

## Live demos in the docs

A docs page can run a piece of the package in place: a `::demo-*` block, such as `::demo-sign-in`
on the sign-in page. Each one is a `<DemoBlock>` (`components/DemoBlock.vue`) around a lazy live
part, and the page says `demo: true` in its frontmatter. The backend client loads only for such a
block: when it scrolls into view, or, for a demo that shows nothing until the reader acts, such as
signing in (`load="click"`), when they press its start key. Every other docs page, and the home
page, never downloads it (the playground and the sign-in page load it before they render).
`scripts/check-website-bundle.mjs` holds the built site to that, and keeps what a demo loads once
it starts under its ceiling.
[CONTRIBUTING.md](../CONTRIBUTING.md) has the steps to add one.
