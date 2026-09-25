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

### The DevTools panel

The Backend tab in Nuxt DevTools is its own Nuxt app,
[`devtools-client-app/`](./devtools-client-app), which `pnpm build` generates into
`dist/devtools-client` and the published package serves from there. Next to the stub that
`pnpm dev` builds, that directory does not exist, so the module proxies the tab to a dev server
instead. Start it beside `pnpm dev`:

```bash
pnpm run dev:devtools-client   # port 3631 — the port the module's proxy expects
```

The port is `DEVTOOLS_UI_LOCAL_PORT` in `src/devtools/rpc-types.ts` (3630 belongs to the base
module's Convex tab). The panel hot-reloads over its own HMR socket, which the module's proxy
cannot carry — that is why it has a port of its own. A full `pnpm build` leaves a built copy in
`dist/devtools-client`, and the module serves that in preference to the proxy: delete the
directory to get the dev server back.

## Project Structure

```
src/                  # Module source (Nuxt module + Convex component)
devtools-client-app/  # Nuxt DevTools panel app (served in the DevTools iframe)
examples/             # Standalone apps of the published package — outside the pnpm workspace
test/                 # Vitest unit, Convex component, Nuxt and end-to-end tests
website/              # Nuxt app: product homepage · docs (Docus) · interactive playground
```

`examples/` are **standalone apps of the published package**, deliberately outside the pnpm
workspace (`pnpm-workspace.yaml` excludes them): each depends on `nuxt-backend: latest` and
on plain version ranges — no `workspace:*`, no `catalog:` — so cloning one and running
`npm install` is exactly what a user gets. They stay linted, but are excluded from the root
tsconfig and from fallow (they resolve against the *published* package, not `src/`). Both have
a job beyond being documentation:

- **[`examples/minimal/`](./examples/minimal)** — the smallest thing that works. Its `backend/`
  is byte-identical to what `npx nuxt-backend init` scaffolds (a unit test enforces it), and it
  is the app behind the **Open in StackBlitz** link on every pull request: `preview.yml` hands
  it to pkg.pr.new as `--template` with the PR's package build wired in.
- **[`examples/advanced/`](./examples/advanced)** — every customization seam at once (local
  component install, custom pages, overridden auth).

The `pack` CI job copies both, installs the packed tarball over the `latest` dependency with
plain `npm` and builds: the only place a registry-shaped install (lifecycle scripts, engines,
export maps) is exercised at all. Keep them self-contained — no import that only resolves from
the repository root, no undeclared dependency, no committed lockfile.

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
5. Open a pull request against `main` — or against the integration branch, while a release is being
   assembled on one (see below).

Pull requests that include tests and follow the commit convention below are reviewed fastest.

### Integration branches

A release that takes more than one pull request is assembled on an `integration/<version>` branch
(for 0.2.0: `integration/0.2.0`), not on `main`:

- **Changes** are branches off the integration branch and pull requests into it, squash-merged.
  CI, the pkg.pr.new preview and CodeRabbit run on them exactly as on pull requests into `main`;
  the `integration-gate` ruleset enforces the same checks and signed commits.
- **`main` keeps moving slowly:** dependency updates and production hotfixes land there as usual.
  Bring them into the integration branch with a pull request from `main`, merged as a **merge
  commit**, so `main`'s own commits stay intact — at least weekly, and always before the branch
  merges.
- **The branch reaches `main` once**, as a merge commit, right before the release: one commit per
  change on `main`, for bisect and the changelog. [`.github/rulesets/README.md`](.github/rulesets/README.md#integration-gate)
  has the ruleset steps.
- **Verification during the cycle** happens on your local dev deployment and on the Vercel preview
  of the integration branch (docs and site; the playground stays offline there). Production keeps
  running `main` until the merge.

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

Commits on `main` must also be **signed**: the `main-pr-gate` ruleset
([`.github/rulesets/`](./.github/rulesets)) requires a verified signature on every commit. That
decides the merge method: pull requests are **squash-merged**, and GitHub signs the squash
commit itself. A rebase merge cannot pass the rule — GitHub rewrites each commit and cannot
sign what it rewrote. GitHub signs a squash merge only when the person merging authored the
pull request, so a contributor's pull request is merged by a maintainer who takes that into
account. Signing your own commits is not required to contribute, but
[setting it up](https://docs.github.com/en/authentication/managing-commit-signature-verification)
shows them as verified on your branch.

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
