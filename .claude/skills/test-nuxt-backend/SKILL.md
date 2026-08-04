---
name: test-nuxt-backend
description: End-to-end verification playbook for the nuxt-backend playground — live authed browser testing against Polar sandbox + Resend test mode on the Convex dev deployment. Use when asked to test/verify auth, billing, credits, email, or workspace features of this package.
---

# Testing nuxt-backend end-to-end

Everything runs against **testing environments only**: Polar **sandbox** (`POLAR_SERVER=sandbox`), Resend **test mode** (default on; only `*@resend.dev` inboxes), Convex **dev** deployment (`dev:successful-oyster-718`, see root `.env.local`). The dev server is `pnpm dev` from the repo root → https://nuxt-backend.localhost (portless proxy, Nuxt serves `website/`).

## Environment cheatsheet

- Secrets live **on the Convex deployment**, not in dotenv files: `npx convex env get <NAME>` (from repo root). Names: `POLAR_ORGANIZATION_TOKEN`, `POLAR_SERVER`, `POLAR_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_TEST_MODE`, `RESEND_WEBHOOK_SECRET`, `BETTER_AUTH_SECRET`, `SITE_URL`.
- The Polar/Resend **MCP servers have under-scoped or dead tokens** — use `curl` with deployment tokens instead:
  - Polar sandbox API: `https://sandbox-api.polar.sh/v1/...` with `Authorization: Bearer $(npx convex env get POLAR_ORGANIZATION_TOKEN)`. **Trailing slash required** on collection endpoints (`/products/`, `/benefits/`) — without it you get an empty 307 body.
  - Resend API: `https://api.resend.com/emails` with `Bearer $(npx convex env get RESEND_API_KEY)` — list, then `GET /emails/{id}` for html.
- Polar org `qruto` (sandbox), id `6a50e481-6720-4019-a550-cf2bf410e4c4`, default currency **EUR** (product prices must be `price_currency: "eur"`). Credits meter: `aa62cf4c-2dcd-437d-a407-1872f51531b7`.
- Catalog (products map in `website/backend/billing.ts`): starter €5/50cr, pro €9/200cr+premium, ultra €19/500cr+premium+ultra, credits100 €10, credits500 €40. Feature benefits match `useFeatures().has()` via benefit `metadata: { key: '<feature>' }`.
- Webhooks (verify if entitlements "never arrive"): Polar → `https://successful-oyster-718.convex.site/polar/events`; Resend → `.../resend-webhook`.

## Reset & prep

```sh
pnpm run db:reset        # clears app tables + auth component (NOT Polar sandbox — that's fine)
npx convex run billing:createDiscount '{"name":"E2E","percent":100,"code":"E2E100","duration":"forever"}'
```

`duration: "forever"` keeps recurring checkouts card-free. There is **no product-sync step** — products are static ids in `billing.ts`.

## OTP retrieval (the core trick)

Sign up at `/login` with `delivered+<label>@resend.dev` (unique label per run; OTP rate limit 5/min/address), then:

```sh
RESEND_KEY=$(npx convex env get RESEND_API_KEY)
curl -s https://api.resend.com/emails -H "Authorization: Bearer $RESEND_KEY" \
  | jq -r '[.data[] | select(.to[0]=="delivered+LABEL@resend.dev")] | sort_by(.created_at) | last | .id'
curl -s https://api.resend.com/emails/$ID -H "Authorization: Bearer $RESEND_KEY"   # 6-digit OTP or links in .html
```

Same technique fetches the change-email confirmation link, verification link, and delete-account link (decode `&amp;` → `&` before navigating).

## Card-free checkout

SaaS pages use redirect checkout (`billing.checkout(id, { redirect: true })`) — automation-friendly, unlike the embed iframe. On the Polar page: "Add discount code" → `E2E100` → Enter → "Get for free". Redirects back to the app; webhooks land within seconds (watch the Billing activity feed on `/playground/saas/pricing`).

## The full pass (what to verify)

1. **Register via OTP** → user chip; exactly **one** "Welcome aboard" email; `auth · user.created` in the feed.
2. **Subscribe Starter** → feed `subscription.active`/`order.paid`; plan pill + credits 50. Plan resolution can lag credits by seconds — the UI self-heals; "Refresh entitlements" forces it.
3. **Spend credit** (settings) → balance decrements reactively. Blocked at 0 (prepaid).
4. **Top-up packs** → balance += pack units.
5. **Switch plan** (`changePlan`, no checkout) → old plan's monthly grant revoked, new granted (e.g. 148−50+200=298).
6. **Change email** (profile) → confirm link to OLD address, verify link to NEW address → updated + verified. Covers `changeEmail` + `verify` templates.
7. **Security page** → sessions list (current marked), passkey list/add/rename/remove.
8. **Email outcomes** (platform/email) → bounced flips status; **complained is a flag on top of `delivered`** (shown as a warn pill), events may arrive out of order.
9. **Cancel** → `cancelAtPeriodEnd` warning. **Delete account** → confirmation link → user row gone (`npx convex data user --component auth`).
10. **Workspaces** (settings) → create auto-activates → billing shows Free/0 for the new workspace; switch back → plan/credits return. Billing entity = active workspace (`billTo: 'organization'`).

## Inspecting component state

```sh
npx convex data <table> --component polar            # customers, products, subscriptions
npx convex data <table> --component auth             # user, organization, session, passkey, ...
npx convex data <table> --component billing          # billingEntitlements (entitlement cache)
npx convex data <table> --component email/resend     # emails, deliveryEvents
```

## Known limitations & gotchas

- **Passkeys can't be automated** — chrome-devtools MCP has no WebAuthn virtual authenticator; the ceremony fails with a focus/NotAllowed error (the UI must surface it). Manual test: real DevTools → WebAuthn panel → virtual authenticator (ctap2/internal/resident-key) → add passkey → rename/remove → passkey sign-in from `/login`. Pre-auth passkey signup is also the only path to an `emailVerified: false` account (exercises "Send verification email").
- **Better Auth client calls do NOT throw** — they resolve `{ data, error }`. Demo pages unwrap with `unwrapAuth()` (`website/utils/authResult.ts`); forgetting it = silent failures.
- **Marketing broadcasts** require a verified domain — Resend rejects broadcasts from `resend.dev` senders. Expect the surfaced error in test mode.
- **`spendCredits`**: omit `userId` so the billing entity resolves from identity claims (org mode); passing the auth user id breaks the Polar customer lookup.
- **Session-dependent UI needs `<ClientOnly>`** — SSR has no session while hydration does; class mismatches silently persist (Vue hydration is check-only for classes).
- `website/backend/**` edits hot-sync via the running `convex dev`; `src/**` module/runtime edits need a `pnpm dev` restart to be safe (runtime stubs sometimes HMR, module.ts never does).
- `billing.api.listAllSubscriptions` is wrapped by `setupBilling` to return `null` for claimless callers (auth handshake / WS reconnect windows) instead of throwing — if "needs an active workspace" errors spam the Convex logs, that wrapper regressed.
