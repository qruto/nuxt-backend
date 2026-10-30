---
title: Security model
description: "How an app built on the package is guarded end to end: the Content Security Policy, webhooks verified once and failing closed, sign-in codes and passkeys with their limits, step-up for sensitive actions, administrator visits, secret rotation and what stays internal."
kind: concept
capability: hosting
related:
  - /docs/ship/checklist
  - /docs/ship/security/surface
  - /docs/build/auth/sign-in/bots
navigation:
  title: Overview
  icon: i-lucide-shield-check
---

Every part of your app an outsider can reach is guarded where it runs, by default. This page explains the model part by part, so you know what the package protects and what production still needs from you. [Security surface](/docs/ship/security/surface) lists everything the package exposes, and [Prepare for launch](/docs/ship/checklist) checks the settings production needs.

| Threat | What stops it | Where |
|---|---|---|
| Scripts injected into a page, or a page talking to another backend | A Content Security Policy the module extends with the deployment's origins | [Content Security Policy](#content-security-policy) |
| Forged or replayed provider events | Signatures verified once, failing closed, and deduplicated by delivery id | [Webhooks: fail closed](#webhooks-fail-closed) |
| Guessing or flooding sign-in codes | Sign-in by code and passkey, keyed code hashes, and limits per address and per deployment | [Passwordless sign-in](#passwordless-sign-in-and-its-rate-limits) |
| Bots signing up or sending codes to strangers | A bot check before a code is sent or an account is created | [Bot protection](/docs/services/bot-protection) |
| A sign-in code read over a shoulder or typed into a phishing page | Codes that work only in the browser that asked for them | [Passwordless sign-in](#passwordless-sign-in-and-its-rate-limits) |
| A stolen or forgotten session used for something lasting | A recent sign-in for sensitive actions | [Step-up](#a-recent-sign-in-for-sensitive-actions) |
| An administrator's visit changing an account for good | Short visits that cannot change credentials, and never of an administrator | [Administrator visits](#an-administrator-acting-as-someone-else) |
| A browser calling what only the server may | Privileged functions kept internal, and reads gated by identity | [Privileged operations](#privileged-operations-stay-internal) |
| A leaked secret | A rotation with no downtime | [Secret rotation](#secret-rotation) |
| A compromised dependency or agent hook | Lockfiles, an install cooldown, scripts allowed by name, reviewed agent config | [Secure your supply chain](/docs/ship/security/supply-chain) |

## Content Security Policy

`nuxt-security` is a dependency of this package, and the module installs it in every app, so every app gets its security headers. The Convex integration tightens the policy for you. A Nitro plugin, hooked into `nuxt-security:routeRules`, adds the deployment's origins to `connect-src` (in production), `img-src` and `media-src` at runtime, on top of what the app configured. Configure the rest through `nuxt-security`'s own `security` key:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['nuxt-backend'],
  security: {
    headers: {
      contentSecurityPolicy: {
        // extend, e.g. an analytics origin; the Convex origins are added for you
        'connect-src': ['\'self\'', 'https://analytics.example.com'],
      },
    },
  },
})
```

With a [bot check](/docs/build/auth/sign-in/bots) challenge site key set, a second plugin lets the challenge in. `https://challenges.cloudflare.com` joins `script-src` and `frame-src` (`child-src` when frames fall back to it). A policy that restricts only `default-src` gains its own `script-src` and `frame-src` from it, so nothing else that directive governs opens.

The auth proxy (`/api/auth/**`) carries its own rules, merged over the global config, and your `routeRules` can override them in turn:

- `xssValidator: false`. The validator HTML-escapes JSON bodies and rejects anything that changed, which would break a display name containing `<`. These are opaque credentials forwarded to Better Auth, never rendered HTML.
- `allowedMethodsRestricter` limits the proxy to `GET`, `HEAD`, `POST` and `OPTIONS`.

The policy is nonce-based: `nuxt-security` puts a fresh nonce on every script and style the server renders, and `script-src` trusts what those load (`'strict-dynamic'`). A production build also requires [Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) (`require-trusted-types-for 'script'`), so no string reaches a DOM sink that runs script unless a policy passed it. The policy names three: `vue`, Vue's own; `nuxt-backend`, the package's (the bot check's script); and a narrow `default`, for code that knows nothing of Trusted Types, such as the head manager writing a JSON-LD block. It passes HTML without markup, script text that is JSON, and script URLs on the page's own origin, and refuses the rest, so the sink throws. Development leaves Trusted Types off, because Vite's error overlay writes markup no policy passes.

Code of yours, or a library's, that writes such a sink needs a policy of its own: list its name in `trusted-types`, or turn the requirement off.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  security: {
    headers: {
      contentSecurityPolicy: {
        'trusted-types': ['vue', 'nuxt-backend', 'default', 'my-editor'],
        // or: 'require-trusted-types-for': false,
      },
    },
  },
})
```

`convex.security: false` opts out of the Convex additions. `security: false` turns `nuxt-security` off entirely, which the package does not recommend.

## Webhooks: fail closed

Both inbound webhooks, `/billing/events` and `/email/events`, share one edge. It verifies the signature once, before any handler runs, with one [Standard Webhooks](https://www.standardwebhooks.com/) verifier: Polar signs to the spec with secrets created on or after 2026-09-08, and Resend signs through Svix, whose scheme the spec adopted. In `0.2.0` the verifier also accepts Polar's older HMAC, so a secret created before that date keeps working ([Polar](/docs/services/polar#link-it)). One verifier serves both routes, so their policy cannot drift apart:

| Condition | Status | Logged outcome |
|---|---|---|
| Secret env missing or empty | `503` | `missing_secret` |
| Invalid or stale signature (±5 min replay tolerance) | `403` | `invalid_signature` |
| Body over 1 MiB | `413` | `oversized` |
| Authentic, type unknown to this package | `202` | `unknown_type` |
| Handler threw | `500`, so the provider retries | `handler_error` |
| Redelivery of a fully processed id | `200` | `duplicate` |
| Success | `2xx` | `ok` |

A handler that throws answers `5xx`, and the provider retries against idempotent handlers. Dedupe skips only `ok` outcomes, and nothing is swallowed. The routes have **no rate limit** on purpose: the signature is the gate, and a limiter would drop the provider's retry burst after an incident. A forged request still runs the route up to the signature check, which costs a function call and writes nothing. Every outcome lands in the component's [delivery log](/docs/ship/security/webhooks#the-delivery-log), which `getWebhookDeliveries` serves to administrators only. A verified delivery gets its own row among the newest 200. A request refused before verification is counted per kind, so a flood of forged requests can't push a real delivery out. `doctor` probes both routes, and fails on `404` (not mounted) and `503` (mounted, but no secret).

## Passwordless sign-in and its rate limits

There are no passwords. Sign-in is a sign-in code by email (Better Auth's `emailOTP` plugin) or a passkey, so no password exists to guess or leak. What an attacker can reach is the code itself: asking for one, and checking one. These rules shape it:

- **Accounts are created with a code only.** A passkey is added from a signed-in session (the `passkey-offer` step of [`useLoginFlow`](/docs/build/auth/sign-in)), never as the first credential. Minting an account from a WebAuthn ceremony over a typed, unverified address would let an attacker plant a passkey on a victim's address before the victim signs up.
- **A code works only where it was asked for.** Asking for a code sets an HttpOnly cookie on the auth route, a MAC of that code tagged for sign-in, and checking the code needs it: a code from another browser is refused as `invalid_input` on `otp`, reason `other_browser`, before it costs a guess. The email names the device, an approximate place and the time it was asked from ([Codes work only where they were asked for](/docs/build/auth/sign-in#codes-work-only-where-they-were-asked-for)). A passkey-only account refuses codes altogether ([Passkey-only accounts](/docs/build/auth/sign-in#passkey-only-accounts)).
- **A code is a live credential.** The database keeps an HMAC-SHA-256 of it, keyed by `AUTH_SECRET`. A six-digit code has a million values, so an unkeyed hash is inverted in under a second by anyone who can read the table. Keyed, the stored value yields nothing without the secret. Codes appear in the logs only on a deployment whose `BACKEND_ENVIRONMENT` is `development`.
- **Guessing has two bounds.** One code is a 6-digit number, valid for 5 minutes and refused after 3 wrong guesses (`TOO_MANY_ATTEMPTS`). A new code replaces the last one sent to the same address for the same purpose. One address gets 10 guesses an hour across all its codes (`emailOtpAttempt`, below), so asking for new codes buys no more.
- **No link proves a mailbox.** Verifying an address and both halves of an email change are codes too: one from the current address, then one from the new address. So a forwarded email, or a mail scanner that opens every link, changes nothing. Better Auth's link routes are off: `/send-verification-email`, `/verify-email` and `/change-email` answer `404`. Deleting an account takes a recent sign-in and the account's address typed to confirm it, and it waits out a grace period ([Export and delete account data](/docs/build/auth/accounts/data)).
- **Sessions are stored as they are.** Better Auth keeps session tokens in plain form, so read access to the deployment's data is access to every signed-in account. Guard the Convex dashboard and the deploy keys as you would the accounts themselves.

The package also turns off the code routes it never uses, merged into your own `disabledPaths` and refused by the route's own path, so no spelling of the URL reaches them. `/email-otp/check-verification-otp` checks a code without using it up, under an attempt counter concurrent guesses outrun. The password-reset code routes go too, since the package has no passwords.

Codes are throttled by four limits from `DEFAULT_LIMITS`, applied once the limiter is passed to `setupAuth` as `rateLimiter`, as the scaffold does:

| Limit | Default | Keyed by | Where it runs |
|---|---|---|---|
| `emailOtp` | Token bucket, 5 per minute per address, burst 5 | A SHA-256 of the address: the address itself never enters the limiter's table | In a request hook on `POST /email-otp/send-verification-otp`, after the sign-in gate, so an address the gate refuses spends none of its quota |
| `emailOtpGlobal` | Fixed window, 300 per hour, deployment-wide | Nothing | In the same hook, before the gate, and on `POST /email-otp/request-email-change`. It runs before a code is minted: Better Auth swallows what the send callback throws and still answers success, so every limit runs on the request itself |
| `emailOtpAttempt` | Token bucket, 10 per hour per address | A SHA-256 of the address the code went to | In a request hook on every route that checks a code (`/sign-in/email-otp`, `/email-otp/verify-email` and both steps of an email change) before the code is read, and only while a code is waiting |
| `emailChange` | Token bucket, 5 per hour per account | The signed-in user | In a request hook on `POST /email-otp/request-email-change`, which sends the code to the new address the caller chose |

A closed limit answers `429` (`TOO_MANY_REQUESTS`), and the sign-in UI shows it. `emailOtpGlobal` is the ceiling an attacker rotating addresses hits. Once junk requests spend it, nobody signs in by code until the hour ends, while passkeys keep working: the bot check keeps scripts from spending it. Raise it for a launch that signs in more than 300 people an hour. `emailOtpAttempt` is what a guess loop meets. Like any limit keyed by an address, someone who spends it can keep that address from signing in by code for the hour. That works only while codes go to it, and a passkey still signs it in. The sign-in gate (`canSignIn`) runs in the same request hook, and again before any account or session is created ([auth setup](/docs/build/auth/setup#cross-component-wiring), [Tune rate limits](/docs/ship/security/rate-limits)).

### Passkey sign-in and the last sign-in method

A passkey sign-in needs no session either. It starts with a challenge the server stores until the answer comes. Passkey autofill asks for one on every sign-in page that offers passkeys in the email field, then every four and a half minutes while that page stays open. The challenge route (`/passkey/generate-authenticate-options`) spends two limits from `DEFAULT_LIMITS`:

| Limit | Default | Keyed by | Where it runs |
|---|---|---|---|
| `passkeySignIn` | Token bucket, 30 per minute per client address, burst 30 | An HMAC-SHA-256 of the address, keyed by `AUTH_SECRET`: an address has too few values for a plain digest to hide it | In a request hook on the challenge route, with the address Better Auth reads from `x-forwarded-for` (`advanced.ipAddress`). A request whose headers name no address it trusts spends the ceiling alone |
| `passkeySignInGlobal` | Fixed window, 3000 per hour, deployment-wide | Nothing | In the same hook, after the address's own bucket allowed the request |

The address is a best effort: only a proxy in front of the deployment makes `x-forwarded-for` true, and anyone calling the deployment directly writes it themselves. A caller who rotates it meets the ceiling, which turns passkey sign-in off for everyone until the window ends. Email codes still sign people in. The answer route uses its challenge up and spends nothing. Check, once deployed, which address reaches the deployment through your app's auth proxy: [Tune rate limits](/docs/ship/security/rate-limits#privileged-routes) says what to do when every visitor shares one.

Every sign-in also records how it was made, on the account (`user.lastLoginMethod`) and in the `better-auth.last_used_login_method` cookie for 30 days. The page reads the cookie, so it is not `HttpOnly`. It holds the method's name (`passkey` or `email-otp`) and nothing else, and the sign-in form treats any other value as none. An administrator's visit and an email change record nothing.

### The caller is the one the route sees

Every limit and refusal keyed on the caller reads the session the route will run with. That includes a request authenticated with `Authorization: Bearer <session token>`, which the Convex plugin accepts in place of the cookie. A credential that resolves to no session is refused with `401` before the route runs.

### An administrator acting as someone else

While an administrator impersonates an account, its session carries `impersonatedBy`, and the account cannot be changed in ways that outlast the visit. The administrator cannot add, rename or remove a passkey, start or finish an email change, delete the account, invite anyone to its workspaces or change a member's role there. Each is refused with `403`. Reading, and `/admin/stop-impersonating`, stay open.

A visit is short and never of an administrator. Its session ends after thirty minutes at most (`IMPERSONATION_SESSION_SECONDS`), whatever the app's `impersonationSessionDuration` asks. A visit of any account that holds an administrator role is refused as `forbidden`, reason `admin_target`, whoever asks and whatever the app's roles grant. The admin console's reads (`setupAdmin`) answer `null` to a visit, as they do to anyone who is not an administrator now. [Impersonation](/docs/build/auth/admin/impersonation) has what a visit may and may not do.

### A recent sign-in for sensitive actions

Some actions take a sign-in from the last ten minutes:

- saving or removing a passkey;
- asking to delete the account;
- deleting a workspace;
- inviting, removing or changing the role of a member;
- an administrator's writes.

The time counts from the session's own `createdAt`, carried on its token as `authTime`. An older session is refused with `reauthentication_required` before anything runs, and the person confirms it is them with a passkey or a code to their own address. That sign-in must be for the same account. It opens a new session, keeps the active workspace and deletes the old session. An administrator's visit never passes, and revoking sessions never asks. [Require a recent sign-in](/docs/build/auth/access/step-up) has the table of every action and what it takes.

## Secret rotation

`npx nuxt-backend env rotate` replaces each secret below with no downtime. The new value goes in beside the old, both are accepted for a window, then the old one is retired. Nobody is signed out, no emailed link breaks and no webhook delivery is refused ([Rotate secrets](/docs/ship/security/secrets)).

- **Webhook secrets.** `BILLING_WEBHOOK_SECRET` and `EMAIL_WEBHOOK_SECRET` accept a comma-separated list, `whsec_new,whsec_old`, the first one primary. Resend also signs with both secrets for 24 hours after a rotation. An entry with under 16 bytes of key, such as a bare `whsec_` left by a truncated paste, verifies nothing, so its deliveries answer `403` rather than accept a key anyone could sign with.
- **`AUTH_SECRET`** signs sessions, encrypts the session signing keys and keys the hash of every one-time code. It is versioned: the old one keeps verifying for 30 days after the new one takes over, then a second `env rotate` retires it (`--retire` at once, after a leak).
- **Provider tokens** (`BILLING_ACCESS_TOKEN`, `EMAIL_API_KEY`, `AI_GATEWAY_API_KEY`) need no window. Make a new one in the provider's dashboard, set it, and revoke the old. The functions read the env at call time, so nothing is redeployed.
- **`PROTECTION_PROOF_SECRET`**, the bot check's proof secret, is never derived from another. Each environment holds its own, never `.env.local`'s ([Bot protection](/docs/services/bot-protection#go-to-production)).

`env push` and `env rotate` never print a value. Each value reaches `convex env set` on its stdin: never as an argument, where another process could read it, and never quoted in an error.

## Privileged operations stay internal

The scaffold's `send` is an **internal action**. As a public action, it would be an open relay on your verified domain. To send to an address someone types, declare a function on the `admin` tier of [`functions.ts`](/docs/build/auth/access/functions) that calls it. `test/unit/scaffold-relay.test.ts` fails if a function a browser can call ever takes a recipient. `setUserRole` is internal for the same reason.

Reads are gated by identity. `getEmailStatus` (recipient and error detail) and every billing read return `null` to anonymous callers. `getWebhookDeliveries` names every account's event types, provider ids and handler errors, so it returns `null` to anyone but an administrator.

## Origins in development

`SITE_URL` is the only trusted browser origin for auth. It is also the only origin a checkout, a gift checkout or the billing portal sends a buyer back to, besides any listed in `setupBilling({ trustedOrigins })` ([What the server decides](/docs/build/billing/subscriptions/checkout#what-the-server-decides)). A deployment whose `BACKEND_ENVIRONMENT` is `development` also trusts local origins, for auth and for billing's return URLs:

- `localhost`, `127.0.0.1` and `[::1]` on any port, over `http` or `https`;
- any `.localhost` name over `https`, as a local HTTPS proxy such as portless serves it. Plain `http` is refused there, since only a certificate proves such a name is this machine.

No other environment trusts them. Nothing in the DevTools panel carries env values: only presence booleans cross its RPC.

## What this means for you

- **Most of it needs nothing from you.** The webhook edge, the code limits, step-up and the visit rules are on in every app, with no option that turns them off. The policy is on too, and `nuxt-security`'s own options extend it.
- **Production needs its own secrets and settings.** A strong `AUTH_SECRET` of its own, `SITE_URL` on its HTTPS origin, `BACKEND_ENVIRONMENT=production`, the webhook secrets, and the bot check's proof secret or challenge keys. `doctor --prod` checks each ([Prepare for launch](/docs/ship/checklist)).
- **Your own functions follow the same rules** when you build them with the [function builders](/docs/build/auth/access/functions): a role read fresh, impersonation refused where it should be, and a recent sign-in for what lasts.
- **Guard the dashboards.** Read access to the deployment's data is access to every session. Keep the Convex dashboard, the deploy keys and the providers' dashboards to the people who run production ([Service map](/docs/services)).
- **Guard what you install.** The package cannot vet your other dependencies. Turn on your package manager's cooldown and script allowlist ([Secure your supply chain](/docs/ship/security/supply-chain)).

## Reporting a vulnerability

Report it privately, through [GitHub Security Advisories](https://github.com/qruto/nuxt-backend/security/advisories/new), never in a public issue. The repository's SECURITY.md says what to include and what happens next.
