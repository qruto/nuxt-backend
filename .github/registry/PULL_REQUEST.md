# feat: add nuxt-backend

`nuxt-backend` is an all-in-one SaaS backend for Nuxt on Convex: one module, one Convex component,
scaffolded into the app by `npx nuxt-backend init`.

What it ships, enabled out of the box: passwordless auth (email OTP + passkeys, no passwords, no
social providers), workspaces with emailed invitations, subscriptions with feature gating, prepaid
credits with top-ups and gifts (provider-native meters, no local ledger), transactional email with
delivery tracking, fail-closed webhooks for both providers, metered AI actions and streaming, an
OAuth-protected MCP server so agents act as a signed-in user, a `doctor` command that checks the
project and the deployment, and a Nuxt DevTools tab. Every public name is brand-neutral
(`nuxt-backend/billing`, `useCredits`, `<PricingTable>`); the providers underneath are Convex,
Better Auth, Polar and Resend.

- Docs: https://nuxt-backend.dev (live playground at /playground)
- Repository: https://github.com/qruto/nuxt-backend — MIT, signed releases with npm provenance
- Compatibility: Nuxt >= 4.1, Node >= 24.11, Convex >= 1.43
- First stable release: 0.2.0 (`0.1.0` was a test publish and is deprecated)

I maintain it and will keep the entry current.
