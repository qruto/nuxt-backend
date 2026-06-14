# Releasing

Releases run **entirely in CI** — there is no local release tooling and no long-lived secrets.
You trigger a release from the GitHub **Actions** tab; the workflow does everything else.

## How it works

```
Actions tab → "Release" → Run workflow   (.github/workflows/release.yml)
└─ gate: lint + test + typecheck
   ├─ changelogen  → bump version, write CHANGELOG.md (with contributors), commit + tag
   ├─ npm publish  → Trusted Publishing (OIDC) + automatic provenance
   ├─ push commit + tag back to main
   └─ changelogithub → GitHub Release (conventional grouping + contributor thanks)
```

- **One button.** Pick the bump (`auto` / `patch` / `minor` / `major`) and run.
  `auto` derives the version from your Conventional Commits since the last tag.
- **No secrets.** npm uses OIDC (no `NPM_TOKEN`); the GitHub Release and the push back to
  `main` use the ephemeral Actions `GITHUB_TOKEN`.
- **Publish before push.** npm is published first; the release commit and tag are pushed only
  after npm accepts it, so a failed build (run via `prepack` during `npm publish`) leaves the
  remote untouched.

## One-time setup (before the first OIDC release)

npm Trusted Publishing can only be configured **after** a package exists on the registry, so the
first version is published manually:

1. **Publish `v1` manually** (one time only), then tag it so `changelogen` has a baseline:

   ```sh
   npm login
   pnpm run build      # produces dist/
   npm publish         # uses publishConfig.access=public from package.json
   git tag v1.0.0 && git push origin v1.0.0
   ```

2. **Configure the trusted publisher** at
   <https://www.npmjs.com/package/nuxt-backend/access> → **Trusted Publisher** →
   *GitHub Actions*:

   | Field               | Value           |
   | ------------------- | --------------- |
   | Organization / user | `qruto`         |
   | Repository          | `nuxt-backend`  |
   | Workflow filename   | `release.yml`   |
   | Environment         | *(leave empty)* |

   Optionally enable **"Require two-factor authentication and disallow tokens"** so the package
   can _only_ be published through this workflow.

3. **Allow the workflow to push to `main`.** The release commit + tag are pushed by
   `github-actions[bot]`. If `main` has branch protection, add a bypass for GitHub Actions
   (Settings → Branches → branch protection → *Allow specified actors to bypass*), otherwise the
   push step fails. With no protection, nothing extra is needed.

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

Dependency updates are automated by [Renovate](./renovate.json) using the official
[`nuxt/renovate-config-nuxt`](https://github.com/nuxt/renovate-config-nuxt) preset (Monday
schedule, grouped non-major updates, release-age cooldown); non-major devDependency updates
automerge once CI passes.
