---
navigation: true
---

# convex/integrations/ai

## Interfaces

### AiRateLimiter

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:28](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L28)

The rate limiter shape `setupAi` consumes — satisfied by a
`setupRateLimiter(...)` instance, which seeds the `ai` limit by default.
Typed against the literal default name (the limiter's conditional
rest-tuple signature only resolves for known names — the same pattern as
`BillingRateLimiter`); custom `limit:` names pass through a cast at the
call site.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<\{ `ok`: `boolean`; `retryAfter?`: `number`; \}\> | [nuxt-backend/src/convex/integrations/ai.ts:29](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L29) |

***

### AiComponents

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:37](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L37)

The component handles `setupAi` reads from your generated `components` object.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="backend"></a> `backend` | \{ `ai`: \{ `createRequest`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\>; `getByStream`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\>; `markSettled`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; `markReleased`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; \}; \} | [nuxt-backend/src/convex/integrations/ai.ts:38](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L38) |
| `backend.ai` | \{ `createRequest`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\>; `getByStream`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\>; `markSettled`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; `markReleased`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; \} | [nuxt-backend/src/convex/integrations/ai.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L39) |
| `backend.ai.createRequest` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/ai.ts:40](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L40) |
| `backend.ai.getByStream` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\> | [nuxt-backend/src/convex/integrations/ai.ts:50](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L50) |
| `backend.ai.markSettled` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/ai.ts:62](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L62) |
| `backend.ai.markReleased` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/ai.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L63) |
| <a id="persistenttextstreaming"></a> `persistentTextStreaming` | \{ `lib`: \{ `createStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\>; `addChunk`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\>; `setStreamStatus`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; `getStreamStatus`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\>; `getStreamText`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\>; `deleteStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; \}; \} | [nuxt-backend/src/convex/integrations/ai.ts:66](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L66) |
| `persistentTextStreaming.lib` | \{ `createStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\>; `addChunk`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\>; `setStreamStatus`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; `getStreamStatus`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\>; `getStreamText`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\>; `deleteStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; \} |  |
| `persistentTextStreaming.lib.createStream` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\> | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:1 |
| `persistentTextStreaming.lib.addChunk` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\> | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:2 |
| `persistentTextStreaming.lib.setStreamStatus` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\> | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:7 |
| `persistentTextStreaming.lib.getStreamStatus` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\> | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:11 |
| `persistentTextStreaming.lib.getStreamText` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\> | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:14 |
| `persistentTextStreaming.lib.deleteStream` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\> | nuxt-backend/node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:20 |

***

### SetupAiConfig

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:69](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L69)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="billing"></a> `billing` | [`Billing`](/api-reference/reference/convex/integrations/billing#billing) | The `setupBilling(...)` instance — supplies entity resolution + the credit spend. | [nuxt-backend/src/convex/integrations/ai.ts:71](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L71) |
| <a id="ratelimiter"></a> `rateLimiter?` | [`AiRateLimiter`](#airatelimiter) | Your `setupRateLimiter(...)` instance. Metered actions/streams check their named limit (default `'ai'`) per billing entity before reserving. Omit to leave them unthrottled. | [nuxt-backend/src/convex/integrations/ai.ts:77](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L77) |
| <a id="cors"></a> `cors?` | \{ `origin?`: `string`; \} | CORS origin for the stream endpoint. Defaults to the `SITE_URL` env var. | [nuxt-backend/src/convex/integrations/ai.ts:79](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L79) |
| `cors.origin?` | `string` | - | [nuxt-backend/src/convex/integrations/ai.ts:79](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L79) |

***

### MeteredUsage

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L83)

Usage details handed to metered handlers (`ctx.usage`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="entityid"></a> `entityId` | `string` | The billing entity (workspace/user) charged. | [nuxt-backend/src/convex/integrations/ai.ts:85](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L85) |
| <a id="userid"></a> `userId` | `string` | The signed-in caller. | [nuxt-backend/src/convex/integrations/ai.ts:87](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L87) |
| <a id="meter"></a> `meter?` | `string` | Configured meter name, when metered. | [nuxt-backend/src/convex/integrations/ai.ts:89](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L89) |
| <a id="cost"></a> `cost` | `number` | Credits this call costs. | [nuxt-backend/src/convex/integrations/ai.ts:91](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L91) |

***

### MeteredActionConfig

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:94](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L94)

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `PropertyValidators` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter-1"></a> `meter` | `string` \| `false` | The configured credit meter to charge (`setupBilling({ credits })` / catalog key) — or `false` for a rate-limit-only action. | [nuxt-backend/src/convex/integrations/ai.ts:99](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L99) |
| <a id="cost-1"></a> `cost?` | `number` \| ((`args`) => `number`) | Credits per call — a number or derived from the args. Default `1`. | [nuxt-backend/src/convex/integrations/ai.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L101) |
| <a id="limit-1"></a> `limit?` | `string` \| `false` | Named rate limit (checked per billing entity via the configured `rateLimiter`). Default `'ai'`; `false` disables the check. | [nuxt-backend/src/convex/integrations/ai.ts:106](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L106) |
| <a id="charge"></a> `charge?` | `"success"` \| `"start"` | When to charge: `'success'` (default) settles after the handler returns — a failed run consumes nothing; `'start'` settles before running, for work that is irrevocably consumed upstream the moment it starts. | [nuxt-backend/src/convex/integrations/ai.ts:112](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L112) |
| <a id="args-1"></a> `args` | `Args` | - | [nuxt-backend/src/convex/integrations/ai.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L113) |
| <a id="handler"></a> `handler` | (`ctx`, `args`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/ai.ts:114](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L114) |

***

### MeteredStreamConfig

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:117](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L117)

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `PropertyValidators` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name"></a> `name` | `string` | Registry key — unique per app; the HTTP dispatcher routes by it. | [nuxt-backend/src/convex/integrations/ai.ts:119](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L119) |
| <a id="meter-2"></a> `meter` | `string` \| `false` | The configured credit meter to charge, or `false` for limit-only. | [nuxt-backend/src/convex/integrations/ai.ts:121](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L121) |
| <a id="cost-2"></a> `cost?` | `number` \| ((`args`) => `number`) | Credits per stream — a number or derived from the args. Default `1`. | [nuxt-backend/src/convex/integrations/ai.ts:123](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L123) |
| <a id="limit-2"></a> `limit?` | `string` \| `false` | Named rate limit. Default `'ai'`; `false` disables. | [nuxt-backend/src/convex/integrations/ai.ts:125](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L125) |
| <a id="args-3"></a> `args` | `Args` | - | [nuxt-backend/src/convex/integrations/ai.ts:126](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L126) |
| <a id="handler-1"></a> `handler` | (`ctx`, `args`, `stream`) => `Promise`\<`void`\> | Produce the stream: `append(text)` pushes a chunk to the client AND persists it. Credits settle when the handler finishes; an error or disconnect releases them — an interrupted stream never charges. | [nuxt-backend/src/convex/integrations/ai.ts:132](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L132) |

***

### Ai

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:139](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L139)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meteredaction"></a> `meteredAction` | \<`Args`\>(`config`) => `RegisteredAction`\<`"public"`\> | A drop-in replacement for `action` that rate-limits, reserves prepaid credits, runs your handler, then settles the spend (usage lands in the billing provider as an ingested event). Failed runs release the reservation — nothing charged. **Example** `export const generate = ai.meteredAction({ meter: 'credits', cost: args => args.long ? 5 : 1, args: { prompt: v.string(), long: v.optional(v.boolean()) }, handler: async (ctx, { prompt }) => runModel(prompt), })` | [nuxt-backend/src/convex/integrations/ai.ts:156](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L156) |
| <a id="stream"></a> `stream` | \<`Args`\>(`config`) => \{ `start`: `RegisteredAction`\<`"public"`\>; `body`: `RegisteredQuery`\<`"public"`\>; \} | A metered, persisted token stream. Returns `{ start, body }` to re-export from your module — `useAiStream` drives them: `start` reserves credits and creates the stream, the HTTP endpoint (`registerBackendRoutes({ ai })`) runs your handler and streams chunks, `body` serves the persisted text reactively (reload mid-stream and it continues). | [nuxt-backend/src/convex/integrations/ai.ts:164](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L164) |
| <a id="httphandler"></a> `httpHandler` | `PublicHttpAction` | The stream endpoint for `registerBackendRoutes({ ai })` (POST + CORS preflight). | [nuxt-backend/src/convex/integrations/ai.ts:169](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L169) |
| <a id="corsorigin"></a> `corsOrigin` | `string` | CORS headers for the stream route (used by `registerBackendRoutes`). | [nuxt-backend/src/convex/integrations/ai.ts:171](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L171) |

## Functions

### setupAi()

```ts
function setupAi(components, config): Ai;
```

Defined in: [nuxt-backend/src/convex/integrations/ai.ts:190](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L190)

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
