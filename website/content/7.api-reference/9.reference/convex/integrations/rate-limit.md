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
  admin: {
     kind: "token bucket";
     rate: 30;
     period: number;
     capacity: 10;
  };
  invitation: {
     kind: "token bucket";
     rate: 30;
     period: number;
     capacity: 10;
  };
  invitationGlobal: {
     kind: "fixed window";
     rate: 200;
     period: number;
  };
};
```

Defined in: [src/convex/integrations/rate-limit.ts:52](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L52)

The package's default rate limits — `emailOtp`, `emailOtpGlobal`,
`billingSync`, `ai`, `aiBudget`, `mcp`, `admin`, `invitation` and
`invitationGlobal` — guarding the flows the package itself drives. Keyed per
email/entity/caller at the call site (e.g. `limit(ctx, 'emailOtp', { key:
hash })`); `emailOtpGlobal` and `invitationGlobal` are unkeyed. Extend or override any of them by
passing your own limits to [setupRateLimiter](#setupratelimiter).

Deliberately small: `emailOtp` throttles code *sends* (per-code brute force
is Better Auth's own `allowedAttempts` guard, and this package is
passwordless — there are no password flows to limit), `emailOtpGlobal`
caps sends deployment-wide, `billingSync` guards the live provider
fan-out, `ai`/`aiBudget`/`mcp` back the metered-action, credit-budget and
agent surfaces, and `admin`/`invitation`/`invitationGlobal` cover the two
signed-in routes where one caller acts on *other* people — see `setupAuth`'s
route limits.

## Covering other auth routes

These names throttle the routes the package wires itself. Every *other*
Better Auth route is throttled by Better Auth's own per-path limiter, which
takes its rules — and a durable storage — straight from your auth options:

```ts
setupAuth(components, query, {
  authOptions: {
    rateLimit: {
      storage: 'database',
      customRules: { '/organization/create': { window: 60, max: 5 } },
    },
  },
})
```

That limiter counts per IP inside the auth request; the named limits here
count per identity and are enforced before the route runs.

#### Type Declaration

| Name | Type | Default value | Description | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-emailotp"></a> `emailOtp` | \{ `kind`: `"token bucket"`; `rate`: `5`; `period`: `number`; `capacity`: `5`; \} | - | Email OTP / verification sends — 5 per minute per address, small burst allowance. | [src/convex/integrations/rate-limit.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L54) |
| `emailOtp.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L54) |
| `emailOtp.rate` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L54) |
| `emailOtp.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L54) |
| `emailOtp.capacity` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L54) |
| <a id="property-emailotpglobal"></a> `emailOtpGlobal` | \{ `kind`: `"fixed window"`; `rate`: `300`; `period`: `number`; \} | - | Email OTP sends across the whole deployment — 300 per hour, a fixed window. The backstop the per-address limit cannot be: an attacker rotating addresses to probe an invite gate or run up the email bill hits this ceiling. Raise it when a launch legitimately signs in more than that. | [src/convex/integrations/rate-limit.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L61) |
| `emailOtpGlobal.kind` | `"fixed window"` | `'fixed window'` | - | [src/convex/integrations/rate-limit.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L61) |
| `emailOtpGlobal.rate` | `300` | `300` | - | [src/convex/integrations/rate-limit.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L61) |
| `emailOtpGlobal.period` | `number` | `HOUR` | - | [src/convex/integrations/rate-limit.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L61) |
| <a id="property-billingsync"></a> `billingSync` | \{ `kind`: `"token bucket"`; `rate`: `10`; `period`: `number`; `capacity`: `5`; \} | - | Entitlement syncs — 10 per minute per billing entity, small burst for the back-to-back syncs after checkout / top-up. Guards the live provider fan-out `syncEntitlements` performs (see `setupBilling`'s `rateLimiter`). | [src/convex/integrations/rate-limit.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L67) |
| `billingSync.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L67) |
| `billingSync.rate` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L67) |
| `billingSync.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L67) |
| `billingSync.capacity` | `5` | `5` | - | [src/convex/integrations/rate-limit.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L67) |
| <a id="property-ai"></a> `ai` | \{ `kind`: `"token bucket"`; `rate`: `30`; `period`: `number`; `capacity`: `10`; \} | - | Metered AI calls (`setupAi`'s default limit) — 30 per minute per billing entity with a burst of 10. Reference by name (`limit: 'ai'`) or declare your own per-feature limits and name them in `meteredAction`. | [src/convex/integrations/rate-limit.ts:73](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L73) |
| `ai.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:73](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L73) |
| `ai.rate` | `30` | `30` | - | [src/convex/integrations/rate-limit.ts:73](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L73) |
| `ai.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:73](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L73) |
| `ai.capacity` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:73](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L73) |
| <a id="property-aibudget"></a> `aiBudget` | \{ `kind`: `"fixed window"`; `rate`: `10000`; `period`: `number`; \} | - | Per-entity credit budget for metered AI (`setupAi({ budget })`) — a fixed window counting **credits**, not calls: each spend consumes its cost in tokens, so the window is "credits per period per billing entity". A fixed window (not a bucket) because a budget is a period allowance that resets, not a smoothed rate. The default is a generous ceiling — `setupAi({ budget: { units, period } })` passes the app's own numbers inline and overrides it. It exists so the name resolves even when a caller names the limit without configuring one. | [src/convex/integrations/rate-limit.ts:85](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L85) |
| `aiBudget.kind` | `"fixed window"` | `'fixed window'` | - | [src/convex/integrations/rate-limit.ts:85](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L85) |
| `aiBudget.rate` | `10000` | `10_000` | - | [src/convex/integrations/rate-limit.ts:85](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L85) |
| `aiBudget.period` | `number` | `DAY` | - | [src/convex/integrations/rate-limit.ts:85](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L85) |
| <a id="property-mcp"></a> `mcp` | \{ `kind`: `"token bucket"`; `rate`: `60`; `period`: `number`; `capacity`: `20`; \} | - | Agent (MCP) session exchanges — 60 per minute per client+user. Guards the token-exchange endpoint agents call on the app's behalf. | [src/convex/integrations/rate-limit.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L90) |
| `mcp.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L90) |
| `mcp.rate` | `60` | `60` | - | [src/convex/integrations/rate-limit.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L90) |
| `mcp.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L90) |
| `mcp.capacity` | `20` | `20` | - | [src/convex/integrations/rate-limit.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L90) |
| <a id="property-admin"></a> `admin` | \{ `kind`: `"token bucket"`; `rate`: `30`; `period`: `number`; `capacity`: `10`; \} | - | Administrator actions — 30 per minute per administrator, burst 10. Covers every `/admin/*` route that acts on somebody else (list, create, update, ban/unban, set role, impersonate, revoke sessions, remove user): each is one privileged call against another person's account, so the ceiling is "a human working fast", not a script. `/admin/stop-impersonating` and `/admin/has-permission` are deliberately exempt — the first is how an administrator leaves an impersonated session and must never be throttled, the second is a read-only check the console calls on render. | [src/convex/integrations/rate-limit.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L101) |
| `admin.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L101) |
| `admin.rate` | `30` | `30` | - | [src/convex/integrations/rate-limit.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L101) |
| `admin.period` | `number` | `MINUTE` | - | [src/convex/integrations/rate-limit.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L101) |
| `admin.capacity` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L101) |
| <a id="property-invitation"></a> `invitation` | \{ `kind`: `"token bucket"`; `rate`: `30`; `period`: `number`; `capacity`: `10`; \} | - | Workspace invitations — 30 per hour per inviter, burst 10. An hour window (not a minute) because what matters is the volume one account can send, not its per-second rate. Per **inviter**: it bounds one account, not a workspace and not the deployment — [DEFAULT\_LIMITS.invitationGlobal](#property-invitationglobal) is the ceiling that does. | [src/convex/integrations/rate-limit.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L109) |
| `invitation.kind` | `"token bucket"` | `'token bucket'` | - | [src/convex/integrations/rate-limit.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L109) |
| `invitation.rate` | `30` | `30` | - | [src/convex/integrations/rate-limit.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L109) |
| `invitation.period` | `number` | `HOUR` | - | [src/convex/integrations/rate-limit.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L109) |
| `invitation.capacity` | `10` | `10` | - | [src/convex/integrations/rate-limit.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L109) |
| <a id="property-invitationglobal"></a> `invitationGlobal` | \{ `kind`: `"fixed window"`; `rate`: `200`; `period`: `number`; \} | - | Invitations across the whole deployment — 200 per hour, a fixed window. The backstop the per-inviter limit cannot be, and the counterpart of `emailOtpGlobal` on the package's other outbound-email path: a workspace with many members, or many accounts acting together, would otherwise put 30 invitation emails per member per hour on your sending domain. Only requests that already cleared `invitation` consume this, so one account's refused excess never eats the shared ceiling. Raise it when a launch legitimately invites more than that. | [src/convex/integrations/rate-limit.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L120) |
| `invitationGlobal.kind` | `"fixed window"` | `'fixed window'` | - | [src/convex/integrations/rate-limit.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L120) |
| `invitationGlobal.rate` | `200` | `200` | - | [src/convex/integrations/rate-limit.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L120) |
| `invitationGlobal.period` | `number` | `HOUR` | - | [src/convex/integrations/rate-limit.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L120) |

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
  admin: {
     kind: "token bucket";
     rate: 30;
     period: number;
     capacity: 10;
  };
  invitation: {
     kind: "token bucket";
     rate: 30;
     period: number;
     capacity: 10;
  };
  invitationGlobal: {
     kind: "fixed window";
     rate: 200;
     period: number;
  };
} & Limits>;
```

Defined in: [src/convex/integrations/rate-limit.ts:140](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/rate-limit.ts#L140)

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
  `admin`: \{
     `kind`: `"token bucket"`;
     `rate`: `30`;
     `period`: `number`;
     `capacity`: `10`;
  \};
  `invitation`: \{
     `kind`: `"token bucket"`;
     `rate`: `30`;
     `period`: `number`;
     `capacity`: `10`;
  \};
  `invitationGlobal`: \{
     `kind`: `"fixed window"`;
     `rate`: `200`;
     `period`: `number`;
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
