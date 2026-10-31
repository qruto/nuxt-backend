# Advanced example

Every [`nuxt-backend`](https://github.com/qruto/nuxt-backend#readme) customization point, exercised in one
app. Start from [`templates/starter`](https://github.com/qruto/nuxt-backend/tree/main/templates/starter) to see the
zero-config defaults; each file here changes exactly one thing from them.

## The customization map

| Customization | Where |
|---|---|
| **Customized app definition** — the scaffolded explicit `defineApp` with the `backendEnv` contract extended by an extra env var and `aggregate` left unmounted | `backend/convex.config.ts` |
| **Custom email templates** (OTP, invitation and gift) without replacing the transport | `backend/email.ts` → `templates` |
| **Custom invitation path** — emails link to `/join`, where the app's own page replaces the built-in one | `nuxt.config.ts` (`pages: { acceptInvitation: '/join' }`, carried to `backend/paths.generated.ts`), `app/pages/join.vue` |
| **Explicit billing config** instead of env-var defaults | `backend/billing.ts` (`accessToken` / `environment` / `webhookSecret`) |
| **Billing webhook hook** — `order.paid` writes to an app table, after the built-in refresh + gift fulfilment | `backend/billing.ts` (`events`) + `backend/schema.ts` |
| **Custom webhook paths** (`/hooks/billing`, `/hooks/email`) | `backend/http.ts` |
| **Hand-rolled signup workflow** — `workflow.define` calling the component's email module directly, instead of `defineEmailSequence`; like it, it reads the account again after the sleep, so a deleted account gets nothing and a changed address gets the email | `backend/workflows.ts` |
| **Gift claiming** — `useGifts()` + `<GiftClaimBanner>` button | `app/pages/app/index.vue` |
| **Translated UI** — `@nuxtjs/i18n` with English and French: `backend.*` messages translate the packaged pages and components, the sign-in page switches language, and the module's pages answer under `/fr/` too | `nuxt.config.ts` (`i18n`), `i18n/locales/fr.json`, `app/pages/login.vue` |

## Run it

Same flow as the starter (see its README for the env list).

```bash
pnpm create nuxt@latest my-app -t gh:qruto/nuxt-backend/examples/advanced
# or: npm create nuxt@latest my-app -- -t gh:qruto/nuxt-backend/examples/advanced
cd my-app
cp .env.example .env.local
npm run dev           # sets up a Convex dev deployment on the first run, then runs Convex and Nuxt
```
