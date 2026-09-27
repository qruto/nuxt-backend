# Rulesets

These files are the rules that protect `main` and the release tags, kept in git instead of only in
a settings page.

GitHub does not read this directory — it's a copy. `weekly.yml`'s `rulesets` job is what keeps the
copy honest: `scripts/check-rulesets.mjs` compares every file here against the live rules and fails
on any difference, including a ruleset that exists in GitHub but not here.

Without that job these files would just be a claim. They went out of date the day they were
written, when GitHub filled in a parameter the file never mentioned.

```sh
pnpm run check:rulesets     # needs `gh auth` or GH_TOKEN
```

| File | State | What it does |
| --- | --- | --- |
| `main-guard.json` | active | Blocks deletion and force-pushes on `main` |
| `main-pr-gate.json` | active | Makes CI actually gate a merge — see below |
| `tag-guard.json` | active | Freezes `v*` tags: no update, delete or force-push |

## `main-pr-gate`

With only `main-guard` in place, a plain `git push` to `main` skips every check in the repository.
This is the ruleset that stops that.

| Rule | Why |
| --- | --- |
| `pull_request`, **0 reviewers** | There is one maintainer here, so the gate is CI, not review. What matters is that the change exists as a PR at all, so the checks run and the diff is readable. Zero reviewers makes that free. |
| `required_status_checks: ["All checks passed"]` | One aggregate check. Adding, renaming or splitting a CI job never means touching this file. |
| `required_signatures` | Every commit on `main` is already signed. Squash is the only merge method: GitHub re-creates and signs the squash commit, while a rebase merge would carry the PR's own commits onto `main` unchanged and unsigned. GitHub also checks the pull request's own commits before merging — an unsigned one blocks even a squash — so contributors sign theirs (CONTRIBUTING.md). `Release Prepare` creates its commit through the API instead of `git commit` for the same reason — a commit made on a runner is unverified. |
| `allowed_merge_methods: ["squash"]` | One signed commit per pull request on `main`: a linear history, and one Conventional Commit subject per change for `Release Prepare`'s changelog. CI lints the pull request title, which becomes that subject. |
| `require_extra_approval_for_unattributed_changes` | GitHub's default. Written down rather than left implicit: a commit whose author isn't a GitHub account is worth a second look. |
| `bypass_actors: OrganizationAdmin`, `pull_request` mode | Break-glass. Without it `current_user_can_bypass` is `"never"`, so one flaky Windows job locks the maintainer out of their own repository. `pull_request` mode, not `always`: it allows merging a PR past a stuck check, never a direct push. |

**Why this is separate from `main-guard`.** Evaluate mode applies to a whole ruleset, and this one
spent a week in it. Folding these rules into `main-guard` would have put its live deletion and
force-push protection into evaluate mode too.

**Why no bot needs a bypass.** `Release Prepare` pushes to `release/vX.Y.Z` and `Release` pushes
only a tag. Neither writes to `main`. That's why the release had to be split first.

## Adding a ruleset

```sh
# Create it in evaluate mode: blocks nothing, records what it would have blocked
gh api -X POST repos/qruto/nuxt-backend/rulesets \
  --input .github/rulesets/<name>.json

# After a week, read what it would have blocked
gh api repos/qruto/nuxt-backend/rulesets/rule-suites --jq '.[]'

# Then enforce it, and set `enforcement` in the file to match
gh api -X PUT repos/qruto/nuxt-backend/rulesets/<id> -f enforcement=active
```

`check:rulesets` ranks enforcement instead of comparing it. A live rule weaker than the file fails;
a stronger one is only reported. So the file may lag behind a promotion, but never behind a
relaxation.

## Still to do

- **Fold `main-guard` into `main-pr-gate`.** Both are active now, so the reason they were separate
  is gone.
- **Add a `code_scanning` rule**, last of all. GitHub treats "analysis in progress" and "tool not
  configured" as blocking, so it can stall a pull request that never touched code. Try it on a
  docs-only PR first.
