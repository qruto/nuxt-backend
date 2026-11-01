# Security Policy

> Looking for how to **secure an app built with this package** — the CSP, the auth proxy, the
> webhook policy, the agent surface, and a production checklist? That's the
> [security guide](https://nuxt-backend.dev/docs/ship/security) and the
> [launch checklist](https://nuxt-backend.dev/docs/ship/checklist). This file covers reporting
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
package builds on), [Convex](https://github.com/convex),
[Better Auth](https://github.com/better-auth/better-auth), Polar, Resend, Vercel BotID or Cloudflare
Turnstile — belong in *their*
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
so the reasoning is reviewed with the code. Today those are, in what the package ships: the fetches
whose destination is the deployment's own URL (the AI stream and the health route, from runtime
config; the file route and a knowledge upload, from the deployment's own file storage), the app's
own same-origin routes (the health, visitor-IP, proof and dev-log routes, the passkey client's
literal auth paths), a provider-issued URL opened after its scheme is checked, two regexes built
from fixed identifiers (a PEM label, a paths-file key) and the SHA-1 key identifier RFC 5280
defines. In the CLI: the doctor's probe of the project's own `SITE_URL` (CodeQL reports
the same probe as `js/file-access-to-http`, and the site carries a `codeql[…]` comment with the
same reasoning) and of its deployment's origin, `doctor --prod`'s anonymous probes of production's
live site, at the origin its `SITE_URL` names, the billing provider's own API host, and the spawns
of the project's own Convex CLI and the developer's Vercel CLI (no shell but Windows' `.cmd` shim,
fixed subcommands, every value on stdin). In development only: the DevTools panel's calls to its own
dev server and its package versions read from a fixed list, and a regex the playground builds from an escaped search term. The
repository's own scripts carry the rest, each for a binary or an origin of the repository's own.

`hardcoded-secret` and `secret-to-network` stay off on purpose: naming them in
`security.categories.include` turns the setting into a whitelist and drops the other 44.
Credentials are GitHub secret scanning's job instead (below): it and push protection are the
authority, and a unit test only warns early about a test fixture shaped like one.

### Property tests

The code that decides what is authentic or what an identifier is gets property tests with
[fast-check](https://fast-check.dev) (`test/unit/property/`), which is what OpenSSF Scorecard's
Fuzzing check looks for in a TypeScript project. Each generates a hundred inputs on every run and
shrinks a failure to the smallest case that still fails:

- **Webhook signatures.** A delivery to either webhook, signed with any accepted secret in any
  position of the rotation list, verifies through the one verifier, under the spec's `webhook-*`
  headers or Svix's `svix-*` (never a mix), and a billing delivery also under the provider's
  earlier key reading. A changed body, a foreign secret, a moved message id or a timestamp outside the
  five-minute window never does, and no input makes either check throw.
- **One-time code storage.** The stored value is exactly the HMAC-SHA-256 of the code under
  `AUTH_SECRET`, checked against Node's own HMAC.
- **Bot-check proofs.** A proof the app's server signs is exactly the HMAC-SHA-256 of its method,
  path, audience (the deployment), subject (an address) and time under `PROTECTION_PROOF_SECRET`,
  checked against Node's own HMAC; it passes for its own target within its minute, and never under
  another secret, for another method, path, deployment or subject, once expired, from beyond the
  clock skew, or with its time or one character of its signature changed.
- **Workspace slugs, the billing catalog's findings and the label formatter.** The label property
  found a formatter that read an inherited name: `{constructor}` with no such parameter printed a
  function's source. It reads own parameters only now.

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

**For 0.2.0, a full run (`process` and `revalidate`, not only the scan) over the release
candidate is a maintainer step of the release's last phase (Phase 3)**, after the surface
checkpoint below.

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

Seven GitHub Apps are installed on the repository, and this is everything each one can write.
None of them can push to `main`: the `main-pr-gate` ruleset takes pull requests only, and its
bypass list names no app. None can publish to npm: the only credential npm accepts is the OIDC
token of a job running in the `Release` environment, from `main`, in `release.yml`.

| App | Can write | Where to see it |
| --- | --- | --- |
| [pkg.pr.new](https://github.com/apps/pkg-pr-new) | One comment per pull request; preview builds, published to pkg.pr.new and nowhere else | `preview.yml`, and the comment on any pull request |
| [CodeRabbit](https://github.com/apps/coderabbitai) | Reviews and comments on pull requests | `.coderabbit.yaml`, and its reviews |
| Copilot cloud agent | A branch and a pull request, only when a maintainer assigns it an issue or invokes it | its workflow in the Actions tab (`gh workflow list`) |
| Dependabot | Branches and pull requests for dependency updates | `.github/dependabot.yml`, and its workflow in the Actions tab |
| [Socket Security](https://github.com/apps/socket-security) | Check runs and one comment per pull request on dependency changes | `socket.yml`, and its checks on any pull request |
| [Codecov](https://github.com/apps/codecov) | Coverage check runs and a comment per pull request | the coverage upload step in `ci.yml`, and the `codecov/*` checks |
| [Vercel](https://github.com/apps/vercel) | Deployments and deployment statuses for `main` (the website); never a commit | `website/vercel.json`, and the Deployments tab |

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

No test fixture carries a value shaped like a provider credential: a test builds one at run time
(`test/helpers/secrets.ts`), and `test/unit/secret-literals.test.ts` fails on a literal
`whsec_…`, `re_…`, `polar_…`, `sk_live_…`/`sk_test_…`, AWS key id or GitHub token in any
file git would commit, except the vendored agent skills (`.agents/`, `.claude/`, upstream's text),
the lockfile and binaries. It is an early warning before a push, with its own patterns, not a
second scanner: secret scanning still reads every file, the vendored skills included.

### Open alerts, and why

The alerts a maintainer dismisses rather than fixes, each with where its code runs. Each was
traced on 2026-10-18 or later (the Better Auth rows on 2026-10-29, the rest re-checked against
`main` on 2026-11-01); the reason to dismiss with is the last sentence of its row.

| Alert | What it is | Reachability |
| --- | --- | --- |
| Dependabot: `braces` ≤ 3.0.3 (GHSA-vfj7-8cjw-p6xm, high, no patched version) | Stack exhaustion on a deeply nested brace pattern | Through `micromatch`, only in build tooling: Nuxt's and Nitro's globbing, Nuxt Content and the docs site's other modules. The package's one runtime path, `@nuxtjs/mcp-toolkit` → `vite-plugin-singlefile`, moved to `picomatch` in 2.3.4: this repository's lockfile resolves it (`pnpm why braces --prod --filter nuxt-backend` is empty), and so does an app's fresh install, since the toolkit asks for `^2.3.3`; an app whose lockfile holds 2.3.3 drops `braces` with `pnpm update vite-plugin-singlefile`. Either way every pattern is a developer's own config at build time; nothing passes a request's input to a glob. *Vulnerable code is not actually used.* |
| Dependabot: `better-auth` < 1.7.7 (GHSA-965c-763c-88jm, critical; GHSA-r4xp-prcw-77qf and GHSA-q84f-53jg-9ppm, high) | A magic link minted from OAuth state; the OAuth proxy signing someone in as another user; the device grant's approval screen not naming the client | The package pins `better-auth` to 1.6 (`>=1.6.25 <1.7.0`) because `@convex-dev/better-auth` 0.12.6 accepts nothing newer, and no 1.6 release carries the fixes. Each advisory needs a plugin the package never enables: magic links with a social provider, `oAuthProxy`, `deviceAuthorization` (it runs `emailOTP`, `organization`, `admin`, `lastLoginMethod`, `bearer`, `captcha` and passkeys). An app could add one through `authOptions.plugins`, which the Auth setup page warns against until 1.7. The package moves to 1.7.7 or later once the component accepts it ([Roadmap](https://nuxt-backend.dev/docs/start/roadmap)). *Vulnerable code is not actually used.* |
| Dependabot: `@better-auth/drizzle-adapter`, `@better-auth/kysely-adapter` < 1.7.7 (GHSA-44jh-23m7-hpcf, low) | Concurrent requests can exceed rate limits on PostgreSQL | Installed with `better-auth`; the package stores everything through Convex's adapter, never Drizzle or Kysely. *Vulnerable code is not actually used.* |
| CodeQL #139: `js/file-access-to-http` in `src/doctor.ts` | An outbound request whose URL comes from a file | `nuxt-backend doctor` POSTs an empty body to the deployment's own HTTP-actions origin, read from the project's `.env.local` (the only place a local or self-hosted deployment's site port is written). No file content but that origin leaves the machine. *Used in tests* does not fit; *false positive* does. |
| CodeQL #138: `js/file-access-to-http` in `src/cli/eject.ts` | The same query | `nuxt-backend upgrade` fetches the packaged copy of an ejected file from jsDelivr (`cdn.jsdelivr.net/npm/nuxt-backend@<version>/<path>`) to diff it. The version comes from the stamp `eject` wrote into that file, URL-encoded, and the path is one of the package's own; nothing else from the file is sent. *False positive.* |
| CodeQL #137: `js/file-access-to-http` in `scripts/try/kit.mjs` | The same query | The contributor kit asks `http://127.0.0.1:<port>` whether the local deployment on that port is this checkout's, with the port read from `website/.env.local`. A loopback request in a repository script, never shipped. *False positive.* |
| Dependabot: `minimatch` < 11.0.1 (GHSA-g3hv-75wg-m249, medium, patched only in 11) | Denial of service through glob-part amplification | Through ESLint, TypeDoc, Nuxt Content, `glob` and `editorconfig`: development and build tooling, each matching the repository's own config patterns. Nothing in what the package ships depends on it (`pnpm why minimatch --prod --filter nuxt-backend` is empty), and 5.x, 9.x and 10.x get no backport. *Vulnerable code is not actually used.* |
| Dependabot: `deepmerge` 4.3.1 (GHSA-gcqx-w48m-w2h4, low, no patched version) | `mergeObject()` can return an object with a poisoned prototype | Through `@rollup/plugin-node-resolve`, which merges the build's own resolver options at build time. Not in what the package ships. *Vulnerable code is not actually used.* |
| Dependabot: `fallow` < 3.34.0 (GHSA-h4fr-cmh5-qr62, GHSA-jfwm-3p3c-6hx5, low); osv-scanner the same | An analyzed repository's config can make fallow test or read paths outside its root | fallow is the quality gate's CLI and only ever analyzes this repository. It stays on 3.33.1 until the clone groups 3.34 detects are removed (`.github/dependabot.yml` says why). *Tolerable risk.* |
| osv-scanner: `zod` 3.25.76 (GHSA-mrhx-c7xc-m3w5, high, patched only in 4.6.6) | Validating an oversized constrained collection can exhaust memory | Only in the docs site, through Nuxt Content's own schema code, which validates the site's committed content at build time. The package's runtime resolves zod 4.6.7. *Vulnerable code is not actually used.* |
| Secret scanning #1 and #2: Stripe webhook signing secret in `test/unit/webhook-guard.test.ts` | Two made-up `whsec_` fixtures, never issued by any provider | Gone from the tree: the test builds its secrets at run time now. They stay in history. *Used in tests.* |

### What the package ships to apps

Everything above protects *this repository*. What the package does for an application built on
it — the fail-closed webhook policy, the OAuth-gated agent surface, the Convex-aware CSP, the
passwordless flows and their rate limits — is documented in the
[security guide](https://nuxt-backend.dev/docs/ship/security).

### The 0.2.0 surface checkpoint

Everything 0.2.0 adds that someone outside can reach, reviewed as one checkpoint once the
release's features had landed (SEC2, 2026-10-28), against `main` at `e356474f`. The docs carry the
same inventory with each function's guard:
[Security surface](https://nuxt-backend.dev/docs/ship/security/surface).

- **Routes.** On the deployment: `/email/unsubscribe` (`GET`, `POST`; the email link's signed
  token), `/backend/health` (public state, detail for an administrator) and `/storage/<id>` (with
  `setupStorage`; an expiring signature, raster images inline and everything else downloaded under
  a sandboxing CSP). In the app: `/api/human-proof`, `/api/backend/health`,
  `/api/backend/visitor-ip` (the caller's own address, never cached or kept),
  `/_backend/push/worker.js`, `/manifest.webmanifest` and, under `nuxt dev` only,
  `/api/backend/_monitoring`. The webhook routes are the same two; `/email/events` now also files
  inbound mail and mirrors the provider's suppressions.
- **Public functions of the scaffold.** 70 more than 0.1: the account's export, deletion, consents
  and onboarding; the admin console's reads and the funnel; the activity trail and its activation
  and source questions; notifications, their channels and web push; the gifts' management, save
  offers, withdrawals, the price list and the revenue and Billing tabs; email preferences, their
  signed links, announcements and suppressions; flags and experiments; sign-in alerts; the AI
  costs; the webhook log and its replay.
- **Public functions of the setups an app turns on.** 41 functions the starter doesn't export:
  content reports and appeals (`setupAdmin({ reports })`), launch phases and invitations
  (`setupAccess`), the waitlist, files and share links (`setupStorage`), referrals, the contact
  form, dev inbox and support inbox every `setupEmail` carries, and the deprecated
  `billing.api.getWebhookDeliveries`, removed before release. The backend component's own
  functions added since (`access.rekeyInvite`, `notifications.channelOpen` and the rest) are
  callable only from the app's functions.
- **Env names.** New: `BACKEND_ENVIRONMENT`, `EMAIL_MARKETING_FROM`, `EMAIL_REGION`,
  `EMAIL_DEV_INBOX`, `AI_GATEWAY_API_KEY`, `PROVENANCE_PRIVATE_KEY`, `PROVENANCE_CERTIFICATE`,
  `PUSH_PUBLIC_KEY`, `PUSH_PRIVATE_KEY`, `PROTECTION_PROOF_SECRET`,
  `PROTECTION_CHALLENGE_SECRET_KEY`, `MONITORING_DSN`, `NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY`;
  `AUTH_SECRET` may hold a versioned list. Gone: `AUTH_TRUST_LOCAL_ORIGINS`, `EMAIL_TEST_MODE`,
  `BILLING_ENVIRONMENT`, `NUXT_BACKEND_LOG_OTP`, `NUXT_PUBLIC_BACKEND_SITE_URL`.
- **Public pages.** Signed out: the four legal pages, `/report`, `/unsubscribe`, `/invite`,
  `/waitlist`, `/r/:code`, `/account/keep`. Signed in: `/admin` (hidden), `/gifts`, `/welcome`.
- **Tools that change a deployment.** `env rotate` and `doctor --fix`, run with the developer's
  own credentials, every value on stdin, each provider change only once confirmed.
- **Removed.** The hosted agent endpoint and everything behind it: `/mcp`, `/mcp/exchange`, the
  OAuth routes, the consent page and the agent scopes. The notes below about it are history.

What the checkpoint found:

- **Probe coverage.** The probe suite called only what the starter exports, so the 41 functions of
  the opt-in setups, the report functions among them, were held only by their own suites. The
  suite now runs a second app that re-exports every setup's whole `api`, with a policy for each
  function beyond the scaffold's (`OPT_IN_POLICIES`), and fails when a setup adds a public
  function without one. Every probe held: **no gap**, and the ratchet is still empty. Two
  administrator reads let an administrator's visit read, by the Billing tab's rule:
  `getReferralConsole` and the deprecated `billing.api.getWebhookDeliveries`. The metered AI
  functions an app defines with `ai.stream`, `ai.chat`, `ai.knowledge` and `defineJobQueue` are
  app code built from the package's guards, held by `ai-chat.test.ts` and `jobs.test.ts`, not by
  the registry.
- **Static analysis.** `pnpm test:security` and `fallow security --gate new --changed-since
  e356474f` report no candidate. Every suppression added since 0.1 was read again and holds.
- **Docs.** The app routes table of the HTTP routes reference was missing the visitor-IP, push
  worker, manifest and dev-log routes; it lists them now.

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
  matched. **Fixed** then; pinned by `test/e2e/mcp.test.ts`. **Removed** in 0.2.0, with the
  hosted agent endpoint.
- **Pricing** (`billing:getPricing`, `/pricing`, campaign links; 2026-10-19). Public and the
  same for everyone on purpose, so the page renders on the server: it takes only a currency and
  a promotion's name, reads the products table and the generated id map, and names product ids,
  prices, trials, credit units, feature names and a public promotion's terms, what the provider's
  checkout shows anyway, never a customer. A retired
  plan is listed, marked, so its subscribers' card renders; checkout and plan changes refuse its
  products (`invalid_input`, reason `retired`), as the provider does once they are archived. A
  campaign link's discount code and UTM values come from the URL a visitor followed: the code goes
  through checkout's own refusal count and is never echoed on the page, the UTM values are cut to
  100 characters and stored only on the provider's order, and nothing is stored on the device. A
  verified `benefit.updated` delivery re-syncs the products table with the deployment's own token;
  a failed re-sync is logged, never the delivery's failure. A yearly price grants its year's credits
  up front, so a plan change from a yearly price to a monthly one is always scheduled for the paid
  year's end (`next_period`), whatever proration the caller asks for: switched at once, it would
  refund most of the year while the year's credits stay spent. The `billing-plans` agent tool reads
  the same `getPricing`, so an agent never offers a retired plan as on sale. Pinned by
  `test/convex-component/pricing.test.ts` and the probe suite's policy registry. **New.**
- **Promotions** (the catalog's `discounts`; `discount` on `billing:generateCheckoutLink` and
  `billing:getPricing`, `billing.checkout`, `billing.applyDiscount` and `setupBilling`'s
  `checkoutDiscount`; 2026-10-19). A discount is the provider's own, declared in the catalog and
  pushed by `billing sync`; nothing in the browser creates or changes one. A client names a
  catalog discount only by key and only a public one, which has a code anyone may type anyway:
  any other key, one the catalog does not have and one for none of the checkout's products are
  refused alike (`invalid_input`, `discount`), so a client learns nothing of the server's own, and
  a checkout takes one discount. A discount without a code goes on locked
  (`allowDiscountCodes: false`), so a customer can't swap it. `checkoutDiscount` and
  `applyDiscount` are server code: the hook runs after the caller and every input are checked, and
  `applyDiscount` is no registered function. The provider skips its per-customer limit on a
  subscription's discount change, which `applyDiscount`'s docs say, with the app's own record to
  keep. `getPricing` shows only a public promotion, asked for by its key or code, never its code.
  `billing sync` refuses a 100% forever discount with a code and warns about a public one without
  a per-customer limit, a cap or an end (`doctor` too); the per-customer limit goes through one raw
  provider request with the organization token, to the provider's own API host, pinned to an API
  version. Pinned by `test/convex-component/billing-promotions.test.ts`, the probe suite's
  `input:discount` run and `test/unit/billing-promotions.test.ts`. **New.**
- **The free plan and currencies** (`billing:startFreePlan`, `billing.startFreePlan`, the
  `currency` of `getPricing`, checkout and gift checkout; 2026-10-19). Nobody but the deployment
  starts a free plan: `startFreePlan` is internal, queued for each workspace (or account) the auth
  layer made (on the workpool by `registerBackendRoutes`, by name on the scheduler elsewhere) and
  by a verified `subscription.revoked` delivery, and it subscribes only an entity that exists and
  holds no plan at the provider, to the catalog's $0 product only (the provider refuses a paid one
  without a checkout, and a second subscription). A checkout upgrades the caller's free
  subscription, which the server finds when the client names none; a client may name only a
  subscription of its own (`not_owner` otherwise), and while a paid plan is held beside the free
  one no plan checkout passes (`already_subscribed`), so a late start never lets a second paid
  plan in. The free plan's product is refused at checkout and as a plan change (`invalid_input`,
  reason `free_plan`), and so is a change, cancellation or pause of it. `/organization/create`
  spends the per-member `workspaceCreate` limit, since every workspace becomes a provider
  customer with the free plan's credits. A queue that fails is logged
  (`billing.free_plan_unqueued`), never a sign-in's failure. `getPricing`'s `currency` only picks
  among the prices the catalog publishes anyway; a checkout's and a gift's are checked against the
  products' live prices before the provider hears of them (`invalid_input`, field `currency`).
  The visitor's currency is read from the request's country header or language on the server,
  and the visitor's pick lives in the page's state for the visit: nothing is stored on the device.
  Pinned by `test/convex-component/free-plan.test.ts`, `test/unit/billing-free-plan.test.ts` and
  `test/unit/billing-orders-subscriptions.test.ts`. **New.**
- **The free plan's processing and erasure** (2026-10-19). With a free plan in the catalog, every
  billing entity becomes a provider customer when it is made, not at a first purchase: a
  workspace's owner's email and name (a user's email, with `billTo: 'user'`) reach the provider at
  sign-up, and a live $0 subscription renews every cycle. Deleting an account or a workspace does
  not revoke that subscription nor delete the customer yet: the record and its renewal webhooks
  outlive the entity until the erasure work (the account and workspace erasure items) revokes the
  free subscription and marks the entity as being deleted, so the revoke does not start it again.
  An erasure done at the provider holds today: a `subscription.revoked` whose customer the
  provider deleted never starts the free plan again. **Open: to close with account and workspace
  erasure.**
- **Activity trail** (`audit:listActivity`, `audit:listWorkspaceActivity`, `audit:listAllActivity`,
  `recordBackendEvent` and the auth layer's write points; 2026-10-19). Each read is for one reader
  and answers `null` to anyone else, with the caller read fresh from the component's tables:
  an account reads the rows about it, a workspace's owners and admins (by their role in the
  member table now) the rows inside the active workspace, an administrator (role and ban read
  now) every row; no scope names any of them, so an agent's token reads nothing. A page's cursor
  only narrows the reader's own index range, so a cursor from another view reads the caller's
  own rows. Rows hold ids and a kind's declared fields (a role, a sign-in method, the scopes
  an agent was granted), never an address, a name or a token: an invitation is its id, an email
  change names neither address. Names are joined at read time, and in an account's own activity
  an administrator who acted on it stays unnamed. A recorded event writes one log line of its
  type and id. An auth event that cannot be recorded never fails the request it records; an
  app's own event is refused unless it is under `app.`, flat and bounded (16 fields, 128
  characters each, lists of 32). An account's deletion removes its own record (and the rows of its
  personal workspace, which is named after the person) and pseudonymizes it in the rest, one
  random pseudonym per erasure; a row an administrator took part in, on the account or as it, is
  kept, so deleting an account never erases what an administrator did to it. Pinned by `test/convex-component/audit.test.ts`,
  `test/unit/audit-flow.test.ts`, `test/unit/events-catalog.test.ts` and the probe suite.
  **New.**
- **Admin console and impersonation** (`admin:listUsers`, `admin:getUser`, `admin:listWorkspaces`,
  `admin:getWorkspace`, `/admin/impersonate-user`, `/admin/ban-user`, `/admin/unban-user`;
  2026-10-19). The console's reads answer `null` to anyone who is not an administrator now: the
  caller's role and ban are read fresh from the user table, an agent's token is refused (no scope
  names one), and so is a session opened by impersonating someone. Accounts carry no session
  token: a device session is its id and its times, and signing an account's devices out goes
  through Better Auth's own route by the account's id. An id of another table reads as no row.
  Workspaces are read-only to an administrator; acting inside one takes an impersonation, which
  lasts at most thirty minutes (`IMPERSONATION_SESSION_SECONDS`; an app's longer
  `impersonationSessionDuration`, and Better Auth's default hour, are held to it), takes a recent
  sign-in, and is refused for any account that holds an administrator role, the administrator's
  own included, whoever asks and whatever the app's roles grant (`impersonate-admins`,
  `allowImpersonatingAdmins`, a role of the app's own outside `adminRoles` that may impersonate):
  `forbidden`, reason `admin_target`, by the session hook as the visit would open, after Better
  Auth's own permission check, so a caller who may not impersonate learns nothing of who holds
  the role. A ban is recorded with its length and never its reason (free
  text the trail would keep a year). Pinned by `test/unit/admin-flow.test.ts`,
  `test/convex-component/admin.test.ts` and the probe suite. **New.**
- **Feature flags and kill switches** (`flags:getFlags`, `flags:listFlags`, `flags:setFlag`,
  the `pause_signups`, `pause_checkout` and `pause_ai` switches; 2026-10-19). A flag in the page is
  a hint; the one that counts runs in the function (`requireFlag`) and reads the override in the
  same transaction. `getFlags` is public by design: it answers each flag's value for the caller and
  the maintenance message, never an override, so nobody learns whom a flag targets; `listFlags`
  answers `null` to anyone who is not an administrator now (role and ban read fresh, by the same
  `adminRoles` and `adminUserIds` the console takes), an agent and an administrator acting as
  someone. `setFlag` takes an administrator in person with a recent sign-in (its row of the
  sensitive-action table), refuses a key the app does not declare (it only removes an override a
  dropped flag left), targets on a kill switch and more than 100 ids a list, and records
  `flag.changed` with the flag, its value and how many it targets, never whom. A workspace target
  and a rollout by workspace read the token's active workspace only while the member table still
  lists the caller in it. A kill switch is read where the package makes the call: a code that would
  create an account is refused before it is stored or sent, after the deployment's code limit is
  spent, since the refusal tells whether an address has an account (as a `canSignIn` gate's does),
  and the account creation hook refuses every other route; a checkout, a plan switch and a gift
  purchase after the caller check and before the provider; a metered call before the limits or the
  credits count. An account's erasure
  takes its id out of every flag's targets (`account.erasure_failed` when it cannot). Pinned by
  `test/convex-component/flags.test.ts`, `test/unit/flags-auth-flow.test.ts`,
  `test/unit/flags.test.ts` and the probe suite. **New.**
- **Feature gates** (`billing.requireFeature`, `billing.hasFeature`, the `withFeature` tier of
  `createFunctions`; 2026-10-19). The gate a client can be talked out of is the UI's; the one that
  counts runs in the function and reads the entitlement cache the signed webhooks fill, never the
  caller's input and never the provider. It checks who is calling first, as the billing reads do
  (signed in, a member of the paying workspace read fresh, no agent without the function's scope),
  so a stranger or a removed member learns nothing about a workspace's plan: they are refused for
  who they are, and `hasFeature` answers them `false`. A refusal names the feature asked for and
  the catalog keys of the plans on sale that include it, which `getPricing` publishes anyway. The
  match is one name per benefit (its `key` metadata, else its id), so a value that happens to sit
  in a benefit's metadata (`managedBy`) unlocks nothing, in the function or in the UI. `{ userId }`
  checks an entity server code chose; passing a caller's argument there would make it an oracle,
  and the docs say so. `withFeature` comes from a second `createFunctions` call in `billing.ts`
  (the import order rules out `functions.ts`), and a tier is built from what its call is given:
  the docs, the error a call without `billing` throws and the skills have it take the app's own
  builders and options, so its writes keep the app's triggers and spend `limits.org`. The plan it
  checks is the billing entity's, the active workspace unless the app's `resolveEntity` names
  another. Pinned by `test/convex-component/billing-flows.test.ts` (a removed member, the
  `{ userId }` path, an empty feature) and `test/unit/functions-builders.test.ts`. **New.**
- **Email language and previews** (`user.locale`, `setupEmail({ messages })`, `email.api`'s previews;
  2026-10-19). The account's language is written by the request that creates the account (its
  `Accept-Language`, cut to one language tag of at most 35 characters) and by the person on
  `/update-user`, where a value that is not a language tag is refused (Better Auth runs the
  field's schema); an impersonating administrator still writes only the name and the image. It
  picks which messages an email reads, never a file or a URL. Every value a template interpolates
  is escaped, the layout's brand name, logo URL and links included, and `html`, the tag exported for
  an app's own emails, escapes what it interpolates unless the app marks it `trustedHtml`. The
  preview functions are internal, so only the Convex CLI with the deployment's admin key reaches
  them, and the DevTools panel runs them on a dev deployment only, passing a validated key and
  locale; a test send renders sample data and goes only to the provider's sandbox addresses, so
  it can never email a person. A sign-in code stays out of the preview text a locked screen
  shows. Pinned by `test/unit/email-layout.test.ts`, `test/unit/email-locale.test.ts` and
  `test/unit/devtools-rpc.test.ts`. **New.**
- **Plan quotas** (`billing.requireQuota`, `billing.releaseQuota`, `billing.getQuota`, `getFeatures`'
  `quotas`, `<Gate quota>`; experimental, 2026-10-19). The count that holds is the one the
  creating mutation makes: `requireQuota` reads the limit from the entitlement cache the signed
  webhooks fill (the most any grant's `quota_<key>` metadata allows, `0` when none names it), reads
  the count from the sharded counter and claims in the same transaction, so a refused or failed
  mutation counts nothing and two calls at once conflict and retry rather than overshoot. It refuses
  an action's context, where the read and the write could not be one transaction. It checks the
  caller first, as the feature checks do, so a stranger learns nothing of a workspace's limits; a
  caller-sent `amount` that is not a whole number above zero is `invalid_input`, and a release
  never takes a count below zero, so a repeated delete opens no room the plan did not give. Benefit
  metadata is the app owner's (set by `billing sync` or in the provider's dashboard); a customer
  cannot write it. A quota on members, seats, users, teammates, collaborators, guests or people
  is refused by the sync and by every check, whatever words about the count follow (`seat_limit`):
  no per-seat billing. The refusal's `plans` are catalog keys `getPricing` publishes anyway. An
  entity's first claim of a quota is noted in the backend component (`billingQuotaKeys`), so
  `forgetEntity` resets every count the entity ever made, a quota the catalog has since dropped
  included, and drops the notes with its cache rows. Pinned by
  `test/convex-component/billing-flows.test.ts` (no plan, a failed mutation after the claim, a
  downgrade below what is held, a pushed limit, the caller checks, erasure of a dropped quota's
  count) and `test/unit/billing-quotas.test.ts`. **New.**
- **Account export and erasure** (`account:exportAccountData`, `account:getAccountExport`,
  `account:eraseAccountData`, `/delete-user`, `/delete-user/callback`, `/admin/remove-user`,
  `account.forget`, `account.forgetEmail`; 2026-10-20). The export is the caller's own: signed in,
  never an administrator acting as them (`impersonating`) and never an agent, at most three a day,
  counted by the component before anything is read. The file is JSON in the component's storage,
  apart from the app's files, behind a storage link that works for an hour, then the file is
  deleted; it never carries a session token, a code hash, a passkey key, an agent token or a gift's
  discount. `getAccountExport` answers `null` to a visit and an agent. Deleting an account is
  immediate: a sign-in from the last ten minutes (its row of the sensitive-action table), the
  account's own address typed (`invalid_input` otherwise), the `accountDelete` bucket (three an
  hour per account), and never the only owner of a workspace others belong to (`sole_owner`),
  which holds for an administrator's `/admin/remove-user` and for a confirmation link an earlier
  release emailed, until it expires. No email link deletes an account any more. The erasure starts
  in the deletion's hook and never fails the deletion: the component marks every billing entity
  that goes with the account before any provider call, so neither the free plan nor the provider's
  deliveries that follow its customer's deletion map, cache or record anything of it again; then it
  runs each participant in batches, retries a failing one five times with a growing wait and stops
  at it, logging `account.erasure_failed` with the participant, never the account or its address.
  Rows kept as someone else's record (a workspace's trail, a gift) carry one random pseudonym.
  `eraseAccountData` is internal; `forgetEmail` refuses an address an account holds. Known gap:
  the billing component the app mounts keeps the subscriptions it synced and the entity's link to
  its deleted customer (no address or name; a cancellation keeps its reason and comment), which it
  has no way to delete (an upstream ask). Pinned by `test/convex-component/account.test.ts` (the
  sweep reads every table back for the id and the address), `test/unit/account-erasure-flow.test.ts`,
  `test/convex-component/free-plan.test.ts` and `test/nuxt/account-data.test.ts`. **New.**
- **Docs MCP** (the website: `mcp.nuxt-backend.dev/mcp` and `/api/docs-mcp`; 2026-10-19). Public and
  anonymous on purpose: every tool reads the docs build (its content and two generated JSON files),
  none writes, none fetches a URL a caller names, and none reads a request's cookies or identity.
  Every argument is bounded by its schema (200 characters at most; Docus's `get-page` and
  `list-pages` get bounded schemas over their unchanged handlers), and a lookup matches a name
  against its own keys only, never evaluating it or reaching `Object.prototype`. One stateless
  server per request, no session store, and no tool cache: the toolkit keys one on the raw arguments
  and Nitro keeps it in memory, which callers could fill. A request is one JSON-RPC message of 16 KiB
  at most: a batch is refused, so a request is one tool call and the limit means what it says. A
  caller gets 120 requests a minute per IP (121 in its first window, which nuxt-security opens
  without spending a token), in a bucket of the route's own, kept in memory per server instance;
  the XSS validator is off on that route because tool arguments carry component tags
  (`<PricingTable>`), which the server never renders. On the docs host the middleware answers
  `/mcp` and hands it on in-process, never to another origin, ahead of the package's OAuth gate,
  which keeps `/mcp` on every other host; it answers 404 for OAuth metadata and `/mcp/*`, so the host
  never claims to need sign-in, serves its own MCP server card (the docs MCP, no sign-in; rendered
  per request, never prerendered, so each host answers its own), and sends every other path to
  the site's own host with a 308, so sign-in and cookies stay on one origin. **New.** Pinned by
  `test/docs/docs-mcp.test.ts` and `scripts/check-website-agents.mjs`.
- **Docs assistant** (the website: `/__docus__/assistant`; 2026-10-19). Public and anonymous,
  and every question is a billed model call, so it exists only in a build that holds a credential:
  the deployment's OIDC token on Vercel (`VERCEL` set and `VERCEL_ENV` not `development`, so a
  token `vercel env pull` wrote locally does not count), or `AI_GATEWAY_API_KEY`; without one the
  route answers 404 and no page offers it (`scripts/check-website-agents.mjs` holds CI's build to
  that). The key never reaches the browser: Docus reads it on the server, and on Vercel there is
  none. The endpoint is the site's own (`server/routes/__docus__/assistant.ts`), Docus's handler
  rebuilt from Docus's helpers, because Docus's passes the client's whole conversation to the
  model unchecked. It answers a JSON `POST` only, so another site's page cannot send one without
  a preflight, which the site never allows, and refuses a browser on another site
  (`Sec-Fetch-Site`, or `Origin` from an older browser): no third-party page can spend the
  budget from its visitors' IPs. It reads at most 1 MiB, refuses any role but `user` and
  `assistant` (no `system` steering) and a question past 4,000 characters, and hands the model
  text only: the question and the newest turns, 12 and 24,000 characters at most, without the
  tool results the chat sends back, so a client cannot inflate what each of Docus's ten steps
  re-reads. A question costs one request of 10 a minute per IP, held at the edge by the Vercel
  Firewall on every instance and in each instance's memory everywhere; a gateway budget on the
  project caps the month's spend. Its tools are the docs MCP's, read-only, reached in-process with
  the visitor's own headers; prompt injection can only steer what a read-only tool reads. The XSS
  validator is off on the route because questions name components (`<PricingTable>`); the chat
  renders answers as Markdown and never echoes a question as HTML. **New.** Pinned by
  `test/docs/site-vercel.test.ts`.
- **Edge rate limits** (the website: `server/middleware/0.firewall.ts`; 2026-10-19). On Vercel it
  asks the Firewall about the assistant, `/mcp` on both hosts and the docs MCP's route
  `/api/docs-mcp` before any other handler runs, keyed by the edge's `x-real-ip`, which a caller
  cannot set; a trailing slash, which the router ignores, does not slip past it. A request the
  server makes to itself (Nitro's `localFetch`: the docs host's hand-off, the assistant's tool
  calls) is not counted again. It hands the Firewall the host, the IP headers and the user agent
  only, never the caller's cookies (but the preview's `_vercel_jwt`) or `Authorization`. It
  fails open on purpose: an id with no rule, a Firewall error or a check slower than a second lets
  the request through, so an outage of the limiter cannot take the docs down; the in-memory per-IP
  limits behind it still hold. Off Vercel it does nothing. `@vercel/firewall` is pinned to 1.2.2,
  the last release with npm provenance, and Dependabot holds it there. **New.** Pinned by
  `test/docs/site-vercel.test.ts`.
- **OTP request guard** (2026-09-16). A gated or rate-limited sign-in request is refused on the
  request itself, not after the email is sent; a global fixed-window backstop caps sends
  deployment-wide. **Fixed.**
- **Provider URLs** (checkout, customer portal, invoices; 2026-09-17). They come back from the
  billing provider through the app's own actions, never from the page — but the browser only
  navigates to an `http(s)` destination now, so a `javascript:` or `data:` target can never reach
  `window.location`. **Hardened.**
- **The accept-invitation page** (2026-09-17, 2026-10-27). It sits behind the page guard
  (`definePageMeta({ auth: true })`), so an invitation link cannot be accepted by a visitor who is
  not signed in. The named `auth` route middleware is gone: the page guard is the one guard, and a
  page that still names the middleware fails to resolve it rather than open. **Changed.**
- **Page guard** (`definePageMeta({ auth: { role, workspace, feature, hidden } })`; 2026-10-19,
  2026-10-27).
  A UI guard, not an authorization layer: it decides which screen renders, and every function
  the page calls still checks the caller. On a server render it reads the role and the ban from
  the claims of the token the server fetched from the auth server for this request (the base
  module's SSR plugin fills the per-request cache server-to-server), and the workspace role from
  the auth server through the app's own auth route with the request's cookies; no request event
  reads as signed out, so it fails closed. It decodes those claims without checking the token's
  signature, because the token came server-to-server. An app that turns on `jwtCache` in its
  own `backendAuth(event, …)` call earlier in the same request can make that cached token the
  request's JWT cookie, whose claims a visitor could forge: that changes only which screen renders,
  never what a function returns, since every function verifies the token itself. A page with rules
  always asks for a sign-in; `auth: true` asks for nothing more, while any other value that is not
  an object, and any key that names no rule (a misspelled `roles`), refuses the page rather than
  open it. Hydration trusts the server's decision only for the page the server rendered, never for
  a prerendered payload or a page a client-only redirect reaches. A guarded page's path gets a
  private page's route rules (no cache, `swr` or `isr`, `cache-control: private, no-store`, never
  prerendered), so a cached render for one person never reaches the next, and a wildcard cache rule
  over one draws a startup warning; a page whose path no pattern covers is named in a warning. A
  `feature` rule reads the active workspace's plan through the app's own `billing:getFeatures`
  query, as the caller, on the server render and in the browser; a failed read refuses the page.
  Its 403 names the rule failed (`role`, `workspace`, `feature`, `banned`) and the path asked
  for, never the role or the feature the page wants; a `hidden` page answers 404 instead, to the
  signed-out too, so it never says it exists, and `<AccessDenied>` sends a person back only to a path of this
  site (a WHATWG origin check: `//host` and `/\host` are refused); the way back never carries the
  consent page's one-time code. **New.** Pinned by `test/nuxt/page-access.test.ts`,
  `test/module/registration.test.ts` and the starter's production build (`test/e2e/starter.test.ts`).
- **Bot protection** (the auth routes that send a code or create an account, `/api/human-proof`,
  `verifyHuman`; 2026-10-19). Better Auth runs on the deployment's public URL, so a check only in
  the Nuxt server would be skipped by calling that URL directly. On Vercel the Nuxt server runs
  BotID, drops any `x-backend-proof` header a request arrives with, and signs one (HMAC-SHA-256 of
  method, path, the address the body names, the deployment it forwards to and time under
  `PROTECTION_PROOF_SECRET`, a minute) into what it forwards; the deployment's request guard
  refuses the protected routes (password sign-in among them, when an app turns passwords on)
  without a proof that passes for its own `CONVEX_SITE_URL`, before any limit is spent. A proof
  names its deployment, so a dev server, which signs one for every request, mints nothing
  production takes, and `doctor --prod` warns when production shares `.env.local`'s secret. An
  app's own captcha plugin replaces the package's challenge, never the proof check. The secret is never derived from another, so rotating it is explicit, and a
  comma-separated accept-list (`new,old`) on the deployment rotates it without a gap. BotID
  that cannot run on Vercel refuses (503) rather than let a request through unchecked, and a
  verified bot is refused like any other on these routes. With a site key, Better Auth's own
  captcha plugin verifies a Turnstile answer on the deployment; a provider it cannot reach refuses
  (503), and a request with a passing proof skips it. `verifyHuman` takes a proof bound to its
  action, subject and deployment, or a challenge answer given for its action; a challenge answer
  reaching a query or mutation (no `fetch`) is refused. Two choices on purpose: a proof is not
  single-use, so within its minute it can be replayed for the same route and the same address,
  whose own limits bound what that buys (a Turnstile answer is single-use at the provider); and
  with neither secret set nothing is checked, which `doctor --prod` warns about. Off Vercel no
  proof is signed, so a deployment that takes proofs alone refuses everyone: the Nuxt server
  warns once, and `doctor --prod` when nothing links the project to Vercel. In development the Nuxt server's check answers human, as BotID
  does there. `doctor` compares the two sides' secrets by sending a proof signed with the local
  one on an empty code request, never by reading the deployment's value. **New.** Pinned by
  `test/unit/protection.test.ts`, `test/nuxt/use-human-check.test.ts`
  and `test/unit/property/proof.test.ts`.
- **Sensitive actions and re-authentication** (the sensitive-action table, `requireRecentSignIn`,
  the sign-in routes marked `x-backend-reauthenticate`; 2026-10-19). A session of any age could
  save or remove a passkey, ask to delete its account, delete a workspace, invite, remove or
  change the role of a member, approve an agent (whose tokens outlive the session) or run an
  administrator's writes, so a left-open laptop or a copied cookie was enough for them.
  Those now take a sign-in from the last ten minutes, counted from the session's `createdAt`,
  which the session token carries as `authTime` (a reserved claim: no user field can write it).
  One table names every auth route and every public write the scaffold ships, and the package's
  one request guard enforces the routes' rows (a recent sign-in, the impersonation allowlist, the
  limits) before anything is spent; the functions keep theirs through their caller rule, and the
  probe suite calls each as a stale session. It fails closed: an agent's token, an administrator's
  visit, a token naming no session or no `authTime` never pass. Re-authentication is a sign-in on
  a browser that holds a session: marked, it must come from that session (never a visit), a code
  goes only to the account's own address, a session for another account is refused before it is
  written (`other_account`), and so is a marked sign-in the guard recorded no session for (fail
  closed), the new one keeps the active workspace, and the old one is deleted. A query never
  takes a window (it is not rerun as time passes): declaring one throws.
  Revoking a session never asks, so a person defending an account is never held up. **New.**
  Pinned by `test/unit/sensitive-actions.test.ts`, `test/unit/authorization.test.ts`,
  `test/unit/functions-builders.test.ts`, `test/unit/agent-consent-flow.test.ts` and
  `test/convex-component/authorization-probes.test.ts`.
- **Device sessions** (`auth:listSessions`, `auth:revokeSession`; 2026-10-14). The list and the
  revoke work from the Convex identity, so a session of any age can manage the others. Better
  Auth's `/list-sessions` refused any session over a day old, which broke `/security`. Rows carry
  ids, never tokens. A revoke resolves the id among the caller's own sessions only, and then
  runs through Better Auth's `/revoke-session`, whose ownership check, database hooks and
  secondary storage apply. Agent tokens carry no session, so they read `null` and cannot revoke.
  The list read only the first page of sessions, so an account with over a hundred missed the
  rest; it reads every page now (2026-10-16). **Fixed.** Pinned by
  `test/convex-component/sessions.test.ts`.
- **Scaffolded email sending** (`email:send`; 2026-10-14). `send` was a public action gated
  only on a sign-in, so any visitor who could sign in could mail any address from the app's
  verified domain. It is an `internalAction` now. The any-address example is `sendAsAdmin`
  (`admin.action`, plain text only), and the welcome step sends plain text, so a display name
  is never markup. **Fixed.** Pinned by `test/unit/scaffold-relay.test.ts`, which fails when a
  function a browser can call takes a recipient, commented examples included.
- **Agent authorization** (`/mcp/authorize`, `/mcp/token`, `/oauth2/consent`, `/mcp/register`;
  2026-10-14). An anonymously registered client received an authorization code at once: the
  provider skipped consent unless the agent itself asked for it, did not require PKCE, and its
  token endpoint would trade a code still waiting for consent. Every authorization now stops at
  the consent page (`prompt=consent` forced on the request), PKCE is required, `/mcp/token`
  refuses an unconsented code, `/oauth2/consent` answers only the account the request was made
  for and refuses approval while impersonating, and registration has a deployment-wide ceiling.
  The consent page reads the request from the server, keeps the code out of its URL, cannot be
  framed, and opens no callback with a script-capable scheme (registration already refuses one). **Fixed.** Pinned by `test/unit/agent-consent-flow.test.ts`, which runs the real
  provider on Better Auth's memory adapter.
- **Values the CLI sets on a deployment** (`env push`, `doctor --fix`, `nuxt-backend dev`, the
  dev server's env provisioning, `billing sync`; 2026-10-15, corrected 2026-10-16). A new billing
  webhook endpoint's secret was printed as a ready `convex env set` line, so it landed in terminal
  history, CI logs and coding-agent transcripts. The first fix stored it through the `env push`
  engine instead, but that engine passed every value to `convex env set` as an argument: visible
  to any process on the machine (`ps`) while the command ran, and quoted by Node in the error of a
  command that failed or timed out — which `env push` (text and `--json`), `doctor --fix`,
  `nuxt-backend dev`, the dev server's log and `billing sync` all print. Every value now reaches
  `convex env set` on its stdin, never as an argument, and a failed Convex CLI call is reported as
  its subcommand, its exit code and the last lines of its stderr, with the value scrubbed out —
  never its arguments, stdin or stdout. `billing sync` writes only the deployment it read first:
  under `--env production` the webhook URL is production's (from `convex function-spec --prod`,
  a custom domain in the shell winning), a dev or preview deploy key is refused, and so is a
  production or project key under sandbox; an endpoint on another deployment than the one its
  secret goes to is refused; a secret already on the deployment is replaced only with `--force`;
  and the manual fallback, `npx convex env set BILLING_WEBHOOK_SECRET`, asks for the value instead
  of taking it on the command line. **Fixed.** Pinned by `test/unit/convex-cli.test.ts` and
  `test/unit/env-push-secrets.test.ts`, which run a stand-in Convex CLI that refuses every write
  and record what reached its argv and its stdin, and by `test/unit/billing-sync-command.test.ts`.
- **Previews, project defaults and the CLI's inbox** (`env push --preview`, `env push --defaults`,
  `nuxt-backend inbox`; 2026-10-17). The preview and defaults targets write through the same engine,
  each value on stdin (`convex env default set` reads it there too). A preview is selected by name,
  and a deploy key that is not a preview key is refused, since the Convex CLI would follow it to
  another deployment; project defaults are never written for production, nor with a production
  key in hand; a preview's `SITE_URL` is never taken from `.env.local`, which names the dev app.
  `inbox` prints sign-in codes, so it reads only a dev-class deployment: `--prod`, any deploy key
  but a dev one, another kind of `CONVEX_DEPLOYMENT` and a self-hosted deployment are refused
  before the Convex CLI starts, only the provider's sandbox addresses are read, and message bodies
  are never printed. The component keeps nothing once test mode is off. **New.** Pinned by
  `test/unit/env-push-preview.test.ts`, which runs a stand-in Convex CLI, and
  `test/unit/cli-inbox.test.ts`.
- **Agent skills `init` copies into an app** (`init`, `init --agents`; 2026-10-19). The skills
  are instructions coding agents follow, so `init` takes them only from the installed package
  (`node_modules/nuxt-backend/skills`, else the running CLI's own), fetches nothing, and writes
  only `.agents/skills/nuxt-backend*` and, in a project that uses Claude Code, links in
  `.claude/skills/` (junctions on Windows). A copy already there is replaced, and one of a skill
  the installed version no longer ships deleted, only under `--agents` or `--force`; a link
  someone put there is replaced by a copy or removed as a link, never written through; a skill
  the project's `skills-lock.json` lists is the skills CLI's and never touched. Reading a copy
  that can't be read counts it as stale instead of failing `doctor`. **New.** Pinned by
  `test/unit/agents.test.ts`.
- **A dev push with another deployment's deploy key** (`env push`, `doctor --fix`,
  `nuxt-backend dev`, `autoEnv`; 2026-10-19). A push without `--prod` took itself for a dev
  push from the deployment `.env.local` names, while the Convex CLI follows `CONVEX_DEPLOY_KEY`
  whatever the flags say: with a production key in the shell or `.env.local` it gave production
  a generated `AUTH_SECRET`, a localhost `SITE_URL`, sign-in codes in the logs and the trusted
  loopback origins (today a `development` `BACKEND_ENVIRONMENT`). A push to the dev deployment
  now refuses every deploy key but a dev one before the Convex CLI is asked anything;
  `nuxt-backend dev` skips it and says why. **Fixed.** Pinned by
  `test/unit/env-push-target.test.ts`, `test/unit/doctor-prod-target.test.ts` and
  `test/unit/cli-dev.test.ts`.
- **One variable says what kind of deployment this is** (`BACKEND_ENVIRONMENT`; 2026-10-27).
  Email's test mode, the billing sandbox, the local origins auth and billing trust, the sign-in
  codes in the logs and the environment a report names all read it, where five variables once
  did, so they cannot drift apart. Only the literal `production` takes the providers out of their
  test modes, and only the literal `development` trusts a local origin or logs a code: an unset
  value, a mistyped one (the deploy's validator refuses it, and the backend reads any other
  string as unset) and `preview` or `sandbox` keep mail on the provider's test addresses, bill
  in the provider's sandbox and trust `SITE_URL` alone. `env push` derives it from the
  deployment's kind and never forwards a value from `.env.local`, which holds the dev
  deployment's; a value already set stays unless forced, so a demo's `sandbox` is never
  replaced. `doctor --prod` fails when production holds `development`, `preview` or none, and
  `doctor` names the removed variables a deployment still holds. **New.** Pinned by
  `test/unit/environment.test.ts`, `test/unit/env-push.test.ts`,
  `test/unit/doctor-prod-posture.test.ts` and `test/unit/local-origins.test.ts`.
- **No simulators in the package** (`nuxt-backend dev`, `billing sync`, `inbox`; 2026-10-27).
  Development runs on the providers' own test modes, so nothing the package ships stands in for a
  provider, grants a plan or a credit without a payment, or signs an event as a provider would.
  The billing simulator, its email events and the stand-in model left with
  `BILLING_SIMULATOR_URL`, `NUXT_BACKEND_SIMULATE_MODELS` and `simulate`: the backend reads
  neither variable, `billing sync` takes `sandbox` or `production` and nothing else, and the
  model route is the Convex AI Gateway, the Vercel AI Gateway with the deployment's key, or a
  refusal. The suites keep a fake of the provider's API under `test/fixtures/polar-fake`, which
  no build ships. **Removed.** Pinned by `test/unit/env-registry.test.ts`,
  `test/unit/ai-models.test.ts` and `test/unit/polar-fake.test.ts`.
- **The dev inbox** (`nuxt-backend inbox`, `useSandboxInbox`, `setupEmail(…).api.getSandboxInbox`;
  2026-10-27). The mail a deployment outside production sent to the email provider's test
  addresses, read back from the provider's own log of sent email with the deployment's
  `EMAIL_API_KEY`; the package keeps no copy. It answers only for a provider test address, only
  while email is in test mode and only with a key, so a real inbox is never read; with test mode
  off it answers nothing. The key's value never leaves the deployment: `inbox` runs the
  component's action with the Convex CLI and prints sender, subject, time and code, never a body,
  and refuses `--prod`, any deploy key but a dev one and a deployment that is not dev-class. The
  browser reader (`getSandboxInbox`) is a public action by design, since a visitor reads a code
  before having an account: it is published only by an app that re-exports it, anyone who knows a
  test address can read its mail, and each read costs the app two to four calls to the provider
  (the list, and the newest three bodies). **New.** Pinned by `test/unit/sandbox-inbox.test.ts`,
  `test/convex-component/email.test.ts` and `test/unit/cli-inbox.test.ts`.
- **One webhook verifier** (`/billing/events`, `/email/events`; 2026-10-27). Both routes verify
  a delivery once, through one function on `standardwebhooks`: an HMAC-SHA256 over
  `id.timestamp.body`, compared in constant time, with a five-minute window either way. It fails
  closed and never throws: no secret, a missing header, a header family mixed from `webhook-*` and
  `svix-*`, a stale or future timestamp, or a signature no accepted secret matches is a refusal.
  Each secret of the rotation list is tried under the spec's key reading (the base64 after
  `whsec_`), and, for the billing route alone, under the provider's earlier reading (the whole
  secret's UTF-8 bytes) for secrets created before 2026-09-08. The billing route no longer hands
  the body to the provider component's own route: after the check, the provider SDK parses the
  verified body (a type it does not know is logged as unknown, never handled) and the package
  writes the provider component's subscriptions and products itself. `svix` left the
  dependencies. **Changed.** Pinned by `test/unit/property/webhook-signatures.test.ts`,
  `test/unit/webhook-guard.test.ts` and `test/convex-component/billing-webhook-edge.test.ts`.
- **One `createFunctions`** (`nuxt-backend/functions`; 2026-10-27). The tiers, the roles and
  the step-up rule come from one call, and `nuxt-backend/authorization` is gone, so no function
  can be built from a second, unchecked set of builders. A function's `impersonation` and
  `recentSignIn` are checked when it is defined: a misspelt value throws at load, never opens.
  `setUserRole` is always an internal mutation (never callable from a browser) and records
  `admin.role_changed`. An import cycle that would hand `createFunctions` an undefined
  `billing` throws at load, where it once built a `withFeature` that could not check. **Changed.**
  Pinned by `test/unit/functions-builders.test.ts`, `test/unit/authorization.test.ts` and the
  probe suite.
- **`nuxt-backend upgrade`** (the scaffold repairs and the package's data migrations;
  2026-10-19, reset 2026-10-27). It rewrites none of the app's code: it has no codemods, so it
  parses and writes no file of the app's beyond the scaffold repairs, which are `doctor --fix`'s,
  made as it makes them. Its dry run repairs a scratch
  copy that holds copies of the app's files, never links, under one temporary directory (a
  functions directory above the project too), so a repair cannot write into the app or beside
  it. The data step runs `migrations:status` and `migrations:run`, internal functions of the
  `backend` component that only the deployment's admin key reaches (`convex run --component`), on
  the dev deployment, or on production with `--prod --yes`; like `env push`, it refuses a deploy
  key for any other deployment before the Convex CLI is asked anything, and it prints no env
  value. `personalWorkspaces`
  makes an organization and its owner membership only for a signed-in user (a live session) who
  has none, the rows their sign-in would have made, and never for a banned user; it cannot ask
  the app's `canSignIn`, which runs in the app, so a user without a live session is left to
  their next sign-in, which asks it; `activeWorkspaces` sets a live session's active workspace
  only to its own user's first membership. **Changed.** Pinned by `test/unit/cli-upgrade.test.ts` and
  `test/convex-component/package-migrations.test.ts`.
- **Monitoring** (`/api/backend/health`, the deployment's `/backend/health`, the dev server's
  `/api/backend/_monitoring`, error reports and cron check-ins; 2026-10-19). Both health routes are
  public by design, for uptime checks: the public form is the summary and each layer's state, never
  an env name, a reason or an error. The detail is for a person's own session whose account holds an
  admin role (`registerBackendRoutes`' `adminRoles`, default `admin`), read fresh (an agent's
  token, a banned admin and a plain user get the public form), or for anyone on a deployment whose
  `BACKEND_ENVIRONMENT` is `development`, which `env push` sets on a dev deployment only and
  never forwards from `.env.local`: a loopback URL alone is no proof, since a self-hosted backend
  serves from one by default. The app's route asks only the deployment site URL from runtime config
  at a fixed path, forwards the caller's session token there and nothing else from the request, and
  its `deployment` and `monitoring` hints can change only the words of the caller's own answer,
  never who gets the detail. The local error log is registered only under `nuxt dev`, never in a
  build, and refuses a request a browser marks as another site's (`Sec-Fetch-Site`). Reports carry
  an error's name, message and stack, the function and its error code: never a call's arguments, a
  session, or who made the call; a refusal from the error catalog is never reported, and an event
  the SDK's own handlers caught about one is dropped. The browser's DSN is public by nature (it can
  only post events). The backend posts only to the DSN on its own env, a malformed one turns
  reporting off (and reads as `failing` on the health route), and a post that takes longer than
  three seconds is given up. **New.** Pinned by
  `test/unit/health-route.test.ts`, `test/unit/monitoring-app.test.ts` and
  `test/unit/monitoring-reports.test.ts`.
- **The billing section and the return from checkout** (`cancelPendingChange`, `getFeatures`'s
  benefits, `?checkout_return=`; 2026-10-19). `cancelPendingChange` is one more lifecycle action
  behind the same gate as the rest: the caller's own billing entity resolved on the server, its
  owner or an admin in person (never a member, an impersonating admin or an agent), the rate
  limit, a `subscriptionId` checked against the entity's own subscriptions, and a refusal before
  the provider is asked when no change is scheduled; a second period-end cancellation and an
  uncancel with nothing to undo are refused the same way, after the same gate. The benefits
  `getFeatures` lists carry what a customer may see of a grant and nothing else: a license key's
  display key (masked by the provider), a file count and a repository's `owner/name`; the
  account, server and file ids stay with the provider. The checkout's id comes back on the
  success URL under the package's own `checkout_return`, which the server still holds to
  `SITE_URL`'s origin, leaving an app's own `checkout_id` alone; the client plugin takes it off
  the address and only ever calls `syncEntitlements`, the throttled refresh of the caller's own
  entitlements, once auth has settled and only for a signed-in person, so a crafted
  `?checkout_return=` can make a page refresh its own plan once and nothing more. The packaged
  cancellation asks for no reason or comment; one a flow of the app's own sends is the
  customer's own words, trimmed, refused over 500 characters, and kept with the cancellation at
  the billing provider. One action of a settings or pricing panel runs at a time, so a
  cancellation on its way can't be closed and sent again. **New.** Pinned by
  `test/convex-component/authorization-probes.test.ts`,
  `test/convex-component/billing-flows.test.ts`, `test/unit/billing-orders-subscriptions.test.ts`
  and `test/nuxt/checkout-return.test.ts`.
- **What the docs site serves agents** (`/llms.txt`, `/llms-full.txt`, the `.md` and `/raw` twins,
  `/sitemap.md`, the skills under `/.well-known/skills/` with the core skill's manifest and rename
  map, `/.well-known/mcp/server-card.json`; 2026-10-19). The documents are prerendered from the docs
  and the package's own files. The twin handler and the Markdown 404 still answer an unknown path
  at request time, and the MCP card is a runtime route too: they read the public content database
  and the site's own config, never a user or a session. The playground and the app pages at the root (`/login`,
  `/accept-invitation`, `/oauth/consent`) are kept out, so an agent gets those pages, never a
  document built from them. The MCP card used to say `/mcp` needed no sign-in; it now says the
  endpoint is OAuth-gated, and claims no tools it cannot see. The docs assistant stays off, so
  nothing answers questions on the site's behalf. **New.** Pinned by
  `test/docs/agent-surfaces.test.ts` and, against every build and the live site weekly,
  `scripts/check-website-agents.mjs`.
- **Codes and email change** (`/email-otp/*`, `/change-email`; 2026-10-15). Codes were stored
  in plain text, so a read of the database yielded working sign-in codes, and an email change
  sent links: following the one at the new address moved the account and signed in whoever
  opened it. Codes are stored as a hash keyed by `AUTH_SECRET` now (the first fix, an unkeyed
  SHA-256 of a six-digit code, was invertible in under a second), and every proof of a mailbox is
  a code: an email change takes one from the current address, then one from the new address (the
  core link routes are off), and a verification is a code too. The code to the new address is limited per
  account and counts against the deployment-wide ceiling. Session tokens carry the
  impersonating admin's id, so functions can refuse an impersonated session. **Fixed.** Pinned
  by `test/unit/email-change-flow.test.ts`, which runs the real flow on Better Auth's memory
  adapter.
- **Code guessing** (`/email-otp/*`; 2026-10-16). `/email-otp/check-verification-otp` checked a
  code without consuming it, and on Convex its wrong-guess count landed on another row than the
  one it read, so guesses went uncounted. The route is off. A new code replaces the one before it,
  so one is live per address; checks spend `emailOtpAttempt` (ten an hour per address, spent only
  while a code is waiting, so nobody can lock an address out without one); password reset is off
  until an app turns passwords on. Session and agent tokens stay stored as Better Auth stores
  them. **Fixed.** Pinned by `test/unit/otp-codes-flow.test.ts`.
- **Bearer-authenticated requests** (2026-10-16). The request guards read the caller from the
  session cookie, which the bearer plugin fills in only after every before-hook has run, so a
  request sent with `Authorization: Bearer` skipped the per-caller limits, the impersonation
  refusals and the consent page's ownership check. The guards now resolve the session as the
  route will, and refuse a credential that resolves to none. **Fixed.** Pinned by
  `test/unit/bearer-guards.test.ts` and `test/unit/agent-consent-flow.test.ts`.
- **Impersonation** (2026-10-16). An admin impersonating someone could save a passkey on their
  account and sign in as them after the impersonation ended. While impersonating, these are
  refused now: passkey registration, verification, renaming and removal, both steps of an email
  change, account deletion, approving an agent, inviting a member, changing a member's role and
  linking a social account. **Fixed.** Pinned by `test/unit/bearer-guards.test.ts`.
- **Email change notice** (`/email-otp/change-email`; 2026-10-16). A change someone else made
  went unnoticed by the address it left. The old address now hears of every change, after the
  route answers, and the first code of a change says what it is for. **Hardened.** Pinned by
  `test/unit/email-change-flow.test.ts`.
- **Email change and the sign-in gate** (`/email-otp/request-email-change`,
  `/email-otp/change-email`; 2026-10-19). Both steps asked the app's `canSignIn` about an address
  the caller typed before any limit was spent, and the second asked it with no code waiting for
  the pair, so any signed-in account could learn, without limit, which addresses an invite list,
  a domain policy or a ban list admits. The first step now asks nothing until a code to the
  current address is waiting, and, with `rateLimiter` passed to `setupAuth` (the scaffold
  passes it), spends the caller's own `emailChange` request (five an hour) before the gate
  answers; the second asks only about a pair the first let through. **Fixed.**
  Pinned by `test/unit/email-change-flow.test.ts`.
- **Passkey sign-in challenge and the last sign-in method**
  (`/passkey/generate-authenticate-options`, Better Auth's `lastLoginMethod`; 2026-10-19). The
  challenge route needs no session and stores a challenge per call, and passkey autofill calls it on
  every sign-in page that offers passkeys (again every 4.5 minutes while the page stays open in
  view, a challenge lasting five), so it had no bound: anyone could fill the verification table. It
  now spends `passkeySignIn` per client address (an HMAC, under the auth secret, of what Better Auth
  reads from `x-forwarded-for`: an address has too few values for a plain digest to hide it; a
  direct caller can forge the header, so a best effort), then the deployment-wide
  `passkeySignInGlobal`, which a rotating caller meets; at the ceiling, email codes still sign
  people in. The answer route uses its challenge up and spends nothing. Every sign-in now records
  its method on the account and in the `better-auth.last_used_login_method` cookie: readable by the
  page (not `HttpOnly`), 30 days, the method's name and nothing else; an impersonation records
  nothing. The form reads the cookie as a hint only: a value it does not know reads as none.
  **New.** Pinned by `test/unit/last-sign-in-flow.test.ts`, which runs real Better Auth, and
  `test/e2e/passkey-autofill.test.ts`, which signs in through a field's autofill in Chromium.
- **Personal workspace** (2026-10-16). A person whose personal workspace still existed, after
  they left it or were removed, could never sign in again: re-creating it hit the unique slug.
  They rejoin it when it is empty, and get a new one otherwise; the sign-in gate runs before any
  write. **Fixed.** Pinned by `test/unit/workspace-session-flow.test.ts`.
- **Every public function of the scaffold** (2026-10-17). Each function the starter's backend
  exports has a declared policy: who it is for (anyone, any signed-in account, a workspace
  member, a billing manager, an admin), whether an impersonated session may call it, the OAuth
  scope an agent's token needs for it, and which inputs only the server may choose. The probe
  suite calls every function as a signed-out visitor, another member, a removed or demoted
  member whose token predates the change, the manager of another workspace passing the
  principal's ids, an impersonating admin, an agent holding every scope and one holding only
  `openid profile`, and with off-catalog products, foreign redirects,
  reserved metadata keys and client-chosen trials; the billing functions again with
  `billTo: 'user'`, and as an account banned since its token was minted. A public function
  without a policy fails the suite, and so does a probe that gets through where its policy
  refuses it, or is refused for another reason than the rule it breaks. The first run found
  65 gaps, all in billing, AI metering and the admin functions. The checkout fix below closed 17,
  and the fresh authorization reads below the other 48: the ratchet that listed them, each with
  the rule it broke and the plan item that closes it, is empty, and the suite fails on any gap
  it does not list. Two entries look like holes and are by design: an email's delivery status
  is readable by any signed-in caller holding its id, and an AI stream's body by anyone holding
  the stream id. **Fixed.** Pinned by
  `test/convex-component/authorization-probes.test.ts`, with the registry and the ratchet beside
  it.
- **Billing, AI metering and the admin functions** (every `billing:` function but the price list
  and the gifts, `ai:transform`, `ai:startEcho`, `billing:refundOrder`,
  `billing:getWebhookDeliveries`, `email:sendAsAdmin`, `auth:revokeSession`; 2026-10-17).
  Billing took the workspace from the session token and the admin functions took the role from
  it, so a removed member kept the workspace's plan, credits and metered AI, and a demoted admin
  kept `refundOrder`, `sendAsAdmin` and the webhook log, until the token expired (up to 15
  minutes). Any member of a workspace could check out, open the portal, change, cancel, pause or
  resume the plan, and read its orders and invoices. An administrator impersonating someone could
  spend their credits, change their plan and sign their devices out, and an agent's token could
  change the plan, refund an order and send mail from an admin function. Every billing call now
  reads the account (a banned or deleted one is refused) and the caller's membership and
  workspace role from the auth tables, once per call; only the workspace's owner and admins
  manage its billing (`forbidden`, reason `not_billing_manager`); an admin function reads the
  account's role from the user table. The runtime rows sit beside the functions they gate
  (`BILLING_ACCESS`, `ADMIN_WRITE` and `ADMIN_READ` in billing, the tiers of
  `createFunctions`, each auth function's own); the probe suite's policy registry mirrors them,
  and the probes hold the two together. They decide which calls refuse an impersonated session
  (`impersonating`): spending credits, checkout and the portal, the plan's lifecycle, signing
  devices out, and every admin write. **Fixed.** Pinned by the probe suite,
  `test/unit/billing-integration.test.ts`, `test/unit/billing-orders-subscriptions.test.ts`,
  `test/unit/webhook-log-access.test.ts`, `test/unit/functions-builders.test.ts` and
  `test/convex-component/sessions.test.ts`.
  **Limits:** the provider does not list workspace admins as billing managers of the team
  customer yet, so an admin passes the server's check and is still refused the portal
  (`provider_owner_only`).
- **Agent scopes in Convex** (every public function; 2026-10-17). An agent's scopes were
  checked only by the MCP tools: the Convex JWT the exchange mints works for every function its
  user can call, so an agent granted `billing:read` alone could still change the plan, open
  the portal, spend credits or revoke sessions through `fetchMutation` and `fetchAction`, and
  a session token was told from an agent's by a `clientId` claim a user field of that name
  could supply. The exchange now marks an agent's token (`agent: true`); a token carrying the
  marker, a `clientId` or `scopes` is an agent's, fail closed; a session token never takes
  those, `impersonatedBy`, or a claim Convex reads the identity from (`subject`, `issuer`,
  `tokenIdentifier`, the OpenID Connect claims) from a field of the user; and every function
  the package ships names the scope an agent needs for it, refusing an agent
  without it (`insufficient_scope`) and every agent where it names none (`agent_token`): the
  portal, the plan's lifecycle, metered AI, the gift claim, session revocation and every admin
  function. The builders of `createFunctions` refuse
  agents the same way unless the function names a `scope`. The `billing-portal-link` tool is
  gone. **Fixed.** Pinned by the probe suite, `test/unit/functions-builders.test.ts`,
  `test/unit/authorization.test.ts` and `test/unit/test-kit-claims.test.ts`.
- **Impersonation on the auth routes** (every route; 2026-10-17). An administrator
  impersonating someone could sign their devices out through Better Auth's own routes, which the
  Convex `revokeSession` already refused, leave, delete or join their workspaces, read the
  provider tokens of their linked accounts, and reach any route a plugin adds. The routes now
  hold an impersonated session to an allowlist — reads, the Convex token, signing out and
  `/admin/stop-impersonating`, the profile's name and image (no field of the app's own),
  switching, creating or renaming a workspace, withdrawing or declining an invitation, reading
  and denying an agent's request — and refuse everything
  else (`forbidden`, reason `impersonating`), so a route added later is refused until it is
  judged. Buying and claiming a gift refuse it in Convex too. **Fixed.** Pinned by
  `test/unit/bearer-guards.test.ts` (`/unlink-account` and `/change-password` included) and
  `test/unit/billing-gifts.test.ts`.
- **Bans** (2026-10-17). A ban reached the caller's next call only when its token expired, up to
  15 minutes later. Every billing call, the gift functions, `updateProfile`, `revokeSession`
  and the mutations and actions of every `createFunctions` tier read the account fresh now, and
  refuse a banned one (`forbidden`, reason `banned`) and a deleted one (`unauthenticated`).
  The `authed` and `withRole` queries and the auth reads still read the token's claims.
  **Fixed.** Pinned by the probe suite's banned runs, `test/unit/functions-builders.test.ts`
  and `test/convex-component/sessions.test.ts`.
- **Checkout, plan changes and gifts** (`billing:generateCheckoutLink`,
  `billing:updateSubscription`, `billing:giftCheckout`, `billing:generateCustomerPortalUrl`;
  2026-10-17). The browser chose everything: any product id the provider sells, the trial and
  its length, a discount by id, the metadata — including the `userId` key a webhook resolves the
  billing entity by and the gift keys a paid order is delivered by — and where the buyer, with a
  checkout id in the query, was sent afterwards. Each is the server's now: products come from
  the app's catalog (a plan change too, and a gift is a catalog credit pack named by its key),
  success, return and embed URLs must be on `SITE_URL`'s origin or a `trustedOrigins` entry,
  the package's metadata keys and the `utm_` prefix are refused, and a trial or a discount by
  id comes only from server code (`billing.checkout`, a trial of 1 to 30 days in days or
  weeks). A plan change must switch to a recurring catalog plan, never a pack. A client may still
  send a discount code, which the provider checks; each refused code counts against the billing
  entity, ten in a fixed one-hour window whatever rate limiter the app passes, so a checkout is no
  way to test codes. The attempt is counted in one transaction before the provider sees the code,
  so parallel checkouts can't get more codes checked between them, and given back when the code
  is accepted or never tried.
  Campaign attribution is stored as `utm_*` metadata. Webhooks resolve the billing entity from
  the customer's own metadata only: an order's or a subscription's is copied from the checkout
  a buyer filled in. The provider's own product list and single-subscription change and
  cancel actions are no longer part of `billing.api`. **Fixed.** Pinned by
  `test/unit/billing-orders-subscriptions.test.ts`, `test/unit/billing-integration.test.ts`,
  `test/convex-component/billing.test.ts` and the probe suite, whose ratchet lost every checkout
  gap and whose input probes count only an `invalid_input` on the probed field as a refusal.
- **Billing customers and gifts** (`billing:generateCheckoutLink`,
  `billing:generateCustomerPortalUrl`, `billing:giftCheckout`, `billing:claimGift`,
  `billing:getReceivedGifts`; 2026-10-17). Checkout found a billing customer by the email of the
  member who started it, so a second workspace of the same owner was mapped onto the first one's
  customer and shared its plan and credits. A gift checkout was billed to a customer keyed by the
  recipient's email: the purchaser saw the recipient's billing details pre-filled and got no
  receipt, a customer was created for any address before anyone paid, and a refunded gift stayed
  claimable. Every billing entity now has a provider customer of its own, keyed by its id and never
  looked up by email; a workspace is a team customer whose portal opens only as its owner's own
  member (or a billing manager's), found by the caller's user id, or by the caller's verified email
  for a member no account is keyed to (an adopted customer's owner). An earlier customer is
  adopted only for an email its owner verified, and a claim and the received-gift list need a
  verified email too. A gift is bought on the purchaser's own customer, as a
  private benefit-less twin of the pack with discount codes off, and claimed into the recipient's
  own customer through a single-use, code-free 100% discount minted only once the purchase is
  paid on the purchaser's entity, at a price above zero and with no discount; the claim is
  confirmed only at $0. Any paid order that redeemed the gift's single-use discount is its claim,
  whichever of the recipient's entities it landed on. Any refund before the claim deletes the
  discount, unless it was already redeemed, and a refund that arrives before the purchase's
  `order.paid` voids the pending gift. A purchaser needs an earlier paid order and may buy at most
  10 gifts in 30 days by default, open checkouts counted, with the cap checked again at payment (a
  gift paid past it is refunded), and never one for their own address; the gift email carries the sender's name (at most 40 characters, links removed)
  and no token, and `getReceivedGifts` returns no purchaser email or billing id. **Fixed.** Pinned
  by `test/unit/billing-orders-subscriptions.test.ts`, `test/unit/billing-gifts.test.ts`,
  `test/unit/billing-integration.test.ts` and `test/convex-component/gifts.test.ts`.
  **Limits:** a claimed gift's credits can't be taken back (the provider can't revoke what a $0
  order granted), so a refund after the claim returns the money only; a demoted workspace owner
  keeps their provider member until member mirroring lands, though the server refuses them first
  (see the note above), and workspace admins are not billing managers at the provider yet; an
  adopted customer's owner who changes their email loses the portal until the
  member is updated at the provider; the provider's own trial-abuse matching does not cover team
  customers, so the package records one trial per owner user id itself.
- **DevTools** (2026-09-17). The Backend tab and its RPC run only under `nuxt dev`, on Vite's
  middleware — reachable exactly as far as Nuxt DevTools itself. **Accepted.**
- **App layers** (`nuxt-backend status`, the DevTools Overview's layer console, `capabilityHealth`;
  2026-10-19). Detection reads one value only, to tell a provider's mode apart
  (`BACKEND_ENVIRONMENT`), and reports states, env names and finding messages,
  never a value: the DevTools RPC carries the console with the same guarantee as the rest of the
  panel, pinned by the sentinel test in `test/unit/devtools-info.test.ts`. The panel reads no value
  off the deployment. `status` lists the deployment's env names once, runs `doctor`'s checks, and
  reads the two switches with `convex env get` where the deployment sets them: `deploymentSwitch`
  takes no other name, keeps only the values the backend tells apart and never prints one. A
  switch it cannot read counts as its safe mode, so no layer reads live from a name alone.
  `--prod` counts only production's names, none when they cannot be read, and refuses a dev or
  preview deploy key as `doctor --prod` does. `capabilityHealth`'s coarse form, the one a public
  health endpoint may serve, holds the summary and each layer's state and no env name or
  finding; the detail form is for admins only. **Accepted.** Pinned by `test/unit/capabilities.test.ts`
  and `test/unit/cli-status.test.ts`.
- **Production posture and live probes** (`doctor --prod`, `status --prod`; 2026-10-19). Beside
  the two switches, the CLI reads one more value off production, `SITE_URL`, and keeps only its
  origin (`deploymentSiteOrigin`): the app's public origin, which every emailed link names. A name
  production does not set is never read. The email facts come from `posture:email`, an internal
  action of the backend component that only an admin key reaches (`convex run --prod --component
  backend`): it reads the deployment's own forwarded `EMAIL_FROM` and `EMAIL_API_KEY`, sends the
  email provider's API, through its SDK, `GET`s only (`/domains`, up to five pages, and
  `/emails/metrics`) with that key as the bearer and a five-second timeout each, and answers with
  the sender's domain, the provider's statuses and counts and its quota headers: never the key,
  never an address. The live probes start at the `https` origin production's `SITE_URL` names,
  never a local or plain-HTTP one, and send what an anonymous visitor could: no cookie, no token,
  an empty JSON-RPC `initialize` to the agent endpoint. Every probe but the root's stops at a
  redirect; the root's redirects are followed, as a browser would (anonymous `GET`s, no
  credentials), so a landing on another origin, or on plain HTTP, can be reported. They read
  statuses, headers and public bodies, and print origins and paths, nothing else. **Accepted.**
  Pinned by `test/unit/doctor-prod-probes.test.ts` (a local server; no cookie or authorization
  header leaves), `test/unit/doctor-prod-posture.test.ts`, `test/unit/email-posture.test.ts` and
  `test/convex-component/posture.test.ts`.
- **Model calls** (`setupAi({ model })`, `ctx.model()`, `ai.modelStatus()`; 2026-10-19). A
  `provider/model` id reaches the AI Gateway only with the deployment's `AI_GATEWAY_API_KEY`,
  passed to the gateway provider explicitly, so it never falls back to an ambient credential. The
  key stays on the deployment: `modelStatus` reports a state and the id, never a value, and
  `doctor` reads env names only. Without the key, and where the Convex AI Gateway does not
  answer, nothing answers in its place: no stand-in model exists in the package, on any kind of
  deployment. The call is refused with `unavailable` before the rate limit, the budget or the
  balance counts anything when the action or stream names its model or settles from its reported
  cost, and otherwise when the handler calls it, with the reservation released. Under
  `nuxt-backend/test`, `defineBackendTestApp` answers every id with the AI SDK's mock (`ai/test`),
  which repeats the prompt and reports a fixed cost, through a hook on `globalThis` that nothing
  but that helper sets: a deployment never has it, and the SDK's test entry ships in no
  deployment bundle.
  A reported cost settles through the existing reservation: never above the estimate; a call whose
  cost is unreported and unpriced, or a stream left unread or broken before it reported one,
  settles at the reservation rather than for free; a run whose every model call failed is a failed
  run, released even when its handler returned (`streamText` swallows the error). A stream settles
  from inside the streaming component's writer, once its handler is done, never when the response
  starts. **New.** Pinned by `test/unit/ai-models.test.ts`, which runs the gateway provider
  against a stubbed fetch, and `test/unit/doctor-gateway-key.test.ts`.
- **Local origins and the try kit** (a `development` `BACKEND_ENVIRONMENT`, `pnpm try`, the website's
  `personas:*` functions and its review-notes endpoint; 2026-10-19). A `development`
  `BACKEND_ENVIRONMENT`, which `env push` sets on a dev deployment only, now trusts any `.localhost` name over `https` (`https://nuxt-backend.localhost`, what a
  local HTTPS proxy serves) beside loopback on any port, for auth and for billing's return URLs,
  through one check (`src/convex/local-origins.ts`). Current browsers resolve a `.localhost` name
  to the loopback address without asking DNS, but RFC 6761 makes that a SHOULD, so a name under
  `localhost` is trusted over `https` only: a host a hostile resolver pointed it at would also need
  a certificate for the name from the local proxy's own authority. Plain `http` stays trusted for
  `localhost`, `127.0.0.1` and `[::1]`, which never reach DNS. A name that only starts like one
  (`nuxt-backend.localhost.evil.com`) or carries a path is refused. `env push` still never forwards
  the kind to a non-dev deployment, and `doctor --prod` fails when production holds `development`. The try kit acts only on
  the local deployment `website/.env.local` names: it refuses a cloud or self-hosted deployment and
  a deploy key in the file, asks again after provisioning one, drops one exported in the shell, and
  checks with the deployment's own admin key that what answers on its port is that deployment, not
  another checkout's. The persona functions write accounts outside every sign-in check. They are
  internal, so only an admin key reaches them; behind that, each refuses a deployment unless its own
  URL is a loopback address and it carries the marker the try kit sets on the local deployment it seeds
  (`TRY_KIT_LOCAL`), since a self-hosted backend also serves from `127.0.0.1`. They live in the
  site's backend only: the Panels sync never copies the site's files into a template. The
  review-notes endpoint exists only under `nuxt dev` (the website module registers nothing in a
  build), refuses outside a dev server or under `NODE_ENV=production`, takes a note only from a page
  whose Origin is the host it was sent to and a name of this machine or its network (or the tailnet
  origin `pnpm try` serves at), so a page whose name a DNS rebinding points at the machine is
  refused, caps every field, stops at 5 MB and appends to a gitignored file; in LAN mode a device
  on the network can reach it like the rest of the dev server. `pnpm try:starter` installs the
  starter's dependencies with the repository's release-age cooldown. **New.** Pinned by
  `test/unit/local-origins.test.ts`, `test/unit/try-kit.test.ts`, `test/unit/try-notes.test.ts`,
  `test/unit/try-personas.test.ts` and `test/convex-component/try-personas.test.ts`.
