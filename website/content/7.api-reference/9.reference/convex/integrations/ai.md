---
navigation: true
---

# convex/integrations/ai

**`Experimental`**

The rails for selling metered AI features — `nuxt-backend/ai`: wrap any
Convex action so it is rate-limited, prepaid-credit-metered (reserve → run →
settle — a failed run consumes nothing), and optionally token-streamed to
the browser with the text persisted server-side (reload mid-stream and it
continues).

Composes the billing spend reservation (`setupBilling`), the rate limiter,
and the upstream persistent-text-streaming component — usage recording IS
the provider event, so per-customer usage shows up in the provider's own
portal and dashboard with no extra tables here.

Experimental: the metering model (reserve/settle over provider meter
events) is the newest part of the package and may change shape in a minor
release; `useAiStream` on the Vue side is experimental with it.

## Interfaces

### AiRateLimiter

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:35](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L35)

**`Experimental`**

The rate limiter shape `setupAi` consumes — satisfied by a
`setupRateLimiter(...)` instance, which seeds the `ai` limit by default.
Typed against the literal default name (the limiter's conditional
rest-tuple signature only resolves for known names — the same pattern as
`BillingRateLimiter`); custom `limit:` names pass through a cast at the
call site.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<\{ `ok`: `boolean`; `retryAfter?`: `number`; \}\> | **`Experimental`** | [nuxt-backend/src/convex/integrations/ai.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L36) |

***

### AiComponents

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:44](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L44)

**`Experimental`**

The component handles `setupAi` reads from your generated `components` object.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="backend"></a> `backend` | \{ `ai`: \{ `createRequest`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\>; `getByStream`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\>; `markSettled`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; `markReleased`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; \}; \} | **`Experimental`** | [nuxt-backend/src/convex/integrations/ai.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L45) |
| `backend.ai` | \{ `createRequest`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\>; `getByStream`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\>; `markSettled`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; `markReleased`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; \} | - | [nuxt-backend/src/convex/integrations/ai.ts:46](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L46) |
| `backend.ai.createRequest` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\> | - | [nuxt-backend/src/convex/integrations/ai.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L47) |
| `backend.ai.getByStream` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\> | - | [nuxt-backend/src/convex/integrations/ai.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L57) |
| `backend.ai.markSettled` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\> | - | [nuxt-backend/src/convex/integrations/ai.ts:69](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L69) |
| `backend.ai.markReleased` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\> | - | [nuxt-backend/src/convex/integrations/ai.ts:70](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L70) |
| <a id="persistenttextstreaming"></a> `persistentTextStreaming` | \{ `lib`: \{ `createStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\>; `addChunk`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\>; `setStreamStatus`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; `getStreamStatus`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\>; `getStreamText`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\>; `deleteStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; \}; \} | **`Experimental`** | [nuxt-backend/src/convex/integrations/ai.ts:73](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L73) |
| `persistentTextStreaming.lib` | \{ `createStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\>; `addChunk`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\>; `setStreamStatus`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; `getStreamStatus`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\>; `getStreamText`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\>; `deleteStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; \} | - |  |
| `persistentTextStreaming.lib.createStream` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\> | - | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:1 |
| `persistentTextStreaming.lib.addChunk` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\> | - | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:2 |
| `persistentTextStreaming.lib.setStreamStatus` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\> | - | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:7 |
| `persistentTextStreaming.lib.getStreamStatus` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\> | - | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:11 |
| `persistentTextStreaming.lib.getStreamText` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\> | - | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:14 |
| `persistentTextStreaming.lib.deleteStream` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\> | - | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:20 |

***

### SetupAiConfig

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:76](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L76)

**`Experimental`**

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="billing"></a> `billing` | [`Billing`](/api-reference/reference/convex/integrations/billing#billing) | **`Experimental`** The `setupBilling(...)` instance — supplies entity resolution + the credit spend. | [nuxt-backend/src/convex/integrations/ai.ts:78](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L78) |
| <a id="ratelimiter"></a> `rateLimiter?` | [`AiRateLimiter`](#airatelimiter) | **`Experimental`** Your `setupRateLimiter(...)` instance. Metered actions/streams check their named limit (default `'ai'`) per billing entity before reserving. Omit to leave them unthrottled. | [nuxt-backend/src/convex/integrations/ai.ts:84](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L84) |
| <a id="cors"></a> `cors?` | \{ `origin?`: `string`; \} | **`Experimental`** CORS origin for the stream endpoint. Defaults to the `SITE_URL` env var. | [nuxt-backend/src/convex/integrations/ai.ts:86](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L86) |
| `cors.origin?` | `string` | - | [nuxt-backend/src/convex/integrations/ai.ts:86](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L86) |

***

### MeteredUsage

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L90)

**`Experimental`**

Usage details handed to metered handlers (`ctx.usage`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="entityid"></a> `entityId` | `string` | **`Experimental`** The billing entity (workspace/user) charged. | [nuxt-backend/src/convex/integrations/ai.ts:92](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L92) |
| <a id="userid"></a> `userId` | `string` | **`Experimental`** The signed-in caller. | [nuxt-backend/src/convex/integrations/ai.ts:94](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L94) |
| <a id="meter"></a> `meter?` | `string` | **`Experimental`** Configured meter name, when metered. | [nuxt-backend/src/convex/integrations/ai.ts:96](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L96) |
| <a id="cost"></a> `cost` | `number` | **`Experimental`** Credits this call costs. | [nuxt-backend/src/convex/integrations/ai.ts:98](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L98) |

***

### MeteredActionConfig

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L101)

**`Experimental`**

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `PropertyValidators` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter-1"></a> `meter` | `string` \| `false` | **`Experimental`** The configured credit meter to charge (`setupBilling({ credits })` / catalog key) — or `false` for a rate-limit-only action. | [nuxt-backend/src/convex/integrations/ai.ts:106](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L106) |
| <a id="cost-1"></a> `cost?` | `number` \| ((`args`) => `number`) | **`Experimental`** Credits per call — a number or derived from the args. Default `1`. | [nuxt-backend/src/convex/integrations/ai.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L108) |
| <a id="limit-1"></a> `limit?` | `string` \| `false` | **`Experimental`** Named rate limit (checked per billing entity via the configured `rateLimiter`). Default `'ai'`; `false` disables the check. | [nuxt-backend/src/convex/integrations/ai.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L113) |
| <a id="charge"></a> `charge?` | `"success"` \| `"start"` | **`Experimental`** When to charge: `'success'` (default) settles after the handler returns — a failed run consumes nothing; `'start'` settles before running, for work that is irrevocably consumed upstream the moment it starts. | [nuxt-backend/src/convex/integrations/ai.ts:119](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L119) |
| <a id="args-1"></a> `args` | `Args` | **`Experimental`** | [nuxt-backend/src/convex/integrations/ai.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L120) |
| <a id="handler"></a> `handler` | (`ctx`, `args`) => `Promise`\<`unknown`\> | **`Experimental`** | [nuxt-backend/src/convex/integrations/ai.ts:121](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L121) |

***

### MeteredStreamConfig

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:124](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L124)

**`Experimental`**

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `PropertyValidators` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name"></a> `name` | `string` | **`Experimental`** Registry key — unique per app; the HTTP dispatcher routes by it. | [nuxt-backend/src/convex/integrations/ai.ts:126](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L126) |
| <a id="meter-2"></a> `meter` | `string` \| `false` | **`Experimental`** The configured credit meter to charge, or `false` for limit-only. | [nuxt-backend/src/convex/integrations/ai.ts:128](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L128) |
| <a id="cost-2"></a> `cost?` | `number` \| ((`args`) => `number`) | **`Experimental`** Credits per stream — a number or derived from the args. Default `1`. | [nuxt-backend/src/convex/integrations/ai.ts:130](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L130) |
| <a id="limit-2"></a> `limit?` | `string` \| `false` | **`Experimental`** Named rate limit. Default `'ai'`; `false` disables. | [nuxt-backend/src/convex/integrations/ai.ts:132](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L132) |
| <a id="args-3"></a> `args` | `Args` | **`Experimental`** | [nuxt-backend/src/convex/integrations/ai.ts:133](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L133) |
| <a id="handler-1"></a> `handler` | (`ctx`, `args`, `stream`) => `Promise`\<`void`\> | **`Experimental`** Produce the stream: `append(text)` pushes a chunk to the client AND persists it. Credits settle when the handler finishes; an error or disconnect releases them — an interrupted stream never charges. | [nuxt-backend/src/convex/integrations/ai.ts:139](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L139) |

***

### Ai

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:146](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L146)

**`Experimental`**

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meteredaction"></a> `meteredAction` | \<`Args`\>(`config`) => `RegisteredAction`\<`"public"`\> | **`Experimental`** A drop-in replacement for `action` that rate-limits, reserves prepaid credits, runs your handler, then settles the spend (usage lands in the billing provider as an ingested event). Failed runs release the reservation — nothing charged. **Example** `export const generate = ai.meteredAction({ meter: 'credits', cost: args => args.long ? 5 : 1, args: { prompt: v.string(), long: v.optional(v.boolean()) }, handler: async (ctx, { prompt }) => runModel(prompt), })` | [nuxt-backend/src/convex/integrations/ai.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L163) |
| <a id="stream"></a> `stream` | \<`Args`\>(`config`) => \{ `start`: `RegisteredAction`\<`"public"`\>; `body`: `RegisteredQuery`\<`"public"`\>; \} | **`Experimental`** A metered, persisted token stream. Returns `{ start, body }` to re-export from your module — `useAiStream` drives them: `start` reserves credits and creates the stream, the HTTP endpoint (`registerBackendRoutes({ ai })`) runs your handler and streams chunks, `body` serves the persisted text reactively (reload mid-stream and it continues). | [nuxt-backend/src/convex/integrations/ai.ts:171](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L171) |
| <a id="httphandler"></a> `httpHandler` | `PublicHttpAction` | **`Experimental`** The stream endpoint for `registerBackendRoutes({ ai })` (POST + CORS preflight). | [nuxt-backend/src/convex/integrations/ai.ts:176](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L176) |
| <a id="corsorigin"></a> `corsOrigin` | `string` | **`Experimental`** CORS headers for the stream route (used by `registerBackendRoutes`). | [nuxt-backend/src/convex/integrations/ai.ts:178](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L178) |

## Functions

### setupAi()

```ts
function setupAi(components, config): Ai;
```

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:197](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L197)

**`Experimental`**

Configure the AI rails over billing + rate limiting + streaming.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`AiComponents`](#aicomponents) |
| `config` | [`SetupAiConfig`](#setupaiconfig) |

#### Returns

[`Ai`](#ai)

#### Example

```ts
// backend/ai.ts
import { setupAi } from 'nuxt-backend/ai'
import { components } from './_generated/api'
import { billing } from './billing'
import { rateLimiter } from './rateLimiter'

export const ai = setupAi(components, { billing, rateLimiter })
export const generate = ai.meteredAction({ ... })
export const { start: startEcho, body: echoBody } = ai.stream({ name: 'echo', ... })
```
