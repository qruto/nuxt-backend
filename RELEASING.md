# Releasing

Releases run **entirely in CI** — there is no local release tooling and no long-lived secrets.
You trigger a release from the GitHub **Actions** tab; the workflow does everything else.

## How it works

```
Actions tab → "Release" → Run workflow   (.github/workflows/release.yml)
└─ assert this commit's ci run is green
   ├─ gate: lint + test + typecheck
   ├─ changelogen   → bump version, write CHANGELOG.md (with contributors), commit + tag
   ├─ pnpm publish  → Trusted Publishing (OIDC) + automatic provenance
   ├─ push commit + tag back to main
   └─ changelogithub → GitHub Release (conventional grouping + contributor thanks)
```

- **One button.** Pick the bump (`auto` / `patch` / `minor` / `major`) and run.
  `auto` derives the version from your Conventional Commits since the last tag.
- **Rehearsable.** Check **dry-run** to run everything except the publish and the push —
  the run summary shows the version and changelog that a real release would produce.
- **No secrets.** npm uses OIDC (no `NPM_TOKEN`); the GitHub Release and the push back to
  `main` use the ephemeral Actions `GITHUB_TOKEN`.
- **Environment-gated.** The job runs in the `release` GitHub Environment; the npm Trusted
  Publisher is bound to it, and any required-reviewer rule on the environment becomes a
  one-click approval step before anything can publish.
- **Publish before push.** npm is published first; the release commit and tag are pushed only
  after npm accepts it, so a failed build (run via `prepack` during `pnpm publish`) leaves the
  remote untouched. pnpm (not npm) publishes so `catalog:` ranges are rewritten in the
  published manifest.

## Repository controls (configure once)

Recorded so the guarantees are auditable — each must be set up in the repository settings:

- **`release` environment** — requires a maintainer's approval before the job starts, and accepts
  runs from `main` only. The branch policy matters: `workflow_dispatch` can be triggered from any
  branch, and npm's Trusted Publisher binds the workflow *filename* and environment, not the
  file's contents — without it, a modified `release.yml` on a scratch branch could publish.
- **`main-guard` ruleset** — blocks deletion and force-push on `main`. Deliberately no require-PR
  rule: `release.yml` pushes the release commit directly, and adding one would need a bypass actor.
- **`tag-guard` ruleset** — `v*` tags can never be deleted, re-pointed, or force-updated, so
  published release history is immutable. Tag *creation* is unrestricted, so the workflow still tags.
- **Dependabot alerts + automated security fixes** — enabled in Settings → Code security.

## One-time setup (before the first OIDC release)

> **Blocker:** the first publish requires `nuxt-convex-module` on npm — this package depends on
> it via `link:../nuxt-convex-module`, which must become a published semver range in
> `package.json` before the manifest is publishable.

npm Trusted Publishing can only be configured **after** a package exists on the registry, so the
first version is published manually:

1. **Publish the first release manually** (one time only), then tag the version you actually
   published (the current `version` in `package.json`, e.g. `v0.1.0`) so `changelogen` has a
   baseline:

   ```sh
   npm login
   pnpm publish        # runs prepack (the build); publishConfig.access=public
   git tag v0.1.0 && git push origin v0.1.0
   ```

2. **Configure the trusted publisher** at
   <https://www.npmjs.com/package/nuxt-backend/access> → **Trusted Publisher** →
   *GitHub Actions*:

   | Field               | Value          |
   | ------------------- | -------------- |
   | Organization / user | `qruto`        |
   | Repository          | `nuxt-backend` |
   | Workflow filename   | `release.yml`  |
   | Environment         | `release`      |

   Optionally enable **"Require two-factor authentication and disallow tokens"** so the package
   can _only_ be published through this workflow.

3. **Install the [pkg.pr.new GitHub App](https://github.com/apps/pkg-pr-new)** on the
   repository so the `preview` workflow can publish continuous preview builds
   (`npm i https://pkg.pr.new/qruto/nuxt-backend@<sha>`).

## After the first publish

- **Submit to the [nuxt/modules](https://github.com/nuxt/modules) registry** (requires the
  package on npm): in a clone of that repo run
  `pnpm sync nuxt-backend qruto/nuxt-backend`, add an SVG icon under `icons/`, set
  `category` and `type: 3rd-party` in the generated `modules/nuxt-backend.yml`, point
  `website` at the docs site, and open a PR. npm stats, description, and maintainers
  auto-sync afterwards.
- **Add GitHub repo topics** for discoverability: `nuxt`, `nuxt-module`, `convex`,
  `authentication`, `backend`.

## Cutting a release

1. Merge your work to `main` (Conventional Commit messages drive the version + changelog).
2. **Actions** tab → **Release** → **Run workflow** → choose the bump → **Run**.
3. Watch the run. When it's green, the new version is on npm with provenance, `CHANGELOG.md` and
   the tag are on `main`, and the GitHub Release is published.

That's it — no `pnpm release`, no local credentials.

## Conventional Commits

With `release-type: auto`, the bump is derived from
[Conventional Commits](https://www.conventionalcommits.org/) since the previous tag:

| Commit type                          | Release |
| ------------------------------------ | ------- |
| `fix:`                               | patch   |
| `feat:`                              | minor   |
| `feat!:` / `BREAKING CHANGE:` footer | major   |

Other types (`chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `build:`, `perf:`) appear grouped in
the changelog/release notes but do not force a bump. To override the computed bump, pick an
explicit `patch` / `minor` / `major` when running the workflow.

## Dependencies

Dependency updates are automated by [Dependabot](./.github/dependabot.yml) — npm version
updates, GitHub Actions digest bumps (preserving the `@<sha> # vX.Y.Z` pinning convention), and
CVE security updates. No third-party app holds write access to the repo.

- **Monday schedule, grouped.** Non-major npm updates arrive as one grouped PR; Actions bumps
  as another.
- **Cooldown mirrors pnpm.** Dependabot's `cooldown` (2 days) is kept one day wider than pnpm's
  `minimumReleaseAge` (24 h, `pnpm-workspace.yaml`), so Dependabot never proposes a version pnpm
  refuses to resolve. Security updates skip the cooldown by design.
- **Keep the exclude lists in sync.** `cooldown.exclude` in `.github/dependabot.yml` must match
  `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` (first-party Nuxt/Convex packages are
  waived), or Dependabot proposes versions pnpm won't install.
- **Inspected at PR time.** ci's `dependency-review` job fails any PR whose dependency delta
  introduces a known CVE (moderate or higher) or a package GitHub has flagged as malicious.
  pnpm's cooldown only *delays* a new version — it never looks at what's inside it.
