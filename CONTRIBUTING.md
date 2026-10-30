# Contributing to nuxt-backend

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Security Issues](#reporting-security-issues)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [The Component Contract](#the-component-contract)
- [Adding a Notification Channel or a Kind](#adding-a-notification-channel-or-a-kind)
- [Submitting Changes](#submitting-changes)
- [Code Quality](#code-quality)
- [Budgets](#budgets)
- [Commit Convention](#commit-convention)
- [Git Hooks](#git-hooks)
- [Writing Documentation](#writing-documentation)
- [Releasing](#releasing)

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.

## Reporting Security Issues

Security vulnerabilities never go in a public issue, discussion, or pull request. Report them
privately through GitHub's
[private vulnerability reporting](https://github.com/qruto/nuxt-backend/security/advisories/new)
(**Security** tab → **Report a vulnerability**), which opens a draft advisory visible only to you
and the maintainers. [SECURITY.md](SECURITY.md) covers scope, response times, and what happens
after you report.

## Development Setup

**Prerequisites:** Node.js 24.11+ (latest LTS, matching `engines` in `package.json`), pnpm 11.6+
(`pnpm install` also points Git at the repo's [`.githooks/`](./.githooks) — see
[Git Hooks](#git-hooks); CI enforces the same gates either way)

> **Existing clones.** Earlier versions registered commitlint as a Git config-based hook. Git runs
> those *in addition* to `core.hooksPath`, so remove the old registration once, or every commit
> message is linted twice:
>
> ```bash
> git config --unset-all hook.commitlint.event; git config --unset-all hook.commitlint.command
> ```

```bash
# Clone the repository
git clone https://github.com/qruto/nuxt-backend.git
cd nuxt-backend

# Install dependencies
pnpm install

# Run the test suite
pnpm test

# Build the package
pnpm build
```

The `website/` directory is a full Nuxt app (product homepage · docs · interactive playground) wired to the local package. Start it with:

```bash
pnpm dev
```

Both serve through [portless](https://portless.sh): `pnpm dev` publishes the app
at `https://nuxt-backend.localhost`, and `pnpm dev:lan` runs the same stack with
the proxy in LAN mode, advertising `https://nuxt-backend.local` over mDNS so
phones and other devices on the same network can open it. Auth trusts one
browser origin, `SITE_URL`, so for sign-in from a device set it to the LAN
origin on the deployment (a `development` `BACKEND_ENVIRONMENT` keeps
`https://nuxt-backend.localhost` signing in on this machine too), or use
`pnpm try --lan`, which does both on a local deployment:

```bash
npx convex env set SITE_URL https://nuxt-backend.local
```

Devices also need the portless CA trusted (or they'll see a certificate
warning); `portless trust` covers this machine only, and
[On a phone](https://nuxt-backend.dev/docs/start/playground/try-everything#on-a-phone)
has the steps for iOS and Android. A running proxy keeps its mode (LAN or not):
`portless proxy stop` before switching between `pnpm dev` and `pnpm dev:lan`.

**Try everything on the providers' sandboxes.** `pnpm try` runs the whole site on a
local Convex deployment with every provider in its test mode (Polar's sandbox,
Resend's test addresses), seeds a persona per kind of account, and serves at `https://nuxt-backend.localhost`; the
[Try everything](https://nuxt-backend.dev/docs/start/playground/try-everything)
guide is its checklist, one row per playground page.

```bash
pnpm try                # https://nuxt-backend.localhost
pnpm try --lan          # https://nuxt-backend.local, for a phone on this network
pnpm try --tailscale    # this machine's tailnet name, trusted certificates (real iOS passkeys)
pnpm try:reset          # empty the local deployment and seed the personas again
pnpm try:notes          # the review notes left with N, as Markdown by page
pnpm try:starter        # the packed package in a fresh templates/starter, at https://starter.localhost
```

- **Two env files.** `pnpm dev` uses the deployment the root `.env.local` names,
  which may be a cloud one. The try kit uses the one `website/.env.local` names,
  the file the Convex CLI writes in `website/` (the component codegen uses it
  too): a local deployment only, provisioned with no account when there is none.
  It refuses a cloud or self-hosted deployment, a deploy key, and another
  checkout's local deployment holding the same ports.
- **What it sets.** `env push` on the local deployment, `SITE_URL` at the origin
  it serves, a `development` `BACKEND_ENVIRONMENT` (which trusts any `https://*.localhost`
  origin), the sandbox keys of the root `.env.local` (a Polar sandbox token, a
  Resend key) and the catalog synced to Polar's sandbox, email in test mode. It proxies the
  deployment's two URLs beside the app (`https://api.nuxt-backend.localhost`,
  `https://site.nuxt-backend.localhost`) and removes the proxies when it stops.
- **Personas** come from the seed registry, `scripts/try/personas.mjs` and
  `scripts/try/seeds.mjs`: an account and its workspace through the website's
  `personas:*` functions (refused on any deployment that is not local: a
  loopback URL with the `TRY_KIT_LOCAL` marker the kit sets), and the free
  plan through the package's own start. Anything that costs a payment (a paid
  plan, a pack, a gift) is bought once at Polar's sandbox checkout with the test
  card: the kit lists which persona needs which purchase.
  A feature that needs someone new adds a persona and the seed step for its
  fields, and a row to the guide; `test/unit/try-personas.test.ts` and
  `test/docs/try-guide.test.ts` fail until both are there.
- **Review notes** are dev-only: `website/modules/try-kit` adds the overlay
  (press N) and its endpoint to `nuxt dev` alone, writing
  `.review/notes.jsonl`, which git ignores.
- `PORTLESS=0 pnpm try` serves on `http://localhost:3000` with no proxy, and
  `--name <name>` serves under another name, beside another checkout. A running
  portless proxy keeps its mode, so the origins above hold for a proxy started
  in that mode: the kit prints the one it serves at, and `portless proxy stop`
  switches.

**A public URL for remote agents.** `pnpm dev:website:share` runs the same dev server behind an
ngrok tunnel and prints the public URL — what claude.ai's custom connectors and other remote MCP
clients need, since they cannot reach `localhost`. Append `/mcp` and hand that to the client, and
set the deployment's `SITE_URL` to the tunnel's origin while you test (the OAuth flow trusts no
other browser origin).

**Running the CLI from this repository.** Use `pnpm cli <command>` (after `pnpm build`), not
`npx nuxt-backend`: the repository root has no `node_modules/.bin/nuxt-backend`, so `npx` fetches
the published package from npm instead of running your checkout.

**Re-linking the dev deployment.** The website's Convex dev deployment is the `CONVEX_DEPLOYMENT` in
the root `.env.local`. If the Convex CLI answers "You don't have access to the selected project",
you are signed in as a different Convex account: `npx convex logout`, then `npx convex dev` and
sign in as the account that owns the project — or `npx convex dev --configure existing` to pick
one. When the deployment changes, check the URLs pinned in `.env.local` (`CONVEX_URL`,
`CONVEX_SITE_URL`, `NUXT_PUBLIC_BACKEND_*`): they win over what the slug would derive.

**Never export a production deploy key in a shell you develop in.** The Convex CLI follows
`CONVEX_DEPLOY_KEY` over `.env.local`, so every `npx convex …` in that shell acts on
production. Prefix the one command that needs it (`CONVEX_DEPLOY_KEY=… npx convex env set …`).
`pnpm db:reset` and `pnpm db:seed` drop a key exported in the shell before calling Convex, and
stop when `.env.local` holds one (remove it by hand). Only `db:reset --prod` keeps the shell's
key, for the deploy rule below. `env push --prod` / `doctor --prod` refuse a dev or preview key.

**Resetting data.** `pnpm db:reset` empties the dev deployment. It reads every table from the
schemas themselves and clears each one with an empty `convex import --replace`. Pass scopes to
narrow it:

- `app`: the website's tables, uploads, message aggregates and counters.
- `backend`: the backend component (accounts, sessions, workspaces, the billing cache, gifts).
- `email`: the email provider's component.
- `polar`: the billing provider's component. Refill its products with
  `npx convex run billing:syncProducts '{}'`.

For example, `pnpm db:reset backend polar`. `pnpm db:seed` loads the demo data again.

**The playground deploy rule.** Every merge to `main` deploys nuxt-backend.dev, so a pull request
must leave production working:

- **Schema changes are additive** (new tables, optional fields), or the pull request names the
  reset it needs, and the maintainer runs it on production just before merging:
  `pnpm db:reset --prod --yes <scopes>`. Without `--yes` it only lists what it would empty.
- **New environment variables** are optional or derived from `AUTH_SECRET`, and are set on
  production before merge.

### The DevTools panel

The Backend tab in Nuxt DevTools is its own Nuxt app,
[`devtools-client-app/`](./devtools-client-app), which `pnpm build` generates into
`dist/devtools-client` and the published package serves from there. Next to the stub that
`pnpm dev` builds, that directory does not exist, so the module proxies the tab to a dev server
instead. Start it beside `pnpm dev`:

```bash
pnpm dev:panel   # port 3631 — the port the module's proxy expects
```

The route and the port are `DEVTOOLS_UI_ROUTE` and `DEVTOOLS_UI_LOCAL_PORT` in
`src/devtools/rpc-types.ts`, which the panel's `nuxt.config.ts` imports (3630 belongs to the base
module's Convex tab). The panel hot-reloads over its own HMR socket, which the module's proxy
cannot carry — that is why it has a port of its own. A full `pnpm build` leaves a built copy in
`dist/devtools-client`, and the module serves that in preference to the proxy: delete the
directory to get the dev server back.

How it fits together:

- **Every DevTools hook** (the tab, the RPC) is in `src/devtools/register.ts` and the serving
  (a dev-server handler, or the proxy above) in `src/devtools/serve.ts`, so the move to
  DevTools 4 (Vite DevTools docks) stays in those two files. The kit is imported for types only.
  The RPC's handlers are in `src/devtools/rpc.ts`, its types in `src/devtools/rpc-types.ts`,
  shared with the panel.
- **Live app state** comes from `src/runtime/devtools/`: a dev-only plugin mirrors the
  composables into a versioned bridge (`version: 3`; bump it with any change to its shape). The
  panel's first `activate()` starts the queries a page would not run anyway, and `on-demand.ts`
  loads what a tab asks for. `events.ts` turns two snapshots into activity entries; the bridge
  keeps the last 200 and the plugin mirrors them to the Vue DevTools timeline. Nothing secret crosses: env names only, never values; no session token or passkey
  credential (tests pin both).
- **Colour is a signal**: `app/utils/signal.ts` maps every status to ok (green), warn (amber),
  err (red) or off (grey), and a unit test rejects any other badge colour or a provider name in
  a label. The UI kit's own green is overridden to grey in the panel's config.
- **One page, tabs**: `app/nav.ts` lists the tabs, `app/components/panel/` holds one component
  per tab, and `app.vue` switches between them, so the panel ships without vue-router. The
  DevTools docs page and the homepage drawing list the same tabs (the docs contract checks both).
- **Checks**: `pnpm typecheck:devtools-client` (part of `pnpm test:types` and CI), the
  `devtools-*` unit tests, and `test/nuxt/devtools-plugin.test.ts` for the bridge.
- **Icons**: UnoCSS's icon preset skips its loader inside VS Code's terminal; the panel config
  clears that flag, so a build from any terminal ships its icons.

## Project Structure

```
src/                  # Module source (Nuxt module + Convex component)
devtools-client-app/  # Nuxt DevTools panel app (served in the DevTools iframe)
templates/            # `create nuxt` templates: standalone apps of the published package
examples/             # Standalone apps of the published package — outside the pnpm workspace
test/                 # Vitest unit, Convex component, Nuxt and end-to-end tests
website/              # Nuxt app: product homepage · docs (Docus) · interactive playground
```

`templates/` and `examples/` are **standalone apps of the published package**, deliberately
outside the pnpm workspace (`pnpm-workspace.yaml` excludes them): each depends on
`nuxt-backend: latest` and on plain version ranges — no `workspace:*`, no `catalog:` — so
`pnpm create nuxt@latest my-app -t gh:qruto/nuxt-backend/<path>` is exactly what a user gets.
They stay linted, but are excluded from the root tsconfig and from fallow (they resolve against
the *published* package, not `src/`). Each has a job beyond being documentation:

- **[`templates/starter/`](./templates/starter)** — the app to build on. Its `backend/` is
  byte-identical to what `npx nuxt-backend init` scaffolds (a unit test enforces it), the e2e
  suites build it against a stub deployment, and it is the app behind the **Open in StackBlitz**
  link on every pull request: `preview.yml` hands it to pkg.pr.new as `--template` with the
  PR's package build wired in.
- **[`templates/panels/`](./templates/panels)** — the app the tutorial builds, and the
  site's playground: nuxt-backend.dev serves it under `/playground`. **Edit Panels in
  `templates/panels/`, then run `pnpm panels:sync`**: `scripts/sync-panels.mjs` copies
  `app/` to the site's root and `backend/` to `website/backend/` byte for byte (the layout
  becomes `layouts/panels.vue`, the landing `pages/playground/index.vue`, and the site's
  `backend/routes.ts` says `base = '/playground'`). The site's own files (its config, its docs
  pages, the docs demos' counter, codegen) are the script's `OWNED`. CI runs
  `node scripts/sync-panels.mjs --check`, and `test/unit/panels-sync.test.ts` pins the mount,
  the catalog and the dependencies.
- **[`examples/advanced/`](./examples/advanced)** — every customization seam at once (local
  component install, custom pages, overridden auth).

The `pack` CI job copies all three and installs the packed tarball over the `latest` dependency
twice: with plain `npm`, then builds, and with pnpm, which proves each app's `.pnpmfile.mjs`
(the only pnpm setting a template can carry: a `pnpm-workspace.yaml` makes `create nuxt`
treat it as pnpm-only). That is the only place a registry-shaped install (lifecycle scripts,
engines, export maps) is exercised at all. Keep them self-contained — no import that only
resolves from the repository root, no undeclared dependency, no committed lockfile.

## The Component Contract

Every component the module registers from `src/runtime/vue/components/` keeps one contract, and
[`test/nuxt/component-contract.ts`](./test/nuxt/component-contract.ts) holds its row. A new
component lands with its row, or `test/module/registration.test.ts` fails; a base-module
component passed through under a neutral name goes in `CONTRACT_EXEMPT` there, with the reason.
Each column is checked:

| Column | What the component owes | Checked by |
|---|---|---|
| `file` | The file it is registered from | `test/module/registration.test.ts` |
| `slots` | `slots: Object as SlotsType<…Slots>`, an interface in the component's file with one documented entry per region, each typed with what the slot receives | `test/types/component-contract.test-d.ts` (the names), the contract test (each renders) |
| `emits` | An `emits` object of validators, never an array | the contract test |
| `family` | `data-<family>` on its root and every element it renders (phrasing such as `<strong>` and `<code>` inside a hooked element excepted) | the contract test |
| `labels` | Its words from that label group, and a `labels` prop | the contract test, `test/unit/label-literals.test.ts` |
| `states` | Something deliberate for each: `loading` and `pending` mark the waiting part `aria-busy` (loading with a status in words), `empty` is a polite `role="status"`, `error` is a `role="alert"` with no empty note beside it, `refused` shows no control the server would refuse (the staging's `absent` selectors) | the contract test, which renders each state |
| `a11y` | Every control named by the words it shows (never a separate `aria-label` with words of its own, which an override or a translation would leave behind); a repeated control in a group named by what it acts on (`aria-labelledby` on its name), which also describes it; a busy button `aria-disabled`, not `disabled`, saying what it waits for, with a status announcing it; focus moves only on a step the person started | the contract test, and the [Accessibility](https://nuxt-backend.dev/docs/build/ui/accessibility) page, which `test/docs/component-contract.test.ts` holds to the row |

The contract test stages each state through the composables the component reads (`STAGING` in
the test); a new state is a new arrangement there. The browser side is the axe-core smoke in
`test/e2e/starter.test.ts` (`AXE_STEPS`): a pull request that adds a module page adds a line for
each step of it a visitor reaches, and `pnpm test:e2e` runs it in the light and the dark scheme.

## Adding a Notification Channel or a Kind

A notification is written in the transaction that records its event (`audit.record` calls
`notifyEvent` in `src/convex/components/backend/notifications.ts`). The pieces, and where each lives:

- **A kind.** An event type of the catalog (`src/convex/events.ts`) that declares the `in-app`
  channel needs a row in `NOTIFICATION_KINDS` (`src/convex/notifications.ts`): who it tells
  (`audience`), the ready-made page it links to, and whether the person who did it hears of it
  (`skipSelf`). `test/unit/notifications-catalog.test.ts` fails until the row exists, and its
  words (`title`, `body`) are in the `notifications` label group.
- **The matrix.** `notificationChannels` decides what a kind may use. A billing, gift, referral or
  bounce kind stays in the app, whatever it declares; that test holds every one of them to it.
- **A channel.** An entry of `CHANNELS` (`email` and `push` are the ones that are not built): a
  `ChannelHandler` whose `deliver(ctx, delivery)` runs in that transaction, so it enqueues its
  send (a workpool job, a scheduled function) and never calls a provider itself. It resolves
  `true` when it delivered or enqueued; a throw is logged as `notifications.deliver_failed` and
  the event stands.
- **A person's say.** `CHANNEL_GATES` holds the gates a notification passes before each channel
  (each person's choices, the weekly cap, the quiet hours): every gate must say yes. The inbox
  is only held back by an explicit choice, never by a cap or quiet hours.

## Submitting Changes

1. **Open an issue first** for non-trivial changes so we can discuss the approach.
2. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b fix/my-bug-fix
   ```
3. Make your changes, add tests where appropriate.
4. Ensure all checks pass. `check:tarball` reads the tarball that `pnpm pack` leaves in the
   repository root, so pack first; [AGENTS.md](AGENTS.md#verification) lists the whole gate:
   ```bash
   pnpm lint && pnpm test:types:lib && pnpm test && pnpm pack && pnpm check:tarball
   ```
5. Open a pull request against `main`. A change too large for one review can go up as a stack of
   pull requests instead, each based on the one below it ([`gh stack`](https://github.com/github/gh-stack)
   keeps the branches rebased and links them on GitHub). CI checks every layer, and the layers
   merge in order from the bottom.

Pull requests that include tests and follow the commit convention below are reviewed fastest.

## Code Quality

[Fallow](https://docs.fallow.tools) is the drift gate for dead code, duplication and
complexity. Run it over the whole repository at any time:

```bash
pnpm test:quality
```

The repository policy lives in [`.fallowrc.jsonc`](./.fallowrc.jsonc); every exception in that
file carries the reason it exists — prefer fixing a finding in code, and widen the policy only
with a written justification.

The repository sits at zero: `pnpm test:quality` (dead code, duplication, complexity) and
`pnpm test:security` (the security-candidate scan, a separate command because fallow keeps those
findings out of the default run) both pass, and both gate every pull request and every push to
`main`. The library functions still above the complexity thresholds hold per-function ceilings
in the policy at their current values, each with the reason it is where it is — so the gate
fails on growth, not on history; shrinking one is always welcome.

On a pull request (and in the `pre-commit` hook) fallow audits only the files the branch
changed, and fails on **every** finding in them — `audit.gate: "all"` in the policy — not only on
the ones it attributes to the change. A finding it reads as inherited would otherwise pass the
pull request and then fail the whole-repository run on `main`. Touch a file, own its findings.

The other gates: ESLint (`pnpm lint`), both type checks (`pnpm test:types:lib` — the Nuxt
module and the Convex code have separate tsconfigs), the manifest ranges
(`pnpm check:manifest`: no peer range wider than what the dependency itself accepts), the test
suite (`pnpm test`), the two drift checks — the Panels copy (`pnpm panels:sync --check`) and the API
reference (`pnpm docs:reference:check`) must produce no diff — and the package shape (`pnpm check:tarball` after `pnpm pack`: [publint](https://publint.dev),
[arethetypeswrong](https://arethetypeswrong.github.io), the content rules and the
phantom-dependency walk in `scripts/check-tarball.mjs`), and the size budgets below.

## Budgets

[`budgets.json`](./budgets.json) holds three size budgets, each with what it measured when it
was last set and a ceiling 5% above it (rounded up to three significant figures):

| Budget | What it measures | Checked by | Over it |
|---|---|---|---|
| `tarball` | Every file the packed tarball carries, in bytes and files | `pnpm check:tarball` | fails |
| `install` | What installing the tarball adds to an empty project, in bytes and files: the package and every dependency it brings, peers left out | `pnpm check:budgets` | warns on a pull request, fails on `main` and in the weekly run |
| `starter` | The JavaScript every page of `templates/starter` loads before it runs (the client entry and the chunks it imports statically), gzipped bytes, built against the tarball | `pnpm check:budgets` | as `install` |

CI's `pack` job runs both checks on the tarball it packs; `check:budgets` reads the starter the
consumer smoke test built there (`--starter <dir>`), and builds one of its own when run by hand.
`install` and `starter` install from the registry with no lockfile, as a new user does, so a
release of Nuxt or of a dependency can move them with no change here — which is why a pull request
only warns (`BUDGETS_MODE=warn`). Run by hand, those installs skip install scripts and take only
versions a day old or more.

A change that grows a budget on purpose moves it, naming the budgets (the tarball's alone when it
names none), and says in its description why — or, when a release upstream grew it, which one:

```bash
pnpm pack && pnpm budgets:update tarball install starter
```

Only `budgets:update` writes `budgets.json`: `test/unit/budgets.test.ts` fails on a ceiling that
is not the one its measurement implies, so a ceiling edited by hand alone fails there.

Two rules keep the starter budget:

- **The auth client stays eager; what a flow needs loads apart from the page.** Better Auth's
  `createAuthClient` takes its plugins at construction and the base module imports the client on
  every page, so every plugin is registered in `src/runtime/vue/auth-client.ts`. Code a plugin
  needs only for one flow loads apart: the passkey plugin is the package's own
  (`src/runtime/vue/passkey-client.ts`), Better Auth's with its WebAuthn ceremony
  (`@simplewebauthn/browser`) behind a dynamic import. That import must land *before* the tap:
  WebKit opens the WebAuthn prompt only while the tap's activation lasts, and a module load
  awaited inside the tap can outlast it. So the ceremony loads when the page is idle
  (`plugins/passkey-ceremony`) and when `<AuthForm>` or `usePasskeys` mounts, and a loaded
  ceremony runs with nothing awaited before its first request. A flow moved out the same way
  follows the same pattern. The organization plugin's access control (its `ac`, `roles` and
  `dynamicAccessControl` options, once workspaces get custom roles) stays in the eager client:
  `checkRolePermission` answers from it synchronously.
- **Heavy components are lazy.** A component that brings a library of its own, or whose own code
  passes 10 kB gzipped, is registered through `lazily` (`src/nuxt/registry.ts`):
  `addComponent(lazily({ name, export, filePath }))`. The module registers it as an async
  component over its file: its chunk loads when one first renders, the server awaits it and the
  browser's hydration waits for it, and its type still comes from its own file. Nothing
  modulepreloads that chunk (the package's components are not single-file components, whose
  server render would name it), so a server-rendered one hydrates a round trip later: keep heavy
  components below the fold or behind an interaction. `ChatThread`, `UploadInput` and
  `AdminUsers` are heavy before they exist, and `test/module/registration.test.ts` fails on one
  registered any other way. None of today's components qualifies: the largest, `PricingTable`,
  is under 7 kB minified, and each loads with the page that renders it, never with the entry.

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for X
fix: correct Y behavior
docs: update contributing guide
chore: bump dependencies
```

Breaking changes must include `BREAKING CHANGE:` in the commit footer or use `!` after the type:

```
feat!: rename createBackend to defineBackend
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`style`, `revert`, and `ai` (AI-instruction / agent metadata updates).

**This is enforced, not just documented.**
[`.githooks/commit-msg`](./.githooks/commit-msg) runs
[commitlint](https://commitlint.js.org/) and rejects non-conforming messages locally. CI
re-checks every commit on a pull request, so the gate holds either way. The local hook can be
bypassed with `git commit --no-verify`; CI cannot — non-conventional commits will not merge.

**The pull request title is a commit message too.** Pull requests are squash-merged, and the squash
commit on `main` takes the title as its subject whenever the pull request has more than one commit.
`Release Prepare` builds the version bump and the changelog from those subjects, so CI lints the
title with the same rules — and without commitlint's exemptions for `Revert "…"` and `Merge …`
messages (use `revert: …` instead). Write it as `<type>(<scope>): <description>`, the scope
optional, at most 100 characters.

Commits must also be **signed** — the ones on your branch too. The `main-pr-gate` ruleset
([`.github/rulesets/`](./.github/rulesets)) requires a verified signature on every commit, and
before a pull request can merge GitHub checks the commits it would introduce, **including the
branch's own**: one unsigned commit blocks the merge, even though GitHub signs the squash commit
it then writes on `main` ([GitHub docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-signed-commits)).
So [set up signing](https://docs.github.com/en/authentication/managing-commit-signature-verification)
before you push — or, if you can't, say so on the pull request, and a maintainer re-creates it
with signed commits and credits you with a `Co-authored-by` trailer. Squash is the only merge
method: a rebase merge would carry the branch's commits onto `main` as they are.

## Git Hooks

The hooks live in [`.githooks/`](./.githooks) as ordinary shell scripts — committed, reviewable
in a pull request, and carrying their own reasoning in comments. `pnpm install` runs `prepare`,
which points Git at them:

```bash
git config core.hooksPath .githooks
```

That is the whole mechanism: no hook manager, nothing generated into `.git/hooks`, and no
per-clone setup step. Note that Git runs [config-based hooks](https://git-scm.com/docs/githooks)
(`hook.*` in `.git/config`) *in addition* to these rather than instead of them, so never
register the same hook both ways — it runs twice (see the note under
[Development Setup](#development-setup) if your clone predates `.githooks/`).

They mirror CI, split by how often each check can afford to run:

| Hook | Runs | Mirrors | Cost |
|---|---|---|---|
| [`pre-commit`](./.githooks/pre-commit) | `fallow audit` on the branch's changed files, ESLint on the staged files, Panels drift, the skills mirror | `static` | ~8s |
| [`commit-msg`](./.githooks/commit-msg) | `commitlint` | `static` (commit messages) | instant |
| [`pre-push`](./.githooks/pre-push) | `test:quality`, `test:security`, `check:manifest`, `test:types:lib`, `pnpm test`, `docs:reference` drift | `static` (quality, security, manifest, type checks, API reference), `test` | ~1 min |

`pre-commit` stays cheap enough to run on every commit: fallow looks only at what the branch
changed, ESLint only at what the commit stages, and the Panels copy is a file comparison. `pre-push` runs once per push and can afford the whole-project runs, both type checks and
the whole test suite (`unit`, `convex-component`, `nuxt`, `module` — the `e2e` project stays in
CI). A delete-only push skips it.

Every tool runs through `pnpm exec` / `pnpm run`, because each CLI is a devDependency and is on
`PATH` only inside a pnpm script. Bypass once with `git commit --no-verify` or
`git push --no-verify`; every one of these has a CI counterpart that cannot be bypassed.

Both gates are skipped when `CI` is set: every check here already runs as its own CI job, and
`CI=1` trips pnpm's `verifyDepsBeforeRun` guard, so they would fail there for the wrong reason.
No CI job runs `git commit` at all — the release commit is made through GitHub's API, and hooks
never see it.

**What the hooks cannot cover.** These stay CI's alone, so a green push is not a promise of a
green pipeline: the end-to-end tests on the Linux leg of `test` (they build the example apps
and drive them with Playwright, minutes, and upload a screenshot of every module page as the
`module-page-screenshots` artifact; `pnpm qa:screenshots` takes the same set locally into
`.qa/module-pages/`), that leg's run on the Node floor `engines` promises, `pack` (the tarball gate,
real npm and pnpm consumer installs side by side, a strict-pnpm one, a Convex codegen from the
installed copy, the consumer type check, `npm audit signatures`), `website` (the docs site's
codegen, the component's generated bindings, type check and one production-shape build),
`dependency-review`, the workflow lint (zizmor, actionlint) and the spell check, which need
GitHub, the Windows leg of the test matrix, and the coverage thresholds.

## Writing Documentation

The docs are the [`website/content/docs/`](./website/content/docs) tree, rendered by
[Docus](https://docus.dev) (Nuxt Content + Nuxt UI) under `/docs`, one folder per header tab
(`01.start` … `10.reference`). `website/shared/docs-routes.ts` is the route table: the tabs, the
redirect for every route the site ever published, the aliases and short links. Two kinds of file
live under the tree, and only one is edited by hand.

**Hand-written pages.** Folders and files carry a numeric prefix that orders the sidebar and is
stripped from the route: `docs/04.build/5.data/3.server-rendering.md` is `/docs/build/data/read-write/server-rendering`.
A folder with ten or more children pads the prefix (`03.catalog`), because the sidebar sorts
the names as strings. Each folder's `.navigation.yml` names the tab or group (and a tab's icon), and each page opens with the frontmatter every
page here has:

```md
---
title: Configuration
description: Module options, runtime config, and the environment-variable reference.
kind: reference
navigation:
  icon: i-lucide-settings-2
---
```

`title` and `navigation.icon` are the sidebar entry; `description` is the meta tag and the OG
card. `kind` says what the page is for, one of `landing`, `tutorial`, `how-to`, `concept`,
`recipe` and `reference`; a page does one of those, so a how-to covering two tasks is two pages. A
page documenting the experimental tier of STABILITY.md also sets `status: experimental`, which
draws the page's Experimental chip and the navigation's badge.

**Pages ahead of the code.** The docs describe the whole coming release before all of it is
built, so a page says when the code is not there yet. Two frontmatter pairs do it, each naming
the unit of the release plan that closes the gap:

- `status: planned` and `plannedBy: <UNIT>`: the feature is not built yet. The page gets an
  unlit Planned chip and a callout first in its body ("Arrives in 0.2.0: described here so you
  can see the whole package, and not in the playground yet").
- `status: changing` and `changedBy: <UNIT>`: the feature is built, and the page shows its API
  as the release reshapes it (renamed, simplified, moved). The page gets an amber Changing chip
  and a callout ("Describes the 0.2.0 API. The code still has the previous one until RENAME
  lands").

```md
---
title: Notify users about your own events
description: …
kind: how-to
capability: notifications
status: planned
plannedBy: NOTIFY
---
```

The chip links to the statuses of the Feature map (`/docs/start/feature-map`). The callout is
also what the site's search and the Markdown twin carry; the sidebar shows a badge, the twin's
header says `Status: planned` or `Status: changing`, and the page's `llms.txt` description
opens with its marker (`website/shared/planned.ts` holds the wording). Write the page as the
release will ship it, with the names its unit's spec gives; where the spec leaves a name open,
describe the capability and say the name lands with the unit. A planned page gets no
`playground`, `api` or `source` key: they lead into code that does not exist yet. The pins
that hold a page to the code (real names, published subpaths, the experimental chip) skip both
kinds of page; the rest of the contract applies. When the unit lands, it makes the code match
the page and drops both fields, and the page joins the pins. A page that shows a built part and
a planned part takes the marker of what it mostly shows, and says which part arrives with which
unit.

**The Feature map is generated.** A page joins the map by naming its section, `capability: <id>`:
one of the twelve capabilities (`auth`, `data`, `jobs`, `billing`, `email`, `notifications`,
`ai`, `protection`, `monitoring`, `flags`, `analytics`, `hosting`), or `ui` and `tools` for
what spans them ([`website/shared/docs-capabilities.ts`](./website/shared/docs-capabilities.ts) holds the
list, and `content.config.ts` takes no other value). `pnpm docs:lookups` (part of
`pnpm generate`) writes a row per page from its `title`, `description`, `status` and unit, so
nobody edits the map's rows and parallel writers never touch one shared list: set the fields,
regenerate, commit the page and the map together.
[`test/docs/planned-pages.test.ts`](./test/docs/planned-pages.test.ts) holds the rules: a unit
of the plan exactly when a page is planned or changing, a `capability` on every planned page, no
code keys on a planned page, and a map in step with the frontmatter. A changing page that
documents a feature names its `capability` too; a concept gets none and stays off the map. The
tutorial's parts name `tools`, since they are planned.

The page header's keys come from three more fields, each optional: `playground` (the playground
route that shows the feature running: **Try live**), `api` (its generated reference page) and
`source` (the repository path of its code). `related` lists the routes the aside offers next. A
page whose body holds a live demo block (`::demo-sign-in`, `::demo-counter`, `::demo-connection`)
sets `demo: true`: it is where the backend client may load, and nowhere else in the docs does. The
aside's last-updated date comes from git at build time; no page writes it.
[`test/docs/page-header.test.ts`](./test/docs/page-header.test.ts) holds each of these to a real
target.

**A live demo** runs a piece of the package on the page, against the site's deployment. A
`::demo-x` block is `website/components/DemoX.vue`: a `<DemoBlock>` with a `title`, the `api` it
shows, its `playground` page and an `#about` line, around `<LazyDemoXLive />`, the part that
calls the backend (`DemoXLive.vue`, built from the parts like a playground page). The live part
renders only once the backend client has loaded: when the block scrolls into view, or, with
`load="click"`, when the reader presses its start key. Use that for a demo that shows nothing until
the reader acts, such as signing in; a demo that shows something live by itself (a counter, a
connection) loads when seen. Locally the demos run against the deployment in `.env.local`.
Three checks hold a demo to this: `test/docs/page-header.test.ts` (the block sits on a
`demo: true` page, and its live part is lazy and inside the deferred slot),
`test/docs/live-demos.test.ts` (the frame and its loading), and `scripts/check-website-bundle.mjs`
on the build (the pages with a live block are exactly the `demo: true` ones, and what a demo loads
once it starts stays under `DEMO_CEILING`). A live part that acts, as signing in does, gets a test
of its own in a DOM, keyboard included: `test/docs/sign-in-demo.test.ts` runs the real
`useLoginFlow()` over a stand-in session.

[`test/docs/page-contract.test.ts`](./test/docs/page-contract.test.ts) holds every page to the
contract:

- **Sentence case** for titles and h1–h3 headings, with proper nouns, acronyms and code kept as
  they are. `pnpm docs:style` (part of `pnpm generate`) applies it; add a name to
  `PROPER_NOUNS` in `scripts/docs-style.mjs` when it lowercases one.
- **A kind** on every page, and the chip exactly where the surface is experimental.
- **A short sidebar:** at most seven entries in a group, order prefixes of one width per folder,
  routes of plain words, and no provider's name in a navigation title.
- **Real names:** every composable, component and CLI command a page shows exists, in this
  package's registry, the base module's, or Nuxt's. The Upgrade page, the release pages and the
  ecosystem page are exempt, since naming what is gone or upstream is their job.
- **Each kind's template**, reduced to one marker (a how-to's `## Related`, a landing's cards…).
  Pages still missing theirs are listed in `KIND_TEMPLATE_RATCHET`, which only shrinks: take a
  page off when you give it the marker.

The components in use are Docus's, written in MDC syntax — keep to these rather than
adding new ones: `::note`, `::tip` and `::warning` for callouts; `::field-group` with
`:::field{name="…" type="…"}` children for options and parameters (the docs contract reads the
field group on the configuration page); `::code-group` for one snippet under several package
managers or files. A link into the live playground is the page's `playground` field, not a block. Links
between pages are root-relative routes (`/docs/build/auth/sign-in`), not paths on disk: the docs
build fails on a broken one, `test/docs/docs-structure.test.ts` fails on a link to a redirect
source, and the weekly link check covers the external URLs. Moving a page means a row in the
route table, so its old route keeps answering.

**Generated reference.** `website/content/docs/10.reference/10.api/` is TypeDoc output, served at
`/docs/reference/api`.
`pnpm run docs:reference` regenerates it from the doc comments in `src/`, and nothing under it is
edited by hand: fix the doc comment, regenerate, commit both. CI's `API reference drift` step
(`pnpm run docs:reference:check`) fails on a diff, and the `pre-push` hook runs the same check.

**Generated lookups.** The reference's tables (the environment variables, labels, entrypoints,
components, setup helpers, routes, events, errors, limits, the CLI's contract lines, Diagnostics,
the cheat sheet), each tab landing's "What you get" and the README's inventory are written from the
code's registries by `pnpm run docs:lookups` (part of `pnpm generate`). A page keeps its prose and
marks where a lookup goes with `<!-- generated:<name> … -->` and `<!-- /generated:<name> -->`;
edit the registry, never the text between the markers, then regenerate.
`test/docs/docs-lookups.test.ts` fails while a page is stale. A lookup throws when an id, code,
hook, subpath or component has no row of its own (a finding without its Diagnostics entry, a
composable without its capability tag): add the row in `scripts/docs-lookups/` in the same change.
The lookups read the package's surface through `scripts/lib/surface.mjs` (the import paths and their
exports, what the module registers, the base module's auto-imports), which plain Node loads with
`scripts/lib/ts-resolve.mjs`; a hook's guarantees are the `@guarantee` tag on its option's doc
comment.

**App layers.** The package describes an app as layers (`src/capabilities/registry.ts`): `auth`,
`data`, `jobs`, `billing`, `email`, `ai` and `agents`. A feature that adds an env name, a
finding group, a playground page or an agent scope gives it to exactly one layer in the same change;
a new part of the app adds a layer of its own, with every field of `CapabilityDefinition` filled and a
`detect` that reads the env and doctor's findings. `test/unit/capabilities.test.ts` fails until each
entry is complete and each name belongs to one layer, and the docs' Layers page
(`/docs/reference/capabilities`) is generated from the registry. A layer's state is detected, never
configured: no layer gets an option that turns it off.

**Search.** The site searches with SQLite full-text search (`search.fts` in `website/app.config.ts`),
which matches whole words and word prefixes only: a typo finds nothing, where the old fuzzy search
forgave one. Sections the lookups generate rank below the ones written by hand
(`website/shared/search-ranking.ts`), and the generated API lowest.

**The docs contract.** `pnpm run test:docs` ([`test/docs/`](./test/docs)) checks the hand-written
pages against the code: every module option appears in the API reference, the configuration page
and STABILITY.md; every middleware a page names is registered; every CLI command has its section;
this file and the hooks cite real CI job names. It runs in the `static` job, which a docs-only
change still gets. Add a case there when a page starts promising something the code has to keep.

**The agent skills.** [`skills/`](./skills/nuxt-backend/SKILL.md) is what users' coding agents read
about this package (the docs site publishes it at `/.well-known/skills/`), and an agent follows it
to the letter: a small core skill, `nuxt-backend`, with the ground rules, install and version
checks and the names that don't exist, which routes each task to a task skill beside it
(`nuxt-backend-auth`, `-billing`, `-email`, `-ai`, `-data`, `-ui`, `-ship`, `-upgrade`).
[`src/guidance/skills.ts`](./src/guidance/skills.ts) names them and what of the public surface
each covers. They follow the public API: when you rename a composable or a component, change the
install flow or move a docs page, update the skill that covers it in the same change.
[`test/docs/agent-skill.test.ts`](./test/docs/agent-skill.test.ts) fails on a CLI command, import
path, env var, docs link or API name in them that the package doesn't have, and on frontmatter the
Agent Skills spec rejects.

The package ships the skills too (`files` lists `skills`), so an app's agent reads them from
`node_modules/nuxt-backend/skills/`, matched to the installed version; the `AGENTS.md` section
`init` writes points there, and `init` copies them into the app's `.agents/skills/`. The parts
that list names are generated: `pnpm generate` runs
[`scripts/agent-guidance.mjs`](./scripts/agent-guidance.mjs), which writes the core's router, its
own tasks, the wrong-name list and the API at a glance, and each task skill's tasks, between the
`<!-- generated:… -->` markers of each `SKILL.md`; the core's `references/api.md`,
`references/surface.json` (the public-surface manifest) and `references/renames.json`; each task
skill's `references/api.md`; and the upgrade skill's `references/upgrade.md`. Never edit those by
hand: change the registry they read (a docs page's `source`, `src/guidance/skills.ts`,
`src/guidance/wrong-names.ts`, a doc comment) and regenerate.
[`test/docs/agent-guidance.test.ts`](./test/docs/agent-guidance.test.ts) fails on a stale file, and
on a public name, command, doctor finding or how-to page no skill covers. Agents load a
`SKILL.md` whole, so the core stays within 12 kB and each task skill within 20 kB
(`agent-skill.test.ts`): lists go to `references/`.

**The rename map is reference data for the previews of `main`.** While a section of the
[Upgrade page](./website/content/docs/05.ship/6.releases/4.upgrade.md) lists the names it renamed,
reshaped or removed, [`src/guidance/renames.ts`](./src/guidance/renames.ts) has an entry for each,
naming the section; `pnpm generate` writes the entries to `renames.json` and `upgrade.md`. The test
fails while a section of the page has no entry, while an entry names something its section does
not, and while a Gone column lists a removed composable, component, factory, type or constant that
no entry carries. `nuxt-backend upgrade` reads none of it: it rewrites no code, so a breaking change
after 0.2.0 goes in the changelog, with the edit to make, and not in a codemod.

A change that needs the data an earlier release wrote changed
adds a package migration: an entry in
[`src/convex/package-migrations.ts`](./src/convex/package-migrations.ts) and its definition in
the component's `migrations.ts`, which the command runs on each deployment once.

## Releasing

Releases are automated via CI. See [RELEASE.md](RELEASE.md) for the two-step, zero-credential flow.
