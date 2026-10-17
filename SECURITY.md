# Security Policy

> Looking for how to **secure an app built with this package** — the CSP, the auth proxy, the
> webhook policy, the agent surface, and a production checklist? That's the
> [security guide](https://nuxt-backend.dev/docs/ship/production/security) and the
> [launch checklist](https://nuxt-backend.dev/docs/ship/production). This file covers reporting
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
metadata proxy, the AI stream), the doctor's probe of the project's own `SITE_URL`, the CLI's two
spawns of the project's own Convex CLI (the current Node binary, no shell, fixed subcommands, and
every value on stdin), the DevTools panel reading package versions from a fixed list, and a regex
the playground builds from an escaped search term.

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

### What the package ships to apps

Everything above protects *this repository*. What the package does for an application built on
it — the fail-closed webhook policy, the OAuth-gated agent surface, the Convex-aware CSP, the
passwordless flows and their rate limits — is documented in the
[security guide](https://nuxt-backend.dev/docs/ship/production/security).

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
- **Personal workspace** (2026-10-16). A person whose personal workspace still existed, after
  they left it or were removed, could never sign in again: re-creating it hit the unique slug.
  They rejoin it when it is empty, and get a new one otherwise; the sign-in gate runs before any
  write. **Fixed.** Pinned by `test/unit/workspace-session-flow.test.ts`.
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
  keeps their provider member until member mirroring lands, and workspace admins are not billing
  managers yet; an adopted customer's owner who changes their email loses the portal until the
  member is updated at the provider; the provider's own trial-abuse matching does not cover team
  customers, so the package records one trial per owner user id itself.
- **DevTools** (2026-09-17). The Backend tab and its RPC run only under `nuxt dev`, on Vite's
  middleware — reachable exactly as far as Nuxt DevTools itself. **Accepted.**
