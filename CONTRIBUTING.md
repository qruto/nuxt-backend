# Contributing to nuxt-backend

Thank you for your interest in contributing! This guide covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Reporting Security Issues](#reporting-security-issues)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Submitting Changes](#submitting-changes)
- [Code Quality](#code-quality)
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
phones and other devices on the same network can open it. For auth to work from
a device, the LAN origin must be trusted by Better Auth on the Convex
deployment:

```bash
npx convex env set BETTER_AUTH_TRUSTED_ORIGINS https://nuxt-backend.local
```

Devices also need the portless CA trusted (or they'll see a certificate
warning); `portless trust` covers this machine only.

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
`pnpm db:reset` and `pnpm db:seed` drop the key before calling Convex, and `env push --prod` /
`doctor --prod` refuse a dev or preview key.

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

- **Every DevTools-kit call** (serving, the tab, the RPC) is in `src/devtools/register.ts`, so the
  move to DevTools 4 (Vite DevTools docks) is one file. The RPC's handlers are in
  `src/devtools/rpc.ts`, its types in `src/devtools/rpc-types.ts`, shared with the panel.
- **Live app state** comes from `src/runtime/devtools/`: a dev-only plugin mirrors the
  composables into a versioned bridge (`version: 2`), and `on-demand.ts` loads what a page asks
  for. Nothing secret crosses: env names only, never values; no session token or passkey
  credential (tests pin both).
- **Colour is a signal**: `app/utils/signal.ts` maps every status to ok (green), warn (amber),
  err (red) or off (grey), and a unit test rejects any other badge colour or a provider name in
  a label. The UI kit's own green is overridden to grey in the panel's config.
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
- **[`examples/playground/`](./examples/playground)** — the website's playground as a
  standalone app. **Edit the playground in `website/`, then run `pnpm playground:sync`**:
  `scripts/sync-playground.mjs` copies every file the playground reaches (it follows imports
  and component tags from the playground's pages, layout, middleware, server routes and
  `backend/`) byte for byte, and rewrites only `app.css`'s Tailwind `@theme static` blocks as
  `:root`. The files the example writes for itself are listed in the script's `OWNED`. CI runs
  `node scripts/sync-playground.mjs --check`, and `test/unit/playground-parity.test.ts` pins the
  routes, the nav, the links out, the catalog and the dependency ranges.
- **[`examples/advanced/`](./examples/advanced)** — every customization seam at once (local
  component install, custom pages, overridden auth).

The `pack` CI job copies all three and installs the packed tarball over the `latest` dependency
twice: with plain `npm`, then builds, and with pnpm, which proves each app's `.pnpmfile.mjs`
(the only pnpm setting a template can carry: a `pnpm-workspace.yaml` makes `create nuxt`
treat it as pnpm-only). That is the only place a registry-shaped install (lifecycle scripts,
engines, export maps) is exercised at all. Keep them self-contained — no import that only
resolves from the repository root, no undeclared dependency, no committed lockfile.

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

The other gates: ESLint (`pnpm lint`), both type checks (`pnpm test:types:lib` — the Nuxt
module and the Convex code have separate tsconfigs), the manifest ranges
(`pnpm check:manifest`: no peer range wider than what the dependency itself accepts), the test
suite (`pnpm test`), the two drift checks — the generated template lists
(`pnpm templates:generate`) and the API reference (`pnpm docs:reference:check`) must produce no
diff — and the package shape (`pnpm check:tarball` after `pnpm pack`: [publint](https://publint.dev),
[arethetypeswrong](https://arethetypeswrong.github.io), the content rules and the
phantom-dependency walk in `scripts/check-tarball.mjs`).

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
| [`pre-commit`](./.githooks/pre-commit) | `fallow audit` on the branch's changed files, ESLint on the staged files, `templates:generate` drift, the skills mirror | `static` | ~8s |
| [`commit-msg`](./.githooks/commit-msg) | `commitlint` | `static` (commit messages) | instant |
| [`pre-push`](./.githooks/pre-push) | `test:quality`, `test:security`, `check:manifest`, `test:types:lib`, `pnpm test`, `docs:reference` drift | `static` (quality, security, manifest, type checks, API reference), `test` | ~1 min |

`pre-commit` stays cheap enough to run on every commit: fallow looks only at what the branch
changed, ESLint only at what the commit stages, and the template lists must regenerate without a
diff. `pre-push` runs once per push and can afford the whole-project runs, both type checks and
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
green pipeline: the `e2e` job (builds the example apps and drives them with Playwright,
minutes), `pack` (the tarball gate, a real npm and a strict-pnpm consumer install, a Convex
codegen from the installed copy, the consumer type check, `npm audit signatures`), `website`
(the docs site's codegen, the component's generated bindings, type check and build),
`dependency-review`, the workflow lint (zizmor, actionlint) and the spell check, which need
GitHub, the Windows leg of the test matrix, and the coverage thresholds.

## Writing Documentation

The docs are the [`website/content/`](./website/content) tree, rendered by
[Docus](https://docus.dev) (Nuxt Content + Nuxt UI). Two kinds of file live there, and only one
is edited by hand.

**Hand-written pages.** Folders and files carry a numeric prefix that orders the sidebar and is
stripped from the route: `2.guide/3.server-and-ssr.md` is `/guide/server-and-ssr`. Each folder's
`.navigation.yml` names the section and its icon, and each page opens with the frontmatter every
page here has:

```md
---
title: Configuration
description: Module options, runtime config, and the environment-variable reference.
navigation:
  icon: i-lucide-settings-2
---
```

`title` and `navigation.icon` are the sidebar entry; `description` is the meta tag and the OG
card. The components in use are Docus's, written in MDC syntax — keep to these rather than
adding new ones: `::note`, `::tip` and `::warning` for callouts; `::field-group` with
`:::field{name="…" type="…"}` children for options and parameters (the docs contract reads the
field group on the configuration page); `::code-group` for one snippet under several package
managers or files; and `::playground-link{to="/playground/…" label="…"}`, this site's own
component (`website/components/PlaygroundLink.vue`), for a link into the live playground. Links
between pages are root-relative routes (`/guide/authentication`), not paths on disk: the docs
build fails on a broken one, and the weekly link check covers the external URLs.

**Generated reference.** `website/content/7.api-reference/9.reference/` is TypeDoc output.
`pnpm run docs:reference` regenerates it from the doc comments in `src/`, and nothing under it is
edited by hand: fix the doc comment, regenerate, commit both. CI's `API reference drift` step
(`pnpm run docs:reference:check`) fails on a diff, and the `pre-push` hook runs the same check.

**The docs contract.** `pnpm run test:docs` ([`test/docs/`](./test/docs)) checks the hand-written
pages against the code: every module option appears in the API reference, the configuration page
and STABILITY.md; every middleware a page names is registered; every CLI command has its section;
this file and the hooks cite real CI job names. It runs in the `static` job, which a docs-only
change still gets. Add a case there when a page starts promising something the code has to keep.

## Releasing

Releases are automated via CI. See [RELEASE.md](RELEASE.md) for the two-step, zero-credential flow.
