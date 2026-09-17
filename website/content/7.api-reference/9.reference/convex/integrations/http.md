---
navigation: true
---

# convex/integrations/http

## Interfaces

### RegisterBackendRoutesOptions

Defined in: [src/convex/integrations/http.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L21)

One call to mount every inbound route the backend handles on your Convex
HTTP router: the auth routes, the guarded billing events endpoint
(entitlement refresh + gift fulfilment), the guarded email delivery-events
endpoint (status tracking), the metered AI stream endpoint, and the agent
(MCP) token exchange.

The webhook endpoints share one fail-closed policy (see `webhook-guard.ts`):
missing secret → 503, invalid signature → 403 (±5 min replay tolerance),
oversized → 413, authentic-but-unknown type → 202, handler throw → 500 so
the provider retries, redelivery of a processed id → 200. Every delivery's
outcome lands in the component's ring-buffer log.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="auth"></a> `auth` | \{ `authComponent`: \{ `registerRoutes`: (...`args`) => `void`; \}; `createAuth`: `unknown`; \} | From `setupAuth`: mounts the auth HTTP routes. | [src/convex/integrations/http.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L23) |
| `auth.authComponent` | \{ `registerRoutes`: (...`args`) => `void`; \} | - | [src/convex/integrations/http.ts:26](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L26) |
| `auth.authComponent.registerRoutes` | (...`args`) => `void` | - | [src/convex/integrations/http.ts:26](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L26) |
| `auth.createAuth` | `unknown` | - | [src/convex/integrations/http.ts:27](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L27) |
| <a id="billing"></a> `billing?` | \{ `webhookHandler`: (`ctx`, `request`) => `Promise`\<`Response`\>; \} | From `setupBilling`: mounts the guarded billing events webhook at [RegisterBackendRoutesOptions.billingPath](#billingpath) (fail-closed statuses, redelivery dedupe, delivery logging — pass the whole `billing` instance). | [src/convex/integrations/http.ts:34](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L34) |
| `billing.webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | - | [src/convex/integrations/http.ts:35](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L35) |
| <a id="email"></a> `email?` | \{ `webhookHandler`: (`ctx`, `request`) => `Promise`\<`Response`\>; \} | From `setupEmail`: mounts the email events webhook at [RegisterBackendRoutesOptions.emailPath](#emailpath). | [src/convex/integrations/http.ts:38](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L38) |
| `email.webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | - | [src/convex/integrations/http.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L39) |
| <a id="ai"></a> `ai?` | \{ `httpHandler`: `unknown`; `corsOrigin`: `string`; \} | From `setupAi`: mounts the metered stream endpoint at [RegisterBackendRoutesOptions.aiPath](#aipath). | [src/convex/integrations/http.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L42) |
| `ai.httpHandler` | `unknown` | - | [src/convex/integrations/http.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L43) |
| `ai.corsOrigin` | `string` | - | [src/convex/integrations/http.ts:44](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L44) |
| <a id="mcp"></a> `mcp?` | \{ `exchangeHandler`: (`ctx`, `request`) => `Promise`\<`Response`\>; \} | From `setupAuth` (its `mcp` export): mounts the agent token exchange at [RegisterBackendRoutesOptions.mcpExchangePath](#mcpexchangepath) — the Nuxt MCP gate trades agents' OAuth Bearers here for short-lived Convex JWTs. | [src/convex/integrations/http.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L51) |
| `mcp.exchangeHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | - | [src/convex/integrations/http.ts:52](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L52) |
| <a id="billingpath"></a> `billingPath?` | `string` | Route for the billing events webhook. Default `/billing/events`. | [src/convex/integrations/http.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L55) |
| <a id="emailpath"></a> `emailPath?` | `string` | Route for the email events webhook. Default `/email/events`. | [src/convex/integrations/http.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L57) |
| <a id="aipath"></a> `aiPath?` | `string` | Route for the AI stream endpoint. Default `/ai/stream`. | [src/convex/integrations/http.ts:59](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L59) |
| <a id="mcpexchangepath"></a> `mcpExchangePath?` | `string` | Route for the agent token exchange. Default `/mcp/exchange`. | [src/convex/integrations/http.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L61) |

***

### SetupMcpOptions

Defined in: [src/convex/integrations/mcp.ts:73](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L73)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="createauth"></a> `createAuth` | (`ctx`) => `unknown` | From `setupAuth`: builds the per-request better-auth instance. Typed `unknown` because the concrete instance's generics reference option types better-auth doesn't export — it is read structurally (same trade as `registerBackendRoutes`'s never-typed auth params). | [src/convex/integrations/mcp.ts:80](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L80) |
| <a id="createsignerauth"></a> `createSignerAuth` | (`ctx`) => `unknown` | Builds the sign-only instance whose `auth.api.signJWT` mints the Convex JWT (the aligned jwt plugin cannot live on the main instance — see the client bridge). | [src/convex/integrations/mcp.ts:86](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L86) |
| <a id="ratelimiter"></a> `rateLimiter?` | `McpRateLimiter` | Throttles exchanges per client+user (the `mcp` named limit). | [src/convex/integrations/mcp.ts:88](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L88) |
| <a id="enabled"></a> `enabled?` | `boolean` | `false` turns the mounted route into a 404 (provider disabled). | [src/convex/integrations/mcp.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L90) |

***

### McpExchange

Defined in: [src/convex/integrations/mcp.ts:93](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L93)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="exchangehandler"></a> `exchangeHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | httpAction body for `POST /mcp/exchange` (wrapped by `registerBackendRoutes`). | [src/convex/integrations/mcp.ts:95](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L95) |

## Functions

### registerBackendRoutes()

```ts
function registerBackendRoutes(http, options): void;
```

Defined in: [src/convex/integrations/http.ts:80](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/http.ts#L80)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `http` | `HttpRouter` |
| `options` | [`RegisterBackendRoutesOptions`](#registerbackendroutesoptions) |

#### Returns

`void`

#### Example

```ts
// convex/http.ts
import { registerBackendRoutes } from 'nuxt-backend/http'
import { httpRouter } from 'convex/server'
import { components } from './_generated/api'
import { authComponent, createAuth, mcp } from './auth'
import billing from './billing'
import { email } from './email'

const http = httpRouter()
registerBackendRoutes(http, { auth: { authComponent, createAuth }, billing, email, mcp })
export default http
```

***

### setupMcp()

```ts
function setupMcp(options): McpExchange;
```

Defined in: [src/convex/integrations/mcp.ts:124](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/mcp.ts#L124)

Build the `/mcp/exchange` handler. Wired for you by `setupAuth` (returned
as its `mcp` export); call directly only for hand-rolled auth setups.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`SetupMcpOptions`](#setupmcpoptions) |

#### Returns

[`McpExchange`](#mcpexchange)
