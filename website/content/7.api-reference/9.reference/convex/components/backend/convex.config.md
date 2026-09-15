---
navigation: true
---

# convex/components/backend/convex.config

## Variables

### default

```ts
const default: ComponentDefinition<any, {
  EMAIL_API_KEY: VString<string | undefined, "optional">;
  EMAIL_FROM: VString<string | undefined, "optional">;
  EMAIL_TEST_MODE: VString<string | undefined, "optional">;
  EMAIL_WEBHOOK_SECRET: VString<string | undefined, "optional">;
}>;
```

Defined in: [src/convex/components/backend/convex.config.ts:37](https://github.com/qruto/nuxt-backend/blob/main/src/convex/components/backend/convex.config.ts#L37)

The all-in-one `backend` Convex component: auth tables + adapter, transactional
email (with the Resend component nested inside), the billing entitlement cache,
and gift purchases — one mount, one dashboard entry.

Auth — we intentionally do NOT mount `@convex-dev/better-auth/convex.config`.
The upstream component would surface as a separate `backend/betterAuth` entry
in the Convex dashboard and would never receive writes — our own `schema.ts` +
`adapter.ts` own all auth tables (the "hybrid component" pattern documented at
https://docs.convex.dev/components/authoring). The `@convex-dev/better-auth`
runtime is consumed as plain code only (via `createApi` etc.).

Email — the Resend component is nested as a child so transactional email
(auth OTP, verification, welcome, invitations, gift notifications) ships out
of the box; the consumer only mounts `backend` and sets `EMAIL_API_KEY`. The
Resend client runs in `backend`'s own functions (see `email.ts`), so it stays
encapsulated behind this component's API.

Billing — only the entitlement cache + gift records live here. The Polar
component operates over the app's auth + HTTP routes and can't be nested, so
it mounts at the app level (the scaffolded root `convex.config.ts` does
this — see `DEFAULT_CONVEX_CONFIG` in `src/templates.ts`).

Components are isolated from the app's environment variables, so `backend`
declares the email config it needs here; the mounting app forwards the
deployment's values by reference via `app.use(backend, { env: {...} })`
(the scaffolded `convex.config.ts` does this). The component reads them
type-safely through
the generated `env` export (see `email.ts`). All optional — a deploy
succeeds without them and email degrades in a designed way (sends no-op,
OTP throws loudly, webhooks rejected) until `EMAIL_API_KEY` is set.
