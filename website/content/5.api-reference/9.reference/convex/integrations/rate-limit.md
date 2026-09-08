---
navigation: true
---

# convex/integrations/rate-limit

## Interfaces

### RateLimiterComponents

Defined in: [nuxt-backend/src/convex/integrations/rate-limit.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L11)

The component handle `setupRateLimiter` reads from your generated
`components` object (the key is picked structurally — pass the whole object).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="ratelimiter"></a> `rateLimiter` | `ComponentApi` | [nuxt-backend/src/convex/integrations/rate-limit.ts:12](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L12) |

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

### DEFAULT\_LIMITS

```ts
const DEFAULT_LIMITS: {
  emailOtp: {
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
  ai: {
     kind: "token bucket";
     rate: 30;
     period: number;
     capacity: 10;
  };
  mcp: {
     kind: "token bucket";
     rate: 60;
     period: number;
     capacity: 20;
  };
};
```

Defined in: [nuxt-backend/src/convex/integrations/rate-limit.ts:28](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L28)

The package's default rate limits — `emailOtp`, `billingSync`, `ai`, and
`mcp` — guarding the flows the package itself drives. Each is keyed per
email/entity at the call site (e.g. `limit(ctx, 'emailOtp', { key: email })`).
Extend or override any of them by passing your own limits to
[setupRateLimiter](#setupratelimiter).

Deliberately small: `emailOtp` throttles code *sends* (per-code brute force
is Better Auth's own `allowedAttempts` guard, and this package is
passwordless — there are no password flows to limit), `billingSync` guards
the live provider fan-out, and `ai`/`mcp` back the metered-action and agent
surfaces.

#### Type Declaration

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-emailotp"></a> `emailOtp` | \{ `kind`: `"token bucket"`; `rate`: `5`; `period`: `number`; `capacity`: `5`; \} | - | Email OTP / verification sends — 5 per minute, small burst allowance. | [nuxt-backend/src/convex/integrations/rate-limit.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L30) |
| `emailOtp.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L30) |
| `emailOtp.rate` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L30) |
| `emailOtp.period` | `number` | `MINUTE` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L30) |
| `emailOtp.capacity` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L30) |
| <a id="property-billingsync"></a> `billingSync` | \{ `kind`: `"token bucket"`; `rate`: `10`; `period`: `number`; `capacity`: `5`; \} | - | Entitlement syncs — 10 per minute per billing entity, small burst for the back-to-back syncs after checkout / top-up. Guards the live provider fan-out `syncEntitlements` performs (see `setupBilling`'s `rateLimiter`). | [nuxt-backend/src/convex/integrations/rate-limit.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L36) |
| `billingSync.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L36) |
| `billingSync.rate` | `10` | `10` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L36) |
| `billingSync.period` | `number` | `MINUTE` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L36) |
| `billingSync.capacity` | `5` | `5` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L36) |
| <a id="property-ai"></a> `ai` | \{ `kind`: `"token bucket"`; `rate`: `30`; `period`: `number`; `capacity`: `10`; \} | - | Metered AI calls (`setupAi`'s default limit) — 30 per minute per billing entity with a burst of 10. Reference by name (`limit: 'ai'`) or declare your own per-feature limits and name them in `meteredAction`. | [nuxt-backend/src/convex/integrations/rate-limit.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L42) |
| `ai.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L42) |
| `ai.rate` | `30` | `30` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L42) |
| `ai.period` | `number` | `MINUTE` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L42) |
| `ai.capacity` | `10` | `10` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L42) |
| <a id="property-mcp"></a> `mcp` | \{ `kind`: `"token bucket"`; `rate`: `60`; `period`: `number`; `capacity`: `20`; \} | - | Agent (MCP) session exchanges — 60 per minute per client+user. Guards the token-exchange endpoint agents call on the app's behalf. | [nuxt-backend/src/convex/integrations/rate-limit.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L47) |
| `mcp.kind` | `"token bucket"` | `'token bucket'` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L47) |
| `mcp.rate` | `60` | `60` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L47) |
| `mcp.period` | `number` | `MINUTE` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L47) |
| `mcp.capacity` | `20` | `20` | - | [nuxt-backend/src/convex/integrations/rate-limit.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L47) |

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
  billingSync: {
     kind: "token bucket";
     rate: 10;
     period: number;
     capacity: 5;
  };
  ai: {
     kind: "token bucket";
     rate: 30;
     period: number;
     capacity: 10;
  };
  mcp: {
     kind: "token bucket";
     rate: 60;
     period: number;
     capacity: 20;
  };
} & Limits>;
```

Defined in: [nuxt-backend/src/convex/integrations/rate-limit.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L67)

Configure the [Rate Limiter](https://www.convex.dev/components/rate-limiter) component, pre-seeded with [DEFAULT\_LIMITS](#default_limits). Pass extra
named limits to cover your own application functions; they are merged with
(and can override) the package defaults.

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
  `billingSync`: \{
     `kind`: `"token bucket"`;
     `rate`: `10`;
     `period`: `number`;
     `capacity`: `5`;
  \};
  `ai`: \{
     `kind`: `"token bucket"`;
     `rate`: `30`;
     `period`: `number`;
     `capacity`: `10`;
  \};
  `mcp`: \{
     `kind`: `"token bucket"`;
     `rate`: `60`;
     `period`: `number`;
     `capacity`: `20`;
  \};
\} & `Limits`\>

#### Example

```ts
import { setupRateLimiter } from 'nuxt-backend/rate-limit'
import { components } from './_generated/api'
import { MINUTE } from '@convex-dev/rate-limiter'

export const rateLimiter = setupRateLimiter(components, {
  sendMessage: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
})
```
