---
name: test-nuxt-backend
description: End-to-end verification playbook for the nuxt-backend playground — live authed browser testing against Polar sandbox + Resend test mode on the Convex dev deployment. Use when asked to test/verify auth, billing, credits, email, or workspace features of this package.
---

# Testing nuxt-backend end-to-end

Everything runs against **testing environments only**: Polar **sandbox** (`BILLING_ENVIRONMENT=sandbox`), Resend **test mode** (default on; only `*@resend.dev` inboxes), Convex **dev** deployment (the `CONVEX_DEPLOYMENT` in the root `.env.local`). The dev server is `pnpm dev` from the repo root → **https://nuxt-backend.localhost** (portless proxy, Nuxt serves `website/`); `pnpm dev:lan` serves the same stack at **https://nuxt-backend.local** for phones on the network. Watch for origin drift: the deployment's `SITE_URL` must equal the origin you test through (`npx convex env get SITE_URL`) — emailed links and sign-in break until they match. Always test through the portless origin, not `127.0.0.1:<port>` (client auth state needs the canonical origin).

## Environment cheatsheet

- Secrets live **on the Convex deployment**, not in dotenv files: `npx convex env get <NAME>` (from repo root). Names: `BILLING_ACCESS_TOKEN`, `BILLING_ENVIRONMENT`, `BILLING_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `EMAIL_TEST_MODE`, `EMAIL_WEBHOOK_SECRET`, `AUTH_SECRET`, `SITE_URL`.
- The Polar/Resend **MCP servers have under-scoped or dead tokens** — use `curl` with deployment tokens instead:
  - Polar sandbox API: `https://sandbox-api.polar.sh/v1/...` with `Authorization: Bearer $(npx convex env get BILLING_ACCESS_TOKEN)`. **Trailing slash required** on collection endpoints (`/products/`, `/benefits/`) — without it you get an empty 307 body.
  - Resend API: `https://api.resend.com/emails` with `Bearer $(npx convex env get EMAIL_API_KEY)` — list, then `GET /emails/{id}` for html.
- Polar org `qruto` (sandbox). The catalog is **code**: `website/backend/billing.catalog.ts` (plans, packs, the `credits` meter, feature benefits); `npx nuxt-backend billing sync --env sandbox` finds-or-creates it on the org and writes the product/meter ids into `website/backend/billing.generated.ts` — the only place UUIDs live (commit it when it changes). Prices are in the org's default currency (EUR).
- Catalog: starter €5/50cr, pro €9/200cr+premium, ultra €19/500cr+premium+ultra, credits100 €10, credits500 €40. Feature benefits match `useFeatures().has()` via benefit `metadata: { key: '<feature>' }`.
- Before a pass: `npx nuxt-backend doctor` must be fully green — it probes the deployment env, both webhook routes, the function contract and the catalog against the org (an expired token shows as `billing-organization`).
- Webhooks (verify if entitlements "never arrive"): Polar → `https://<deployment>.convex.site/billing/events`; Resend → `https://<deployment>.convex.site/email/events`.

## Reset & prep

```sh
pnpm run db:reset        # clears app tables + auth component (NOT Polar sandbox — that's fine)
npx convex run billing:createDiscount '{"name":"E2E","percent":100,"code":"E2E100","duration":"forever"}'
```

`duration: "forever"` keeps recurring checkouts card-free. `billing:createDiscount` is an `internalAction` (ops only) — the playground's billing page mints through `createDiscountAsAdmin`, which needs the admin role: `npx convex run functions:setUserRole '{"email":"delivered+LABEL@resend.dev","role":"admin"}'` after that sandbox identity signs up (the marketing actions on the Email page need it too). Products come from `billing sync` (above), not from a seed.

## Sign-in: sandbox identities and the sandbox inbox

The playground admits **sandbox identities only**: `delivered+LABEL@resend.dev` with a label of 16+ lower-case letters and digits (`canSignIn` in `website/backend/auth.ts`; email changes, invitations and gift recipients follow the same rule). Any other address is refused, `delivered@resend.dev` and short labels included.

On `/login`, "Create a sandbox identity" generates one (remembered in localStorage), or type your own (e.g. `delivered+e2e$(date +%s)run@resend.dev`; one label per run, OTP limit 5/min/address). After "Send code", the sandbox inbox under the form shows the code; "Fill the code" enters it. `/playground/platform/email` → "Sandbox inbox" lists any sandbox address's mail from the last hour as text: the welcome, change-email and delete-account links, invitations.

From a shell, the same inbox:

```sh
npx convex run email:getSandboxInbox '{"address":"delivered+LABEL@resend.dev"}'   # newest first; code or links in .text
```

The inbox needs test mode (the default) and keeps a message for an hour. For anything older, list through the Resend API with `EMAIL_API_KEY` (`GET https://api.resend.com/emails`, then `/emails/{id}`; decode `&amp;` → `&` in links).

## Card-free checkout

SaaS pages use redirect checkout (`billing.checkout(id, { redirect: true })`) — automation-friendly, unlike the embed iframe. On the Polar page: "Add discount code" → `E2E100` → Enter → "Get for free". Redirects back to the app; webhooks land within seconds (watch the Billing activity feed on `/playground/saas/pricing`).

## The full pass (what to verify)

1. **Register via OTP** → user chip; exactly **one** "Welcome aboard" email; `auth · user.created` in the feed.
2. **Subscribe Starter** → feed `subscription.active`/`order.paid`; plan pill + credits 50. Plan resolution can lag credits by seconds — the UI self-heals; "Refresh entitlements" forces it.
3. **Spend credit** (settings) → balance decrements reactively. Blocked at 0 (prepaid).
4. **Top-up packs** → balance += pack units.
5. **Switch plan** (`changePlan`, no checkout) → old plan's monthly grant revoked, new granted (e.g. 148−50+200=298).
6. **Change email** (profile, to another sandbox identity) → confirm link to OLD address, verify link to NEW address (read both on the Email page's sandbox inbox) → updated + verified. A non-sandbox address is refused. Covers `changeEmail` + `verify` templates.
7. **Security page** → sessions list (current marked), passkey list/add/rename/remove.
8. **Email outcomes** (platform/email) → bounced flips status; **complained is a flag on top of `delivered`** (shown as a warn pill), events may arrive out of order.
9. **Cancel** → `cancelAtPeriodEnd` warning. **Delete account** → confirmation link → user row gone (`npx convex data user --component backend`).
10. **Workspaces** (settings) → create auto-activates → billing shows Free/0 for the new workspace; switch back → plan/credits return. Billing entity = active workspace (`billTo: 'organization'`).

## Inspecting component state

```sh
npx convex data <table> --component polar            # customers, products, subscriptions
npx convex data <table> --component backend          # auth tables (user, organization, session, passkey, ...), billing entitlements, gifts
npx convex data <table> --component backend/resend   # emails, deliveryEvents
```

## Production (nuxt-backend.dev)

The live playground runs on the production deployment `determined-horse-300`, deployed by Vercel's production build (`website/vercel-build.sh`). A pass there differs from a dev pass:

- Every `npx convex …` needs the production deploy key, **prefixed per command** (`CONVEX_DEPLOY_KEY=… npx convex …`) — never exported into the shell you test from. Check it first: `echo "${CONVEX_DEPLOY_KEY%%|*}"` prints `prod:determined-horse-300`.
- **Never run `pnpm db:reset` or `db:seed` against it.** They drop the key and refuse one kept in `.env.local`, so they always reach the dev deployment — keep it that way.
- Test through `https://nuxt-backend.dev` with a sandbox identity (see Sign-in above): the code shows up in the sandbox inbox on `/login`, as on dev.
- Admin checks need `functions:setUserRole` run against production, from the Convex dashboard or with the key, on a sandbox identity. Keep that address private: whoever knows it can read its codes.
- `pnpm cli doctor --prod` (after `pnpm build`) checks production: env names, the function contract, and the webhook routes on the deployment's own site URL.

## Known limitations & gotchas

- **Passkeys can't be automated** — chrome-devtools MCP has no WebAuthn virtual authenticator; the ceremony fails with a focus/NotAllowed error (the UI must surface it). Manual test: real DevTools → WebAuthn panel → virtual authenticator (ctap2/internal/resident-key) → add passkey → rename/remove → passkey sign-in from `/login`. Pre-auth passkey signup is also the only path to an `emailVerified: false` account (exercises "Send verification email").
- **Better Auth client calls do NOT throw** — they resolve `{ data, error }`. Demo pages unwrap with `unwrapAuth()` (`website/utils/authResult.ts`); forgetting it = silent failures.
- **Marketing broadcasts** require a verified domain — Resend rejects broadcasts from `resend.dev` senders. Expect the surfaced error in test mode. The marketing actions are admin-only, and contacts must be Resend test inboxes.
- **Playground throttles** (`website/backend/rateLimiter.ts`): the test email and the demo workflow share 5 sends a minute per user and 100 an hour for the deployment; the log seeder runs 3 times a minute. Uploads stop at 5 MB and 50 files. Crons (`website/backend/crons.ts`) prune email records and the event feed after a week, and remove uploads nobody saved (daily, once an hour old).
- **`spendCredits`**: omit `userId` so the billing entity resolves from identity claims (org mode); passing the auth user id breaks the Polar customer lookup.
- **Session-dependent UI needs `<ClientOnly>`** — SSR has no session while hydration does; class mismatches silently persist (Vue hydration is check-only for classes).
- `website/backend/**` edits hot-sync via the running `convex dev`; `src/**` module/runtime edits need a `pnpm dev` restart to be safe (runtime stubs sometimes HMR, module.ts never does).
- `billing.api.listAllSubscriptions` is wrapped by `setupBilling` to return `null` for claimless callers (auth handshake / WS reconnect windows) instead of throwing — if "needs an active workspace" errors spam the Convex logs, that wrapper regressed.

## New surfaces to verify (all-in-one alignment)

- **Default pages**: `/playground/vanilla/{pricing,settings,profile,security}` show the untouched `ui.css` look; `/playground/saas/*` are the same components site-styled. `/login` is the app page shadowing the module page (`<AuthForm>` inside); `/accept-invitation` stays module-mounted.
- **Migrations**: `/playground/platform/migrations` — run + dry-run both backfills, watch the live status table and the two aggregate metric cards.
- **Webhooks**: `/playground/platform/webhooks` — send a test email, expect an `email.delivered` row in the unified feed (billing rows come from checkout flows). The feed is for signed-in visitors, and its rows name ids, never addresses.
- **Gifts**: `/playground/platform/credits` — the "Received gifts" panel lists and manually claims (`useGifts({ autoClaim: false })`).
- **Server guards**: `/playground/platform/authorization` — the four guard buttons show real allow/deny per role; the admin panel bans/unbans (admin role required).
- **Auth rate limits**: `/playground/platform/rate-limit` — the `emailOtp` meter drains when requesting codes from `/login` in a second tab.
- **Portal**: `/playground/platform/billing` — "Open portal (composable)" redirects a subscriber to the customer portal.
- **Branded OTP**: request a sign-in code and assert the subject contains "nuxt-backend playground" (custom template from `backend/auth.ts`).
- **CLI**: `npx nuxt-backend doctor` probes `/billing/events`, `/email/events` and `/ai/stream` (`404` = not mounted, `503` = mounted without its secret) and cross-checks the catalog; `doctor --fix` restores scaffold files and runs the `env push` engine; there is no `add` command (re-run `init` to repair).
- **Offline shell**: a build with no backend URL redirects `/playground/**` to `/playground/offline` instead of failing the gated pages (`website/middleware/playground-offline.global.ts`); a preview deployment should land there.
