# Advanced example

Every [`nuxt-backend`](../../README.md) customization point, exercised in one
app. Start from [`examples/minimal`](../minimal/README.md) to see the
zero-config defaults; each file here changes exactly one thing from them.

## The customization map

| Customization | Where |
|---|---|
| **Customized app definition** — the scaffolded explicit `defineApp` with the `backendEnv` contract extended by an extra env var, the local `backend` component mounted, and `aggregate` left unmounted | `backend/convex.config.ts` |
| **Locally installed backend component** (the `backend` import points at the local definition) | `backend/components/backend/` |
| **Extended component schema** — an extra component-owned table beside the packaged auth/billing/AI/webhook tables | `backend/components/backend/schema.ts` |
| **Custom email templates** (OTP + invitation) without replacing the transport | `backend/auth.ts` → `integrations.emailTemplates` |
| **Custom invitation path** — emails link to `/join`, the built-in page is disabled | `backend/auth.ts` (`invitationPath`), `nuxt.config.ts` (`pages: { acceptInvitation: false }`), `app/pages/join.vue` |
| **Explicit billing config** instead of env-var defaults | `backend/billing.ts` (`accessToken` / `environment` / `webhookSecret`) |
| **Billing webhook hook** — `order.paid` writes to an app table, after the built-in refresh + gift fulfilment | `backend/billing.ts` (`events`) + `backend/schema.ts` |
| **Custom gift email** | `backend/billing.ts` (`giftEmail`) |
| **Custom webhook paths** (`/hooks/billing`, `/hooks/email`) | `backend/http.ts` |
| **Hand-rolled signup workflow** — `workflow.define` calling the component's email module directly, instead of `defineEmailSequence` | `backend/workflows.ts` |
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
