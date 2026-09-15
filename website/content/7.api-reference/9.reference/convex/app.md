---
navigation: true
---

# convex/app

## Type Aliases

### BackendEnv

```ts
type BackendEnv = typeof backendEnv;
```

Defined in: [src/convex/app.ts:66](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L66)

The env declaration the scaffolded `convex.config.ts` passes to `defineApp`.

## Variables

### backendEnv

```ts
const backendEnv: {
  AUTH_SECRET: VString<string, "required">;
  SITE_URL: VString<string, "required">;
  AUTH_TRUST_LOCAL_ORIGINS: VString<string | undefined, "optional">;
  EMAIL_API_KEY: VString<string | undefined, "optional">;
  EMAIL_FROM: VString<string | undefined, "optional">;
  EMAIL_TEST_MODE: VString<string | undefined, "optional">;
  EMAIL_WEBHOOK_SECRET: VString<string | undefined, "optional">;
  BILLING_ACCESS_TOKEN: VString<string | undefined, "optional">;
  BILLING_WEBHOOK_SECRET: VString<string | undefined, "optional">;
  BILLING_ENVIRONMENT: VUnion<"sandbox" | "production" | undefined, [VLiteral<"sandbox", "required">, VLiteral<"production", "required">], "optional", never>;
};
```

Defined in: [src/convex/app.ts:46](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L46)

Environment variables the backend reads, in two tiers.

Required — a deploy fails until they are set (misconfiguration of the
security-critical pair must surface at push time, never at runtime):
`AUTH_SECRET` (session/JWT signing) and `SITE_URL` (the app origin — auth
base URL and every emailed link).

Optional — the deploy succeeds and the feature degrades in a designed,
observable way until configured (`nuxt-backend doctor` reports each):
- `EMAIL_API_KEY` — sends no-op with a console warn; OTP sign-in throws
  loudly (set `NUXT_BACKEND_LOG_OTP=1` to echo codes to the dev console).
- `EMAIL_FROM` — falls back to the provider's onboarding sender.
- `EMAIL_TEST_MODE` — defaults to ON (anything but `'false'`).
- `EMAIL_WEBHOOK_SECRET` — delivery events are rejected until set.
- `BILLING_ACCESS_TOKEN` — billing queries return empty; checkout and other
  billing actions fail on invocation.
- `BILLING_WEBHOOK_SECRET` — billing events are rejected until set
  (`syncEntitlements` remains the on-demand fallback).
- `BILLING_ENVIRONMENT` — defaults to `'sandbox'`.

The names are service-neutral on purpose: the package hides its underlying
providers behind the general capability (auth, email, billing).

The scaffolded `convex.config.ts` declares these with
`defineApp({ env: backendEnv })` and forwards the `EMAIL_*` refs to the
`backend` component. Extend the set for your own vars (the env proxy
throws on undeclared ones):
`defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })`.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-auth_secret"></a> `AUTH_SECRET` | `VString`\<`string`, `"required"`\> | [src/convex/app.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L48) |
| <a id="property-site_url"></a> `SITE_URL` | `VString`\<`string`, `"required"`\> | [src/convex/app.ts:49](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L49) |
| <a id="property-auth_trust_local_origins"></a> `AUTH_TRUST_LOCAL_ORIGINS` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:53](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L53) |
| <a id="property-email_api_key"></a> `EMAIL_API_KEY` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L55) |
| <a id="property-email_from"></a> `EMAIL_FROM` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:56](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L56) |
| <a id="property-email_test_mode"></a> `EMAIL_TEST_MODE` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L57) |
| <a id="property-email_webhook_secret"></a> `EMAIL_WEBHOOK_SECRET` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:58](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L58) |
| <a id="property-billing_access_token"></a> `BILLING_ACCESS_TOKEN` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:60](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L60) |
| <a id="property-billing_webhook_secret"></a> `BILLING_WEBHOOK_SECRET` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L61) |
| <a id="property-billing_environment"></a> `BILLING_ENVIRONMENT` | `VUnion`\<`"sandbox"` \| `"production"` \| `undefined`, \[`VLiteral`\<`"sandbox"`, `"required"`\>, `VLiteral`\<`"production"`, `"required"`\>\], `"optional"`, `never`\> | [src/convex/app.ts:62](https://github.com/qruto/nuxt-backend/blob/main/src/convex/app.ts#L62) |
