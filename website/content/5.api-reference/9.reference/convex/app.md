---
navigation: true
---

# convex/app

## Interfaces

### BackendComponents

Defined in: [src/convex/app.ts:42](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L42)

The bundled component definitions, imported in your `convex.config.ts` and
handed to [installBackend](#installbackend).

Convex builds its component tree from the `import … from '…/convex.config'`
statements in your **app's** `convex.config.ts`, so those imports must live
there — but the wiring (env declaration, the email env-forwarding to the
nested Resend component, and the `app.use(...)` calls) is all done for you.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="backend"></a> `backend` | `ComponentDefinition` | `nuxt-backend/convex/component/convex.config` (Better Auth + nested Resend). | [src/convex/app.ts:44](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L44) |
| <a id="aggregate"></a> `aggregate` | `ComponentDefinition` | `@convex-dev/aggregate/convex.config`. | [src/convex/app.ts:46](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L46) |
| <a id="migrations"></a> `migrations` | `ComponentDefinition` | `@convex-dev/migrations/convex.config`. | [src/convex/app.ts:48](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L48) |
| <a id="polar"></a> `polar` | `ComponentDefinition` | `@convex-dev/polar/convex.config`. | [src/convex/app.ts:50](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L50) |
| <a id="ratelimiter"></a> `rateLimiter` | `ComponentDefinition` | `@convex-dev/rate-limiter/convex.config`. | [src/convex/app.ts:52](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L52) |
| <a id="workflow"></a> `workflow` | `ComponentDefinition` | `@convex-dev/workflow/convex.config`. | [src/convex/app.ts:54](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L54) |

## Variables

### backendEnv

```ts
const backendEnv: {
  BETTER_AUTH_SECRET: VString<string | undefined, "optional">;
  SITE_URL: VString<string | undefined, "optional">;
  RESEND_API_KEY: VString<string | undefined, "optional">;
  RESEND_FROM: VString<string | undefined, "optional">;
  RESEND_TEST_MODE: VString<string | undefined, "optional">;
  RESEND_WEBHOOK_SECRET: VString<string | undefined, "optional">;
  POLAR_ORGANIZATION_TOKEN: VString<string | undefined, "optional">;
  POLAR_WEBHOOK_SECRET: VString<string | undefined, "optional">;
  POLAR_SERVER: VUnion<"sandbox" | "production" | undefined, [VLiteral<"sandbox", "required">, VLiteral<"production", "required">], "optional", never>;
};
```

Defined in: [src/convex/app.ts:12](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L12)

Environment variables the bundled components read. All optional, so a deploy
validates while unconfigured features stay graceful no-ops (billing returns
`null`, email logs instead of sending, …).

Pass these straight to `defineApp({ env: backendEnv })`. Spread in your own to
extend: `defineApp({ env: { ...backendEnv, MY_VAR: v.optional(v.string()) } })`.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-better_auth_secret"></a> `BETTER_AUTH_SECRET` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:14](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L14) |
| <a id="property-site_url"></a> `SITE_URL` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L15) |
| <a id="property-resend_api_key"></a> `RESEND_API_KEY` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L17) |
| <a id="property-resend_from"></a> `RESEND_FROM` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:18](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L18) |
| <a id="property-resend_test_mode"></a> `RESEND_TEST_MODE` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L19) |
| <a id="property-resend_webhook_secret"></a> `RESEND_WEBHOOK_SECRET` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:20](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L20) |
| <a id="property-polar_organization_token"></a> `POLAR_ORGANIZATION_TOKEN` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:22](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L22) |
| <a id="property-polar_webhook_secret"></a> `POLAR_WEBHOOK_SECRET` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/app.ts:23](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L23) |
| <a id="property-polar_server"></a> `POLAR_SERVER` | `VUnion`\<`"sandbox"` \| `"production"` \| `undefined`, \[`VLiteral`\<`"sandbox"`, `"required"`\>, `VLiteral`\<`"production"`, `"required"`\>\], `"optional"`, `never`\> | [src/convex/app.ts:24](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L24) |

## Functions

### installBackend()

```ts
function installBackend<App>(app, components): App;
```

Defined in: [src/convex/app.ts:91](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L91)

Mount every bundled component onto your app definition and forward the email
env to the nested Resend component — the whole `convex.config.ts` wiring in one
call.

You import the component definitions in your `convex.config.ts` (Convex
resolves its component tree from those imports) and pass them in; everything
else is handled. Returns the app, so you keep full control — mount your own
components or read env refs afterwards.

#### Type Parameters

| Type Parameter |
| ------ |
| `App` *extends* `BackendApp` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `app` | `App` |
| `components` | [`BackendComponents`](#backendcomponents) |

#### Returns

`App`

#### Examples

**The entire \`convex.config.ts\`:**

```ts
import { defineApp } from 'convex/server'
import { backendEnv, installBackend } from 'nuxt-backend/convex/app'
import backend from 'nuxt-backend/convex/component/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

const app = defineApp({ env: backendEnv })
installBackend(app, { backend, aggregate, migrations, polar, rateLimiter, workflow })
export default app
```

**Full control — extra env and your own components:**

```ts
const app = defineApp({ env: { ...backendEnv, STRIPE_SECRET_KEY: v.optional(v.string()) } })
installBackend(app, { backend, aggregate, migrations, polar, rateLimiter, workflow })
app.use(myOwnComponent)
export default app
```

***

### defineBackendApp()

```ts
function defineBackendApp<Env>(components, options?): AppDefinition<{
  BETTER_AUTH_SECRET: VString<string | undefined, "optional">;
  SITE_URL: VString<string | undefined, "optional">;
  RESEND_API_KEY: VString<string | undefined, "optional">;
  RESEND_FROM: VString<string | undefined, "optional">;
  RESEND_TEST_MODE: VString<string | undefined, "optional">;
  RESEND_WEBHOOK_SECRET: VString<string | undefined, "optional">;
  POLAR_ORGANIZATION_TOKEN: VString<string | undefined, "optional">;
  POLAR_WEBHOOK_SECRET: VString<string | undefined, "optional">;
  POLAR_SERVER: VUnion<"sandbox" | "production" | undefined, [VLiteral<"sandbox", "required">, VLiteral<"production", "required">], "optional", never>;
} & Env>;
```

Defined in: [src/convex/app.ts:137](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/app.ts#L137)

One-call Convex app definition: declares the standard [backendEnv](#backendenv)
variables and mounts every bundled component. The cleanest `convex.config.ts`
— import the component definitions (Convex resolves its component tree from
those imports) and hand them over.

Returns the `app`, so you keep full control: mount your own components or read
env refs afterwards.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Env` *extends* `EnvDefinition` | `Record`\<`never`, `never`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`BackendComponents`](#backendcomponents) |
| `options?` | \{ `env?`: `Env`; \} |
| `options.env?` | `Env` |

#### Returns

`AppDefinition`\<\{
  `BETTER_AUTH_SECRET`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `SITE_URL`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `RESEND_API_KEY`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `RESEND_FROM`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `RESEND_TEST_MODE`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `RESEND_WEBHOOK_SECRET`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `POLAR_ORGANIZATION_TOKEN`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `POLAR_WEBHOOK_SECRET`: `VString`\<`string` \| `undefined`, `"optional"`\>;
  `POLAR_SERVER`: `VUnion`\<`"sandbox"` \| `"production"` \| `undefined`, \[`VLiteral`\<`"sandbox"`, `"required"`\>, `VLiteral`\<`"production"`, `"required"`\>\], `"optional"`, `never`\>;
\} & `Env`\>

#### Examples

**The entire \`convex.config.ts\`:**

```ts
import { defineBackendApp } from 'nuxt-backend/convex/app'
import backend from 'nuxt-backend/convex/component/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import polar from '@convex-dev/polar/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'

export default defineBackendApp({ backend, aggregate, migrations, polar, rateLimiter, workflow })
```

**Full control — extra env and your own components:**

```ts
const app = defineBackendApp(components, { env: { STRIPE_SECRET_KEY: v.optional(v.string()) } })
app.use(myOwnComponent)
export default app
```
