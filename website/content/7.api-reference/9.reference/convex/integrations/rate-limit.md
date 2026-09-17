---
navigation: true
---

# convex/integrations/rate-limit

## Interfaces

### RateLimiterComponents

Defined in: [src/convex/integrations/rate-limit.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L11)

The component handle `setupRateLimiter` reads from your generated
`components` object (the key is picked structurally — pass the whole object).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="ratelimiter"></a> `rateLimiter` | `ComponentApi` | [src/convex/integrations/rate-limit.ts:12](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L12) |

## Type Aliases

### RateLimitConfig

```ts
type RateLimitConfig = 
  | TokenBucketConfig & ShardedConfig
  | TokenBucketConfig & AsyncConfig
  | FixedWindowConfig & ShardedConfig
  | FixedWindowConfig & AsyncConfig;
```

Defined in: node\_modules/@convex-dev/rate-limiter/dist/shared.d.ts:116

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

### DAY

```ts
const DAY: number;
```

Defined in: node\_modules/@convex-dev/rate-limiter/dist/client/index.d.ts:9

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
  emailOtpGlobal: {
     kind: "fixed window";
     rate: 300;
     period: number;
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
  aiBudget: {
     kind: "fixed window";
     rate: 10000;
     period: number;
  };
  mcp: {
     kind: "token bucket";
     rate: 60;
     period: number;
     capacity: 20;
  };
};
```

Defined in: [src/convex/integrations/rate-limit.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L30)

The package's default rate limits — `emailOtp`, `emailOtpGlobal`,
`billingSync`, `ai`, `aiBudget` and `mcp` — guarding the flows the package
itself drives. Most are keyed per email/entity at the call site (e.g.
`limit(ctx, 'emailOtp', { key: hash })`); `emailOtpGlobal` is unkeyed.
Extend or override any of them by passing your own limits to
[setupRateLimiter](#setupratelimiter).

Deliberately small: `emailOtp` throttles code *sends* (per-code brute force
is Better Auth's own `allowedAttempts` guard, and this package is
passwordless — there are no password flows to limit), `emailOtpGlobal`
caps sends deployment-wide, `billingSync` guards the live provider
fan-out, and `ai`/`aiBudget`/`mcp` back the metered-action,
credit-budget and agent surfaces.

#### Type Declaration

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-emailotp"></a> `emailOtp` | \{ `kind`: `"token bucket"`; `rate`: `5`; `period`: `number`; `capacity`: `5`; \} | - | Email OTP / verification sends — 5 per minute per address, small burst allowance. | [src/convex/integrations/rate-limit.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L32) |
| `emailOtp.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L32) |
| `emailOtp.rate` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L32) |
| `emailOtp.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L32) |
| `emailOtp.capacity` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L32) |
| <a id="property-emailotpglobal"></a> `emailOtpGlobal` | \{ `kind`: `"fixed window"`; `rate`: `300`; `period`: `number`; \} | - | Email OTP sends across the whole deployment — 300 per hour, a fixed window. The backstop the per-address limit cannot be: an attacker rotating addresses to probe an invite gate or run up the email bill hits this ceiling. Raise it when a launch legitimately signs in more than that. | [src/convex/integrations/rate-limit.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L39) |
| `emailOtpGlobal.kind` | `"fixed window"` | `'fixed window'` | - | [src/convex/integrations/rate-limit.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L39) |
| `emailOtpGlobal.rate` | `300` | `300` | - | [src/convex/integrations/rate-limit.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L39) |
| `emailOtpGlobal.period` | `number` | `HOUR` | - | [src/convex/integrations/rate-limit.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L39) |
| <a id="property-billingsync"></a> `billingSync` | \{ `kind`: `"token bucket"`; `rate`: `10`; `period`: `number`; `capacity`: `5`; \} | - | Entitlement syncs — 10 per minute per billing entity, small burst for the back-to-back syncs after checkout / top-up. Guards the live provider fan-out `syncEntitlements` performs (see `setupBilling`'s `rateLimiter`). | [src/convex/integrations/rate-limit.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L45) |
| `billingSync.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L45) |
| `billingSync.rate` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L45) |
| `billingSync.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L45) |
| `billingSync.capacity` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L45) |
| <a id="property-ai"></a> `ai` | \{ `kind`: `"token bucket"`; `rate`: `30`; `period`: `number`; `capacity`: `10`; \} | - | Metered AI calls (`setupAi`'s default limit) — 30 per minute per billing entity with a burst of 10. Reference by name (`limit: 'ai'`) or declare your own per-feature limits and name them in `meteredAction`. | [src/convex/integrations/rate-limit.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L51) |
| `ai.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L51) |
| `ai.rate` | `30` | `30` | - | [src/convex/integrations/rate-limit.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L51) |
| `ai.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L51) |
| `ai.capacity` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L51) |
| <a id="property-aibudget"></a> `aiBudget` | \{ `kind`: `"fixed window"`; `rate`: `10000`; `period`: `number`; \} | - | Per-entity credit budget for metered AI (`setupAi({ budget })`) — a fixed window counting **credits**, not calls: each spend consumes its cost in tokens, so the window is "credits per period per billing entity". A fixed window (not a bucket) because a budget is a period allowance that resets, not a smoothed rate. The default is a generous ceiling — `setupAi({ budget: { units, period } })` passes the app's own numbers inline and overrides it. It exists so the name resolves even when a caller names the limit without configuring one. | [src/convex/integrations/rate-limit.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L63) |
| `aiBudget.kind` | `"fixed window"` | `'fixed window'` | - | [src/convex/integrations/rate-limit.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L63) |
| `aiBudget.rate` | `10000` | `10_000` | - | [src/convex/integrations/rate-limit.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L63) |
| `aiBudget.period` | `number` | `DAY` | - | [src/convex/integrations/rate-limit.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L63) |
| <a id="property-mcp"></a> `mcp` | \{ `kind`: `"token bucket"`; `rate`: `60`; `period`: `number`; `capacity`: `20`; \} | - | Agent (MCP) session exchanges — 60 per minute per client+user. Guards the token-exchange endpoint agents call on the app's behalf. | [src/convex/integrations/rate-limit.ts:68](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L68) |
| `mcp.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:68](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L68) |
| `mcp.rate` | `60` | `60` | - | [src/convex/integrations/rate-limit.ts:68](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L68) |
| `mcp.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:68](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L68) |
| `mcp.capacity` | `20` | `20` | - | [src/convex/integrations/rate-limit.ts:68](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L68) |

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
  emailOtpGlobal: {
     kind: "fixed window";
     rate: 300;
     period: number;
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
  aiBudget: {
     kind: "fixed window";
     rate: 10000;
     period: number;
  };
  mcp: {
     kind: "token bucket";
     rate: 60;
     period: number;
     capacity: 20;
  };
} & Limits>;
```

Defined in: [src/convex/integrations/rate-limit.ts:88](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L88)

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
  `emailOtpGlobal`: \{
     `kind`: `"fixed window"`;
     `rate`: `300`;
     `period`: `number`;
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
  `aiBudget`: \{
     `kind`: `"fixed window"`;
     `rate`: `10000`;
     `period`: `number`;
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
