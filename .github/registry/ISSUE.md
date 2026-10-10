<!--
The nuxt/modules "Module Listing Request" issue form, field by field.
Title: [Module Listing Request]: `nuxt-backend`
https://github.com/nuxt/modules/issues/new?template=module_request.yml
-->

### Description

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

Docs: https://nuxt-backend.dev (live playground at /playground). MIT, signed releases with npm
provenance. I maintain it; the entry for `modules/` is ready to copy if a pull request is easier
for you: https://github.com/qruto/nuxt-backend/blob/main/.github/registry/backend.yml

### Repository

https://github.com/qruto/nuxt-backend

### npm

https://www.npmjs.com/package/nuxt-backend

### Nuxt Compatibility

Nuxt 4 (`^4.1.0`), Node >= 24.11, Convex >= 1.46.
