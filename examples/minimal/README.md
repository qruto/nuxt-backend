# Minimal example

The out-of-the-box [`nuxt-backend`](../../README.md) setup. **Every file in
`backend/` is byte-identical to what `npx nuxt-backend init` generates** — the
only configuration is the required deployment env vars. There is no custom
backend code at all, yet the app has:

- Passwordless sign-in (`<AuthForm>`, passkeys + email OTP)
- Workspaces with **emailed invitations** — the accept page at
  `/accept-invitation` is registered by the module automatically
- Subscriptions + feature gating (`useBilling`, `<FeatureBoundary>`)
- Prepaid credits with top-ups (`useCredits`)
- **Gifts** — buy credits for someone else's email; they receive them
  automatically on sign-in (`<GiftClaimBanner>`, `useGifts`)
- Transactional + delivery-tracked email under the hood (auth OTP,
  invitations, gift notifications)

## Run it

```bash
pnpm install                       # from the repo root
cd examples/minimal
cp .env.example .env.local         # fill in after `convex dev` prints the URLs

npx convex dev                     # terminal 1 — provisions a dev deployment + codegen
```

Set the required env (a deploy fails until all are set):

```bash
npx convex env set AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
npx convex env set EMAIL_API_KEY re_...          # + EMAIL_FROM, EMAIL_TEST_MODE, EMAIL_WEBHOOK_SECRET
npx convex env set BILLING_ACCESS_TOKEN oat_...  # + BILLING_WEBHOOK_SECRET, BILLING_ENVIRONMENT=sandbox
```

```bash
pnpm dev                           # terminal 2
```

Want to customize templates, webhooks, the component schema, or the mounting
itself? See [`examples/advanced`](../advanced/README.md).
