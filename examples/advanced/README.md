# Advanced example

Every [`nuxt-backend`](../../README.md) customization point, exercised in one
app. Start from [`examples/minimal`](../minimal/README.md) to see the
zero-config defaults; each file here changes exactly one thing from them.

## The customization map

| Customization | Where |
|---|---|
| **Hand-written app definition** — `defineApp` + `backendEnv` spread + extra env var + `installBackend` with `omit: ['aggregate']` | `convex/convex.config.ts` |
| **Locally installed backend component** (swapped in via `components: { backend }`) | `convex/components/backend/` |
| **Extended component schema** — an extra component-owned table beside the packaged auth/billing/gift tables | `convex/components/backend/schema.ts` |
| **Custom email templates** (OTP + invitation) without replacing the transport | `convex/auth.ts` → `integrations.emailTemplates` |
| **Custom invitation path** — emails link to `/join`, the built-in page is disabled | `convex/auth.ts` (`invitationPath`), `nuxt.config.ts` (`invitationPage: false`), `app/pages/join.vue` |
| **Explicit billing config** instead of env-var defaults | `convex/billing.ts` (`accessToken` / `environment` / `webhookSecret`) |
| **Billing webhook hook** — `order.paid` writes to an app table, after the built-in refresh + gift fulfilment | `convex/billing.ts` (`events`) + `convex/schema.ts` |
| **Custom gift email** | `convex/billing.ts` (`giftEmail`) |
| **Custom webhook paths** (`/hooks/billing`, `/hooks/email`) | `convex/http.ts` |
| **Explicit gift claiming** — `useGifts({ autoClaim: false })` + `<GiftClaimBanner>` button | `app/pages/app/index.vue` |

## Run it

Same flow as the minimal example (see its README for the env list), plus:
the local component imports `@convex-dev/resend` directly, which is why it is
a direct dependency in `package.json`.

```bash
pnpm install
cd examples/advanced
cp .env.example .env.local
npx convex dev        # terminal 1
pnpm dev              # terminal 2
```
