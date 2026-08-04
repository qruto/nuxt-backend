---
navigation: true
---

# convex/integrations/rate-limit

## Interfaces

### RateLimiterComponents

Defined in: [nuxt-backend/src/convex/integrations/rate-limit.ts:11](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L11)

The component handle `setupRateLimiter` reads from your generated
`components` object (the key is picked structurally — pass the whole object).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="ratelimiter"></a> `rateLimiter` | `ComponentApi` | [nuxt-backend/src/convex/integrations/rate-limit.ts:12](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L12) |

## Type Aliases

### RateLimitConfig

```ts
type RateLimitConfig = 
  | Infer<typeof tokenBucketValidator>
| Infer<typeof fixedWindowValidator>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/rate-limiter/dist/shared.d.ts:106

One of the supported rate limits.
See tokenBucketValidator and fixedWindowValidator for more
information.

## Variables

### SECOND

```ts
const SECOND: 1000 = 1000;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/rate-limiter/dist/client/index.d.ts:6

***

### MINUTE

```ts
const MINUTE: number;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/rate-limiter/dist/client/index.d.ts:7

***

### HOUR

```ts
const HOUR: number;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/rate-limiter/dist/client/index.d.ts:8

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
  billingSync: {
     kind: "token bucket";
     rate: 10;
     period: number;
     capacity: 5;
  };
};
```

Defined in: [nuxt-backend/src/convex/integrations/rate-limit.ts:21](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L21)

Conservative default rate limits guarding sensitive flows. Each is keyed per
email/entity at the call site (e.g. `limit(ctx, 'emailOtp', { key: email })`).
Extend or override any of them by passing your own limits to
[setupRateLimiter](#setupratelimiter).

#### Type Declaration

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-emailotp"></a> `emailOtp` | \{ `kind`: `"token bucket"`; `rate`: `5`; `period`: `number`; `capacity`: `5`; \} | - | Email OTP / verification sends — 5 per minute, small burst allowance. | [nuxt-backend/src/convex/integrations/rate-limit.ts:23](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L23) |
| `emailOtp.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:23](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L23) |
| `emailOtp.rate` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:23](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L23) |
| `emailOtp.period` | `number` | `MINUTE` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:23](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L23) |
| `emailOtp.capacity` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:23](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L23) |
| <a id="property-signin"></a> `signIn` | \{ `kind`: `"token bucket"`; `rate`: `10`; `period`: `number`; `capacity`: `10`; \} | - | Sign-in attempts — 10 per minute. | [nuxt-backend/src/convex/integrations/rate-limit.ts:25](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L25) |
| `signIn.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:25](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L25) |
| `signIn.rate` | `10` | `10` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:25](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L25) |
| `signIn.period` | `number` | `MINUTE` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:25](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L25) |
| `signIn.capacity` | `10` | `10` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:25](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L25) |
| <a id="property-signup"></a> `signUp` | \{ `kind`: `"fixed window"`; `rate`: `20`; `period`: `number`; \} | - | New account creation — 20 per hour (global / per-key fixed window). | [nuxt-backend/src/convex/integrations/rate-limit.ts:27](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L27) |
| `signUp.kind` | `"fixed window"` | `'fixed window'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:27](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L27) |
| `signUp.rate` | `20` | `20` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:27](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L27) |
| `signUp.period` | `number` | `HOUR` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:27](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L27) |
| <a id="property-passwordreset"></a> `passwordReset` | \{ `kind`: `"token bucket"`; `rate`: `5`; `period`: `number`; `capacity`: `5`; \} | - | Password reset requests — 5 per 5 minutes. | [nuxt-backend/src/convex/integrations/rate-limit.ts:29](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L29) |
| `passwordReset.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:29](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L29) |
| `passwordReset.rate` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:29](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L29) |
| `passwordReset.period` | `number` | - | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:29](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L29) |
| `passwordReset.capacity` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:29](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L29) |
| <a id="property-billingsync"></a> `billingSync` | \{ `kind`: `"token bucket"`; `rate`: `10`; `period`: `number`; `capacity`: `5`; \} | - | Entitlement syncs — 10 per minute per billing entity, small burst for the back-to-back syncs after checkout / top-up. Guards the N+1 live Polar fan-out `syncEntitlements` performs (see `setupBilling`'s `rateLimiter`). | [nuxt-backend/src/convex/integrations/rate-limit.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L35) |
| `billingSync.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L35) |
| `billingSync.rate` | `10` | `10` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L35) |
| `billingSync.period` | `number` | `MINUTE` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L35) |
| `billingSync.capacity` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:35](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L35) |

## Functions

### setupRateLimiter()

```ts
function setupRateLimiter<Limits>(components, limits?): RateLimiter<{
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
  billingSync: {
     kind: "token bucket";
     rate: 10;
     period: number;
     capacity: 5;
  };
} & Limits>;
```

Defined in: [nuxt-backend/src/convex/integrations/rate-limit.ts:55](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/rate-limit.ts#L55)

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
| `components` | [`RateLimiterComponents`](#ratelimitercomponents) |
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
  `billingSync`: \{
     `kind`: `"token bucket"`;
     `rate`: `10`;
     `period`: `number`;
     `capacity`: `5`;
  \};
\} & `Limits`\>

#### Example

```ts
import { setupRateLimiter } from 'nuxt-backend/convex/rate-limit'
import { components } from './_generated/api'
import { MINUTE } from '@convex-dev/rate-limiter'

export const rateLimiter = setupRateLimiter(components, {
  sendMessage: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
})
```
