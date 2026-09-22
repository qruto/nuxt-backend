# Security Policy

> Looking for how to **secure an app built with this package** — the CSP, the auth proxy, the
> webhook policy, the agent surface, and a production checklist? That's the
> [security guide](https://nuxt-backend.dev/production/security) and the
> [launch checklist](https://nuxt-backend.dev/production/checklist). This file covers reporting
> vulnerabilities *in* the package.

## Supported Versions

Only the latest release of `nuxt-backend` receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest  | ✓         |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Use GitHub's private vulnerability reporting instead:

**[→ Report a vulnerability](https://github.com/qruto/nuxt-backend/security/advisories/new)**

(Also reachable from the repository's **Security** tab → **Report a vulnerability**.)

This opens a private draft advisory visible only to you and the maintainers. It keeps the whole
process — report, discussion, fix, credit, and publication — in one place, and no report can be
lost in a mailbox.

If you cannot use GitHub for any reason, email **razum@qruto.to** with the subject line
`[nuxt-backend] Security Vulnerability`.

The same contacts are published for scanners and researchers' tooling at
[`nuxt-backend.dev/.well-known/security.txt`](https://nuxt-backend.dev/.well-known/security.txt)
([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)). Its source is
`website/public/.well-known/security.txt`. The RFC says a file past its `Expires` date is not to
be trusted, so the date is set a year out and renewed with the release that follows it.

### What to include

- A description of the vulnerability and its potential impact
- The affected version, and which part of the package is involved (module setup, a runtime
  composable or component, a server route, the Convex `backend` component — auth, billing,
  email, gifts —, the generated CSP, …)
- Steps to reproduce — proof-of-concept code or a minimal reproduction repository if possible
- Any suggested mitigations

### What happens next

1. **Acknowledgement within 48 hours** in the advisory thread (or by email if you reported that way).
2. We confirm the report, assess severity, and agree a fix timeline with you — targeting **7 days**
   for critical issues.
3. The fix is developed in the advisory's private fork, released, and the advisory is published
   through the [GitHub Advisory Database](https://github.com/advisories), which propagates it to
   `npm audit`, Dependabot, and other consumers of the package.
4. A CVE is requested through GitHub where the issue warrants one, and you are credited in the
   published advisory unless you ask to stay anonymous.

We follow [coordinated disclosure](https://en.wikipedia.org/wiki/Coordinated_vulnerability_disclosure):
we ask that you give us reasonable time to patch and publish before disclosing publicly.

## Scope

In scope is code shipped by this package — module setup, runtime composables and components
(including the auth UI), Nitro server handlers, the Convex `backend` component (authentication,
billing, email, gifts and invitations), the Convex integrations it wires up, and the CSP
configuration this module generates.

Vulnerabilities in the upstream projects the package integrates with —
[`nuxt-convex-module`](https://github.com/qruto/nuxt-convex-module) (the Convex/Nuxt foundation this
package builds on), [Convex](https://github.com/get-convex),
[Better Auth](https://github.com/better-auth/better-auth), Polar, or Resend — belong in *their*
security process, not here. Report them to that project directly. If you are unsure which side a
finding lands on, report it here and we will route it.

## How this repository is checked

Reporting is the last line, not the first. These are the gates a change passes before it can
reach a release.

### Static analysis in CI

[`fallow security`](https://docs.fallow.tools) runs as its own step in the `static` job and in
the `pre-push` hook. It *has* to be its own step: fallow keeps security findings out of both its
default run and its `audit` gate, so neither of the checks already in that job would ever report
one. It covers 44 candidate categories — injection sinks, SSRF, path traversal, prototype
pollution, open redirect, permissive CORS, weak crypto, disabled TLS validation and the rest — over
the whole repository, and the repository sits at **zero candidates**.

Candidates are **unverified by design**: fallow matches syntactic sink shapes against a CWE
catalogue and does not prove anything reaches them. A red build means *go and look*. A candidate
confirmed harmless carries `// fallow-ignore-next-line security-sink -- <why>` at the site, dated,
so the reasoning is reviewed with the code. Today those are: the fetches whose destination is the
deployment's own site URL from runtime config (the agent token exchange, the authorization-server
metadata proxy, the AI stream), the doctor's probe of the project's own `SITE_URL`, the DevTools
panel reading package versions from a fixed list, and a regex the playground builds from an
escaped search term.

`hardcoded-secret` and `secret-to-network` stay off on purpose: naming them in
`security.categories.include` turns the setting into a whitelist and drops the other 44.
Credentials are GitHub secret scanning's job instead (below).

### Deeper review with deepsec

`fallow security` is the fast deterministic pass. [deepsec](https://github.com/vercel-labs/deepsec)
is the thorough one: a free regex scan, then an AI stage that reads each candidate in context, then
a revalidation stage. The free scan runs before every release; the AI stages when a candidate needs
a judgement call rather than a glance, or after touching a request handler (the webhook routes, the
auth proxy, the agent exchange):

```bash
cd .deepsec
pnpm deepsec scan                          # free, regex only — part of the release checklist
pnpm deepsec process    --concurrency 5    # the AI stage
pnpm deepsec revalidate --concurrency 5    # cuts the false-positive rate
pnpm deepsec export --format md-dir --out ./findings
```

The workspace is **deliberately not in git**: `data/*/INFO.md` maps this repository's
security-sensitive surface, and exported findings describe vulnerabilities that are not fixed
yet. `npx deepsec init` recreates it.

### Supply chain

| Gate | What it stops |
| --- | --- |
| `minimumReleaseAge: 1440` (pnpm) | A package published in the last 24h cannot be installed at all — the window a malicious publish relies on. First-party Nuxt and Convex packages are exempt |
| `trustPolicy: no-downgrade` (pnpm) | A version whose provenance or signature is weaker than an earlier one — an account-takeover tell |
| `blockExoticSubdeps` (pnpm) | A transitive dependency from a git repository or a raw tarball, bypassing the registry |
| Dependabot `cooldown: 2` days | Kept one day wider than the pnpm gate so it never proposes a version pnpm will refuse. Security updates are exempt, so CVE fixes ship immediately |
| `dependency-review` (PRs) | Known CVEs and malware in the dependency delta |
| `osv` (weekly) | Advisories filed against a dependency that stopped changing |
| `verifyDepsBeforeRun: error` | A lockfile that no longer matches the manifests |
| `installed-check` | A declared peer range wider than what the dependency itself accepts |
| `pack` job | Builds the real tarball; `publint` + `attw` lint its shape; a content check refuses sources outside `src/convex`, tests, and any lifecycle script a consumer's package manager would run; a phantom-dependency walk refuses any import a consumer is not guaranteed to have; the tarball is installed with plain npm and with strict pnpm, its Convex component codegen'd from the installed copy, and `npm audit signatures` verifies every dependency's registry signature |

Dependabot owns every dependency PR — npm versions and GitHub Actions digests alike.

### Installed apps

Four GitHub Apps are installed on the repository, and this is everything each one can write.
None of them can push to `main`: the `main-pr-gate` ruleset takes pull requests only, and its
bypass list names no app. None can publish to npm: the only credential npm accepts is the OIDC
token of a job running in the `Release` environment, from `main`, in `release.yml`.

| App | Can write | Where to see it |
| --- | --- | --- |
| [pkg.pr.new](https://github.com/apps/pkg-pr-new) | One comment per pull request; preview builds, published to pkg.pr.new and nowhere else | `preview.yml`, and the comment on any pull request |
| [CodeRabbit](https://github.com/apps/coderabbitai) | Reviews and comments on pull requests | `.coderabbit.yaml`, and its reviews |
| Copilot cloud agent | A branch and a pull request, only when a maintainer assigns it an issue or invokes it | its workflow in the Actions tab (`gh workflow list`) |
| Dependabot | Branches and pull requests for dependency updates | `.github/dependabot.yml`, and its workflow in the Actions tab |

### CI and release hardening

- Every third-party action is pinned to a full commit SHA, never a tag, and GitHub enforces it
  (`sha_pinning_required`).
- `persist-credentials: false` on every checkout. The one job that pushes carries the token in a
  single step's environment, so it never sits in `.git/config` while dependencies install.
- [zizmor](https://docs.zizmor.sh) and [actionlint](https://github.com/rhysd/actionlint) analyse
  the workflows themselves — template injection, unpinned actions, impostor commits, credential
  persistence, invalid expressions. Accepted findings carry their reasoning.
- The release is three jobs so the credentials never meet the code: the job that tags holds no npm
  credential and cannot start until a maintainer approves the run; the job that builds holds
  nothing; the job that publishes checks out nothing, installs nothing, runs behind
  `step-security/harden-runner` in `block` mode with an allowlist of GitHub, npm and Sigstore, and
  works in a fixed order — attest the tarball, create the GitHub Release, then stage on npm — so
  nothing reaches npm without its proof. `Release Prepare` is split the same way.
- Every release carries its own proof: the tarball and its SBOM are attested with
  `actions/attest-build-provenance` (`gh attestation verify nuxt-backend-<version>.tgz --owner qruto`),
  the attestation bundle and the CycloneDX SBOM of the package's production dependencies are assets
  of the immutable GitHub Release, and npm's provenance covers the same tarball.
- **No stored credentials at all.** Publishing uses npm **Trusted Publishing** over OIDC bound to
  a `main`-only environment, and coverage uploads use Codecov's OIDC — no long-lived token exists
  anywhere in this repository, and a workflow edited on a branch cannot reach either service.
  `id-token: write` is granted only to jobs that run no pull-request-authored code and install
  nothing. Releases are **staged**: nothing becomes installable until a maintainer approves it with
  2FA, after npm's malware scan.
- The release refuses a commit whose CI run is not a completed success.

[RELEASE.md](./RELEASE.md) has the whole flow, and the repository rules
(`.github/rulesets/`) that a weekly job checks against what GitHub is actually running.

### GitHub-native

fallow deliberately leaves credentials to GitHub, so these settings are what catch them. They are
part of the repository's configuration, not its files; the weekly Scorecard run reports on them.

| Setting | State | Why |
| --- | --- | --- |
| Private vulnerability reporting | on | The reporting path at the top of this file |
| Dependabot security updates | on | Advisories against the resolved lockfile |
| Dependabot malware alerts | on | A malicious publish of an already-pinned transitive |
| Secret scanning | on | Detects a committed credential |
| Push protection | on | Blocks the commit outright instead of reporting it after the fact |
| Code scanning (CodeQL) | on, `extended` | The default suite plus the JS/TS and `actions/*` queries |
| Non-provider patterns | **off**, deliberately | Generic keys with no vendor prefix — a documented false-positive class |

### What the package ships to apps

Everything above protects *this repository*. What the package does for an application built on
it — the fail-closed webhook policy, the OAuth-gated agent surface, the Convex-aware CSP, the
passwordless flows and their rate limits — is documented in the
[security guide](https://nuxt-backend.dev/production/security).

### Review notes

The attacker-reachable surface, reviewed by hand, one question per surface. What was found, and
what was decided:

- **Webhook routes** (`/billing/events`, `/email/events`; 2026-08-17, re-verified live
  2026-08-18). Fail closed on every axis: no secret configured → 503, bad or stale signature →
  403, oversized body → 413, authentic but unknown event → 202, replayed delivery → 200 without
  side effects, handler throw → 500 so the provider retries. Comma-separated secrets rotate without
  a gap. Pinned by `test/unit/webhook-guard.test.ts` and the component webhook tests. **No change.**
- **Agent surface** (`/mcp`, `/mcp/exchange`; 2026-08-18). Every request without a bearer is
  challenged with the RFC 9728 resource-metadata pointer; the exchange mints a five-minute Convex
  JWT only for a bearer the auth plugin validates; the exchange and metadata handlers fetch only
  the deployment site URL from runtime config. Registered as global middleware on purpose — a
  route-scoped handler saw the mount base stripped from `event.path` and its path guard never
  matched. **Fixed** then; pinned by `test/e2e/mcp.test.ts`.
- **OTP request guard** (2026-09-16). A gated or rate-limited sign-in request is refused on the
  request itself, not after the email is sent; a global fixed-window backstop caps sends
  deployment-wide. **Fixed.**
- **Provider URLs** (checkout, customer portal, invoices; 2026-09-17). They come back from the
  billing provider through the app's own actions, never from the page — but the browser only
  navigates to an `http(s)` destination now, so a `javascript:` or `data:` target can never reach
  `window.location`. **Hardened.**
- **`auth` middleware and the accept-invitation page** (2026-09-17). The guard is the base
  module's, registered under the neutral name: server-side on direct loads, fails closed without
  a request event. The built-in `/accept-invitation` page sits behind it, so an invitation link
  cannot be accepted by a visitor who is not signed in. **No change.**
- **DevTools** (2026-09-17). The Backend tab and its RPC run only under `nuxt dev`, on Vite's
  middleware — reachable exactly as far as Nuxt DevTools itself. **Accepted.**
