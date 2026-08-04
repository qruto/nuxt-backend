---
navigation: true
---

# convex/app

## Interfaces

### InstallBackendOptions

Defined in: [nuxt-backend/src/convex/app.ts:70](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L70)

Customization for [installBackend](#installbackend) / [defineBackendApp](#definebackendapp). The
defaults mount everything — pass options only to trim or swap components.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="omit"></a> `omit?` | (`"polar"` \| `"aggregate"` \| `"migrations"` \| `"rateLimiter"` \| `"workflow"`)[] | Skip mounting these upstream components. `backend` is the package's all-in-one core and cannot be omitted. **Example** ``defineBackendApp({ omit: ['aggregate', 'workflow'] })`` | [nuxt-backend/src/convex/app.ts:77](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L77) |
| <a id="components"></a> `components?` | `Partial`\<`Record`\<[`BackendComponentName`](#backendcomponentname), `ComponentDefinition`\<`any`, `any`\>\>\> | Replace a bundled component definition with your own — e.g. a locally installed `backend` component (see the local-installation guide) or a fork of an upstream component. Anything not listed uses the bundled definition. **Example** `import backend from './components/backend/convex.config' export default defineBackendApp({ components: { backend } })` | [nuxt-backend/src/convex/app.ts:89](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L89) |

## Type Aliases

### BackendComponentName

```ts
type BackendComponentName = 
  | "backend"
  | "aggregate"
  | "migrations"
  | "polar"
  | "rateLimiter"
  | "workflow";
```

Defined in: [nuxt-backend/src/convex/app.ts:63](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L63)

Every component [installBackend](#installbackend) mounts, by its dashboard name.

Package-owned: `backend` — the all-in-one component (auth tables + adapter,
transactional email with the provider component nested inside, the billing
entitlement cache, and gift purchases).
Upstream `@convex-dev/*`: `aggregate`, `migrations`, `polar`, `rateLimiter`,
`workflow` — these operate over the app's auth/HTTP surface and can't be
nested inside `backend`.

## Variables

### backendEnv

```ts
const backendEnv: {
  AUTH_SECRET: VString<string, "required">;
  SITE_URL: VString<string, "required">;
  EMAIL_API_KEY: VString<string, "required">;
  EMAIL_FROM: VString<string, "required">;
  EMAIL_TEST_MODE: VString<string, "required">;
  EMAIL_WEBHOOK_SECRET: VString<string, "required">;
  BILLING_ACCESS_TOKEN: VString<string, "required">;
  BILLING_WEBHOOK_SECRET: VString<string, "required">;
  BILLING_ENVIRONMENT: VUnion<"sandbox" | "production", [VLiteral<"sandbox", "required">, VLiteral<"production", "required">], "required", never>;
};
```

Defined in: [nuxt-backend/src/convex/app.ts:32](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L32)

Environment variables the backend reads. All required — a deploy fails until
auth, email, and billing are configured, so misconfiguration surfaces at push
time instead of as silent no-ops in production.

The names are service-neutral on purpose: the package hides its underlying
providers behind the general capability (auth, email, billing).

`defineBackendApp` declares these for you. For a hand-written `defineApp`,
pass them yourself — `installBackend` reads `app.env.EMAIL_*` to forward the
email config, and the env proxy throws on undeclared vars:
`defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })`.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-auth_secret"></a> `AUTH_SECRET` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:34](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L34) |
| <a id="property-site_url"></a> `SITE_URL` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L35) |
| <a id="property-email_api_key"></a> `EMAIL_API_KEY` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:37](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L37) |
| <a id="property-email_from"></a> `EMAIL_FROM` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:38](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L38) |
| <a id="property-email_test_mode"></a> `EMAIL_TEST_MODE` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:39](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L39) |
| <a id="property-email_webhook_secret"></a> `EMAIL_WEBHOOK_SECRET` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:40](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L40) |
| <a id="property-billing_access_token"></a> `BILLING_ACCESS_TOKEN` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:42](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L42) |
| <a id="property-billing_webhook_secret"></a> `BILLING_WEBHOOK_SECRET` | `VString`\<`string`, `"required"`\> | [nuxt-backend/src/convex/app.ts:43](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L43) |
| <a id="property-billing_environment"></a> `BILLING_ENVIRONMENT` | `VUnion`\<`"sandbox"` \| `"production"`, \[`VLiteral`\<`"sandbox"`, `"required"`\>, `VLiteral`\<`"production"`, `"required"`\>\], `"required"`, `never`\> | [nuxt-backend/src/convex/app.ts:44](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L44) |

## Functions

### installBackend()

```ts
function installBackend<App>(app, options?): App;
```

Defined in: [nuxt-backend/src/convex/app.ts:115](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L115)

Mount the all-in-one `backend` component plus the upstream components onto
your app definition and forward the email env to `backend` — the whole
`convex.config.ts` wiring in one call. Prefer [defineBackendApp](#definebackendapp) unless
you need a hand-written `defineApp` (extra env declarations, custom
components).

The component definitions are imported by this module, so your
`convex.config.ts` needs no component imports at all. Returns the app, so
you keep full control — mount your own components afterwards.

#### Type Parameters

| Type Parameter |
| ------ |
| `App` *extends* `BackendApp` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `app` | `App` |
| `options` | [`InstallBackendOptions`](#installbackendoptions) |

#### Returns

`App`

#### Example

**A hand-written \`convex.config.ts\`:**

```ts
import { defineApp } from 'convex/server'
import { backendEnv, installBackend } from 'nuxt-backend/convex/app'
import { v } from 'convex/values'

const app = defineApp({ env: { ...backendEnv, STRIPE_SECRET_KEY: v.optional(v.string()) } })
installBackend(app)
app.use(myOwnComponent)
export default app
```

***

### defineBackendApp()

```ts
function defineBackendApp<Env>(options?): AppDefinition<{
  AUTH_SECRET: VString<string, "required">;
  SITE_URL: VString<string, "required">;
  EMAIL_API_KEY: VString<string, "required">;
  EMAIL_FROM: VString<string, "required">;
  EMAIL_TEST_MODE: VString<string, "required">;
  EMAIL_WEBHOOK_SECRET: VString<string, "required">;
  BILLING_ACCESS_TOKEN: VString<string, "required">;
  BILLING_WEBHOOK_SECRET: VString<string, "required">;
  BILLING_ENVIRONMENT: VUnion<"sandbox" | "production", [VLiteral<"sandbox", "required">, VLiteral<"production", "required">], "required", never>;
} & Env>;
```

Defined in: [nuxt-backend/src/convex/app.ts:172](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/app.ts#L172)

One-call Convex app definition: declares the standard [backendEnv](#backendenv)
variables and mounts the all-in-one `backend` component (auth + email +
billing + gifts) plus the upstream components (`aggregate`, `migrations`,
`polar`, `rateLimiter`, `workflow`). The entire `convex.config.ts` is two
lines.

Returns the `app`, so you keep full control: mount your own components or
read env refs afterwards.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Env` *extends* `EnvDefinition` | `Record`\<`never`, `never`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`InstallBackendOptions`](#installbackendoptions) & \{ `env?`: `Env`; \} |

#### Returns

`AppDefinition`\<\{
  `AUTH_SECRET`: `VString`\<`string`, `"required"`\>;
  `SITE_URL`: `VString`\<`string`, `"required"`\>;
  `EMAIL_API_KEY`: `VString`\<`string`, `"required"`\>;
  `EMAIL_FROM`: `VString`\<`string`, `"required"`\>;
  `EMAIL_TEST_MODE`: `VString`\<`string`, `"required"`\>;
  `EMAIL_WEBHOOK_SECRET`: `VString`\<`string`, `"required"`\>;
  `BILLING_ACCESS_TOKEN`: `VString`\<`string`, `"required"`\>;
  `BILLING_WEBHOOK_SECRET`: `VString`\<`string`, `"required"`\>;
  `BILLING_ENVIRONMENT`: `VUnion`\<`"sandbox"` \| `"production"`, \[`VLiteral`\<`"sandbox"`, `"required"`\>, `VLiteral`\<`"production"`, `"required"`\>\], `"required"`, `never`\>;
\} & `Env`\>

#### Examples

**The entire \`convex.config.ts\`:**

```ts
import { defineBackendApp } from 'nuxt-backend/convex/app'
export default defineBackendApp()
```

**Trim, extend, and add your own:**

```ts
import { defineBackendApp } from 'nuxt-backend/convex/app'
import { v } from 'convex/values'
import myOwnComponent from './components/mine/convex.config'

const app = defineBackendApp({
  omit: ['aggregate'],
  env: { STRIPE_SECRET_KEY: v.optional(v.string()) },
})
app.use(myOwnComponent)
export default app
```
