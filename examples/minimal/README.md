# Minimal example

The out-of-the-box [`nuxt-backend`](../../README.md) setup. **Every file in
`backend/` is byte-identical to what `npx nuxt-backend init` generates** — the
only configuration is the deployment env vars, and in dev those are provisioned
for you. There is no custom backend code at all, yet the app has:

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

npx convex dev                     # terminal 1 — provisions a dev deployment + codegen
```

```bash
pnpm dev                           # terminal 2 — derives the Convex URLs and
                                   # provisions the dev deployment env for you
```

Sign in right away: with no `EMAIL_API_KEY` configured, the OTP code prints in
the `convex dev` console. Connect real services whenever you're ready:

```bash
echo 'EMAIL_API_KEY=re_...' >> .env.local        # + BILLING_ACCESS_TOKEN etc., see .env.example
npx nuxt-backend env push                        # sync them to the deployment
```

Want to customize templates, webhooks, the component schema, or the mounting
itself? See [`examples/advanced`](../advanced/README.md).
