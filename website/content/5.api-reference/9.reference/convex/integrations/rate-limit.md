---
navigation: true
---

# convex/integrations/rate-limit

## Type Aliases

### RateLimitConfig

```ts
type RateLimitConfig = 
  | Infer<typeof tokenBucketValidator>
| Infer<typeof fixedWindowValidator>;
```

Defined in: node\_modules/@convex-dev/rate-limiter/dist/shared.d.ts:106

One of the supported rate limits.
See tokenBucketValidator and fixedWindowValidator for more
information.

## Variables

### SECOND

```ts
const SECOND: 1000 = 1000;
```

Defined in: node\_modules/@convex-dev/rate-limiter/dist/client/index.d.ts:6

***

### MINUTE

```ts
const MINUTE: number;
```

Defined in: node\_modules/@convex-dev/rate-limiter/dist/client/index.d.ts:7

***

### HOUR

```ts
const HOUR: number;
```

Defined in: node\_modules/@convex-dev/rate-limiter/dist/client/index.d.ts:8

***

### DEFAULT\_AUTH\_LIMITS

```ts
const DEFAULT_AUTH_LIMITS: {
  emailOtp: {
     kind: "token bucket";
     rate: 5;
     period: number;
     capacity: 5;
  };
  signIn: {
     kind: "token bucket";
     rate: 10;
     period: number;
     capacity: 10;
  };
  signUp: {
     kind: "fixed window";
     rate: 20;
     period: number;
  };
  passwordReset: {
     kind: "token bucket";
     rate: 5;
     period: number;
     capacity: 5;
  };
};
```

Defined in: [src/convex/integrations/rate-limit.ts:13](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L13)

Conservative default rate limits guarding auth-sensitive flows. Each is keyed
per email/IP at the call site (e.g. `limit(ctx, 'emailOtp', { key: email })`).
Extend or override any of them by passing your own limits to
[setupRateLimiter](#setupratelimiter).

#### Type Declaration

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-emailotp"></a> `emailOtp` | \{ `kind`: `"token bucket"`; `rate`: `5`; `period`: `number`; `capacity`: `5`; \} | - | Email OTP / verification sends — 5 per minute, small burst allowance. | [src/convex/integrations/rate-limit.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L15) |
| `emailOtp.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L15) |
| `emailOtp.rate` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L15) |
| `emailOtp.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L15) |
| `emailOtp.capacity` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L15) |
| <a id="property-signin"></a> `signIn` | \{ `kind`: `"token bucket"`; `rate`: `10`; `period`: `number`; `capacity`: `10`; \} | - | Sign-in attempts — 10 per minute. | [src/convex/integrations/rate-limit.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L17) |
| `signIn.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L17) |
| `signIn.rate` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L17) |
| `signIn.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L17) |
| `signIn.capacity` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L17) |
| <a id="property-signup"></a> `signUp` | \{ `kind`: `"fixed window"`; `rate`: `20`; `period`: `number`; \} | - | New account creation — 20 per hour (global / per-key fixed window). | [src/convex/integrations/rate-limit.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L19) |
| `signUp.kind` | `"fixed window"` | `'fixed window'` | - | [src/convex/integrations/rate-limit.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L19) |
| `signUp.rate` | `20` | `20` | - | [src/convex/integrations/rate-limit.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L19) |
| `signUp.period` | `number` | `HOUR` | - | [src/convex/integrations/rate-limit.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L19) |
| <a id="property-passwordreset"></a> `passwordReset` | \{ `kind`: `"token bucket"`; `rate`: `5`; `period`: `number`; `capacity`: `5`; \} | - | Password reset requests — 5 per 5 minutes. | [src/convex/integrations/rate-limit.ts:21](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L21) |
| `passwordReset.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:21](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L21) |
| `passwordReset.rate` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:21](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L21) |
| `passwordReset.period` | `number` | - | - | [src/convex/integrations/rate-limit.ts:21](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L21) |
| `passwordReset.capacity` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:21](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L21) |

## Functions

### setupRateLimiter()

```ts
function setupRateLimiter<Limits>(component, limits?): RateLimiter<{
  emailOtp: {
     kind: "token bucket";
     rate: 5;
     period: number;
     capacity: 5;
  };
  signIn: {
     kind: "token bucket";
     rate: 10;
     period: number;
     capacity: 10;
  };
  signUp: {
     kind: "fixed window";
     rate: 20;
     period: number;
  };
  passwordReset: {
     kind: "token bucket";
     rate: 5;
     period: number;
     capacity: 5;
  };
} & Limits>;
```

Defined in: [src/convex/integrations/rate-limit.ts:41](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/rate-limit.ts#L41)

Configure the [Rate Limiter](https://www.convex.dev/components/rate-limiter) component, pre-seeded with [DEFAULT\_AUTH\_LIMITS](#default_auth_limits). Pass extra
named limits to cover your own application functions; they are merged with
(and can override) the auth defaults.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Limits` *extends* `Record`\<`string`, [`RateLimitConfig`](#ratelimitconfig)\> | `Record`\<`never`, `never`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `component` | `ComponentApi` |
| `limits?` | `Limits` |

#### Returns

`RateLimiter`\<\{
  `emailOtp`: \{
     `kind`: `"token bucket"`;
     `rate`: `5`;
     `period`: `number`;
     `capacity`: `5`;
  \};
  `signIn`: \{
     `kind`: `"token bucket"`;
     `rate`: `10`;
     `period`: `number`;
     `capacity`: `10`;
  \};
  `signUp`: \{
     `kind`: `"fixed window"`;
     `rate`: `20`;
     `period`: `number`;
  \};
  `passwordReset`: \{
     `kind`: `"token bucket"`;
     `rate`: `5`;
     `period`: `number`;
     `capacity`: `5`;
  \};
\} & `Limits`\>

#### Example

```ts
import { setupRateLimiter } from 'nuxt-backend/convex/rate-limit'
import { components } from './_generated/api'
import { MINUTE } from '@convex-dev/rate-limiter'

export const rateLimiter = setupRateLimiter(components.rateLimiter, {
  sendMessage: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
})
```
