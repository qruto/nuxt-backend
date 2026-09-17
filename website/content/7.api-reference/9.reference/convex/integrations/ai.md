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

Defined in: [src/convex/integrations/ai.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L48)

**`Experimental`**

The rate limiter shape `setupAi` consumes — satisfied by a
`setupRateLimiter(...)` instance, which seeds the `ai` and `aiBudget` limits
by default. Typed against the literal default names (the limiter's
conditional rest-tuple signature only resolves for known names — the same
pattern as `BillingRateLimiter`); custom `limit:` names pass through a cast
at the call site.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<\{ `ok`: `boolean`; `retryAfter?`: `number`; \}\> | **`Experimental`** | [src/convex/integrations/ai.ts:49](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L49) |

***

### AiComponents

Defined in: [src/convex/integrations/ai.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L57)

**`Experimental`**

The component handles `setupAi` reads from your generated `components` object.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="backend"></a> `backend` | \{ `ai`: \{ `createRequest`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\>; `getByStream`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\>; `markSettled`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; `markReleased`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; \}; `billing`: \{ `finalize`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `finalAmount?`: `number`; \}, \{ `settled`: `boolean`; `released`: `number`; `balance`: `number`; `balanceBefore`: `number`; `releaseJobId?`: `string`; \}\>; `release`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `attachReleaseJob`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `jobId`: `string`; \}, `null`\>; \}; \} | **`Experimental`** | [src/convex/integrations/ai.ts:58](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L58) |
| `backend.ai` | \{ `createRequest`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\>; `getByStream`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\>; `markSettled`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; `markReleased`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\>; \} | - | [src/convex/integrations/ai.ts:59](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L59) |
| `backend.ai.createRequest` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; \}, `null`\> | - | [src/convex/integrations/ai.ts:60](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L60) |
| `backend.ai.getByStream` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \| \{ `streamId`: `string`; `name`: `string`; `entityId`: `string`; `userId`: `string`; `args`: `string`; `meterId?`: `string`; `cost`: `number`; `externalId`: `string`; `status`: `"reserved"` \| `"settled"` \| `"released"`; `createdAt`: `number`; \} \| `null`\> | - | [src/convex/integrations/ai.ts:70](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L70) |
| `backend.ai.markSettled` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\> | - | [src/convex/integrations/ai.ts:82](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L82) |
| `backend.ai.markReleased` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`\> | - | [src/convex/integrations/ai.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L83) |
| `backend.billing` | \{ `finalize`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `finalAmount?`: `number`; \}, \{ `settled`: `boolean`; `released`: `number`; `balance`: `number`; `balanceBefore`: `number`; `releaseJobId?`: `string`; \}\>; `release`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `attachReleaseJob`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `jobId`: `string`; \}, `null`\>; \} | The entitlement cache's reservation protocol. `setupAi` closes its own spends here rather than through `settleSpend`: only `finalize` can drop a reservation *and* hand back the unspent remainder atomically, and it reports the balance the low-balance hooks read. | [src/convex/integrations/ai.ts:91](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L91) |
| `backend.billing.finalize` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `finalAmount?`: `number`; \}, \{ `settled`: `boolean`; `released`: `number`; `balance`: `number`; `balanceBefore`: `number`; `releaseJobId?`: `string`; \}\> | - | [src/convex/integrations/ai.ts:92](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L92) |
| `backend.billing.release` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\> | - | [src/convex/integrations/ai.ts:103](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L103) |
| `backend.billing.attachReleaseJob` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `jobId`: `string`; \}, `null`\> | - | [src/convex/integrations/ai.ts:104](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L104) |
| <a id="persistenttextstreaming"></a> `persistentTextStreaming` | \{ `lib`: \{ `createStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\>; `addChunk`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\>; `setStreamStatus`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; `getStreamStatus`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\>; `getStreamText`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\>; `deleteStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; \}; \} | **`Experimental`** | [src/convex/integrations/ai.ts:111](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L111) |
| `persistentTextStreaming.lib` | \{ `createStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\>; `addChunk`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\>; `setStreamStatus`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; `getStreamStatus`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\>; `getStreamText`: `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\>; `deleteStream`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\>; \} | - |  |
| `persistentTextStreaming.lib.createStream` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ \}, `string`, `string` \| `undefined`\> | - | node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:1 |
| `persistentTextStreaming.lib.addChunk` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; `text`: `string`; `final`: `boolean`; \}, `null`, `string` \| `undefined`\> | - | node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:2 |
| `persistentTextStreaming.lib.setStreamStatus` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `status`: `string`; `streamId`: `string`; \}, `null`, `string` \| `undefined`\> | - | node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:7 |
| `persistentTextStreaming.lib.getStreamStatus` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, `string`, `string` \| `undefined`\> | - | node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:11 |
| `persistentTextStreaming.lib.getStreamText` | `FunctionReference`\<`"query"`, `"internal"`, \{ `streamId`: `string`; \}, \{ `text`: `string`; `status`: `string`; \}, `string` \| `undefined`\> | - | node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:14 |
| `persistentTextStreaming.lib.deleteStream` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `streamId`: `string`; \}, `null`, `string` \| `undefined`\> | - | node\_modules/@convex-dev/persistent-text-streaming/dist/component/lib.d.ts:20 |

***

### AiBudget

Defined in: [src/convex/integrations/ai.ts:125](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L125)

**`Experimental`**

A per-entity spending cap, enforced through the rate limiter as a fixed
window over spend *value*: each metered call consumes its cost in tokens, so
`{ units: 500, period: DAY }` is "500 credits a day per workspace", not "500
calls a day".

A cap, not a ledger — the window is the limiter's own state, there is no new
table, and (like every rate limit) consumption is never given back: a run
that fails, or finalizes under its estimate, still spent the estimate
against the window. Size the budget with that slack in mind.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="units"></a> `units` | `number` | **`Experimental`** Credits an entity may spend per window. | [src/convex/integrations/ai.ts:127](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L127) |
| <a id="period"></a> `period` | `number` | **`Experimental`** Window length in ms — `HOUR` / `DAY` from `nuxt-backend/rate-limit`. | [src/convex/integrations/ai.ts:129](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L129) |
| <a id="limit-1"></a> `limit?` | `string` | **`Experimental`** The named limit the window is recorded under. Default `'aiBudget'` (see `DEFAULT_LIMITS`); name your own to keep separate budgets per feature. | [src/convex/integrations/ai.ts:134](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L134) |

***

### CreditsBalanceEvent

Defined in: [src/convex/integrations/ai.ts:138](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L138)

**`Experimental`**

What crossed a balance threshold, handed to the low-balance hooks.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="entityid"></a> `entityId` | `string` | **`Experimental`** The billing entity (workspace/user) charged. | [src/convex/integrations/ai.ts:140](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L140) |
| <a id="userid"></a> `userId` | `string` | **`Experimental`** The member whose call spent the credits. | [src/convex/integrations/ai.ts:142](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L142) |
| <a id="meter"></a> `meter?` | `string` | **`Experimental`** The configured meter name, when the spend named one. | [src/convex/integrations/ai.ts:144](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L144) |
| <a id="meterid"></a> `meterId?` | `string` | **`Experimental`** The provider meter id. | [src/convex/integrations/ai.ts:146](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L146) |
| <a id="balance"></a> `balance` | `number` | **`Experimental`** Balance after the spend settled (negative when overage is allowed). | [src/convex/integrations/ai.ts:148](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L148) |
| <a id="previousbalance"></a> `previousBalance` | `number` | **`Experimental`** Balance as of before the spend reserved. | [src/convex/integrations/ai.ts:150](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L150) |
| <a id="spent"></a> `spent` | `number` | **`Experimental`** Credits this spend actually consumed. | [src/convex/integrations/ai.ts:152](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L152) |
| <a id="threshold"></a> `threshold?` | `number` | **`Experimental`** The configured threshold, for `onCreditsLow`. | [src/convex/integrations/ai.ts:154](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L154) |

***

### AiCreditsConfig

Defined in: [src/convex/integrations/ai.ts:166](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L166)

**`Experimental`**

Credit-side reactions to a settled spend.

The threshold lives here — on `setupAi` — rather than in
`appConfig.backend.*`: that is the client-side content layer (labels, plan
copy), and these hooks fire inside a Convex action where no Nuxt app config
exists. Keep them thin: send nothing from here (the lifecycle emails own
that), just record or hand off.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="lowbalancethreshold"></a> `lowBalanceThreshold?` | `number` | **`Experimental`** Fire [onCreditsLow](#oncreditslow) when a settle takes the balance from above this to at or below it. Omit to never fire it. | [src/convex/integrations/ai.ts:171](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L171) |
| <a id="oncreditslow"></a> `onCreditsLow?` | (`ctx`, `event`) => `void` \| `Promise`\<`void`\> | **`Experimental`** The balance just crossed [lowBalanceThreshold](#lowbalancethreshold) downwards. Fires on the crossing only — a second spend that stays below it is silent, so this is safe to wire straight to a notification. | [src/convex/integrations/ai.ts:177](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L177) |
| <a id="oncreditsexhausted"></a> `onCreditsExhausted?` | (`ctx`, `event`) => `void` \| `Promise`\<`void`\> | **`Experimental`** The balance just went from positive to zero-or-below. Same crossing rule. | [src/convex/integrations/ai.ts:179](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L179) |

***

### SetupAiConfig

Defined in: [src/convex/integrations/ai.ts:182](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L182)

**`Experimental`**

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="billing"></a> `billing` | [`Billing`](/api-reference/reference/convex/integrations/billing#billing) | **`Experimental`** The `setupBilling(...)` instance — supplies entity resolution + the credit spend. | [src/convex/integrations/ai.ts:184](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L184) |
| <a id="ratelimiter"></a> `rateLimiter?` | [`AiRateLimiter`](#airatelimiter) | **`Experimental`** Your `setupRateLimiter(...)` instance. Metered actions/streams check their named limit (default `'ai'`) per billing entity before reserving. Omit to leave them unthrottled. | [src/convex/integrations/ai.ts:190](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L190) |
| <a id="cors"></a> `cors?` | \{ `origin?`: `string`; \} | **`Experimental`** CORS origin for the stream endpoint. Defaults to the `SITE_URL` env var. | [src/convex/integrations/ai.ts:192](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L192) |
| `cors.origin?` | `string` | - | [src/convex/integrations/ai.ts:192](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L192) |
| <a id="budget"></a> `budget?` | [`AiBudget`](#aibudget) | **`Experimental`** A per-entity credit budget on top of the call-rate limit. Requires `rateLimiter` (it is enforced through it). | [src/convex/integrations/ai.ts:197](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L197) |
| <a id="credits"></a> `credits?` | [`AiCreditsConfig`](#aicreditsconfig) | **`Experimental`** Low-balance reactions fired after a spend settles. | [src/convex/integrations/ai.ts:199](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L199) |
| <a id="streamtimeout"></a> `streamTimeout?` | `number` \| `false` | **`Experimental`** How long a started stream may hold its reservation before it is released automatically (ms). Default 5 minutes; `false` disables the timer. | [src/convex/integrations/ai.ts:204](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L204) |

***

### MeteredUsage

Defined in: [src/convex/integrations/ai.ts:208](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L208)

**`Experimental`**

Usage details handed to metered handlers (`ctx.usage`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="entityid-1"></a> `entityId` | `string` | **`Experimental`** The billing entity (workspace/user) charged. | [src/convex/integrations/ai.ts:210](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L210) |
| <a id="userid-1"></a> `userId` | `string` | **`Experimental`** The signed-in caller. | [src/convex/integrations/ai.ts:212](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L212) |
| <a id="meter-1"></a> `meter?` | `string` | **`Experimental`** Configured meter name, when metered. | [src/convex/integrations/ai.ts:214](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L214) |
| <a id="cost"></a> `cost` | `number` | **`Experimental`** Credits this call costs — the estimate, for a finalized cost. | [src/convex/integrations/ai.ts:216](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L216) |

***

### FinalizedCost

Defined in: [src/convex/integrations/ai.ts:239](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L239)

**`Experimental`**

A cost that is only known once the work is done: reserve `estimate`, run,
then settle what `finalize` returns and hand the remainder back.

The estimate is the *ceiling* — a final amount above it is clamped down (the
reservation is what made the spend safe against a concurrent one, so
settling beyond it would be a second, unguarded debit). Estimate high.

Requires a sum meter (one with a `property`): the finalized amount rides in
the ingested event's metadata, and a count meter can only ever count 1 per
event.

#### Example

```ts
cost: {
  estimate: 500,
  finalize: result => priceTokens({ model: result.model, ...result.usage }, prices),
}
```

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `PropertyValidators` |
| `Result` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="estimate"></a> `estimate` | `number` \| ((`args`) => `number`) | **`Experimental`** Credits to reserve up front — a number or derived from the args. | [src/convex/integrations/ai.ts:241](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L241) |
| <a id="finalize"></a> `finalize` | (`result`, `usage`) => `number` | **`Experimental`** The credits actually consumed, from what the handler returned. | [src/convex/integrations/ai.ts:243](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L243) |

***

### MeteredActionConfig

Defined in: [src/convex/integrations/ai.ts:252](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L252)

**`Experimental`**

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Args` *extends* `PropertyValidators` | - |
| `Result` | `unknown` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter-2"></a> `meter` | `string` \| `false` | **`Experimental`** The configured credit meter to charge (`setupBilling({ credits })` / catalog key) — or `false` for a rate-limit-only action. | [src/convex/integrations/ai.ts:257](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L257) |
| <a id="cost-1"></a> `cost?` | [`MeteredCost`](#meteredcost)\<`Args`, `Result`\> | **`Experimental`** Credits per call. Default `1`. See [MeteredCost](#meteredcost). | [src/convex/integrations/ai.ts:259](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L259) |
| <a id="limit-2"></a> `limit?` | `string` \| `false` | **`Experimental`** Named rate limit (checked per billing entity via the configured `rateLimiter`). Default `'ai'`; `false` disables the check. | [src/convex/integrations/ai.ts:264](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L264) |
| <a id="allowoverage"></a> `allowOverage?` | `boolean` | **`Experimental`** Let this spend take the balance negative instead of refusing it — for a pay-as-you-go meter with no credit benefit behind it, where every unit is overage the provider invoices at the end of the cycle. | [src/convex/integrations/ai.ts:270](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L270) |
| <a id="charge"></a> `charge?` | `"success"` \| `"start"` | **`Experimental`** When to charge: `'success'` (default) settles after the handler returns — a failed run consumes nothing; `'start'` settles before running, for work that is irrevocably consumed upstream the moment it starts. A finalized cost needs the result, so it only applies to `'success'`. | [src/convex/integrations/ai.ts:277](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L277) |
| <a id="args-3"></a> `args` | `Args` | **`Experimental`** | [src/convex/integrations/ai.ts:278](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L278) |
| <a id="handler"></a> `handler` | (`ctx`, `args`) => `Promise`\<`Result`\> | **`Experimental`** | [src/convex/integrations/ai.ts:279](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L279) |

***

### MeteredStreamConfig

Defined in: [src/convex/integrations/ai.ts:282](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L282)

**`Experimental`**

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Args` *extends* `PropertyValidators` | - |
| `Result` | `unknown` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name"></a> `name` | `string` | **`Experimental`** Registry key — unique per app; the HTTP dispatcher routes by it. | [src/convex/integrations/ai.ts:284](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L284) |
| <a id="meter-3"></a> `meter` | `string` \| `false` | **`Experimental`** The configured credit meter to charge, or `false` for limit-only. | [src/convex/integrations/ai.ts:286](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L286) |
| <a id="cost-2"></a> `cost?` | [`MeteredCost`](#meteredcost)\<`Args`, `Result`\> | **`Experimental`** Credits per stream. Default `1`. A [FinalizedCost](#finalizedcost) prices what the handler *returns* — return the model's token usage from it. | [src/convex/integrations/ai.ts:291](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L291) |
| <a id="limit-3"></a> `limit?` | `string` \| `false` | **`Experimental`** Named rate limit. Default `'ai'`; `false` disables. | [src/convex/integrations/ai.ts:293](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L293) |
| <a id="allowoverage-1"></a> `allowOverage?` | `boolean` | **`Experimental`** Let this spend take the balance negative (pay-as-you-go meters). | [src/convex/integrations/ai.ts:295](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L295) |
| <a id="args-5"></a> `args` | `Args` | **`Experimental`** | [src/convex/integrations/ai.ts:296](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L296) |
| <a id="handler-1"></a> `handler` | (`ctx`, `args`, `stream`) => `Promise`\<`Result`\> | **`Experimental`** Produce the stream: `append(text)` pushes a chunk to the client AND persists it. Credits settle when the handler finishes; an error or disconnect releases them — an interrupted stream never charges. | [src/convex/integrations/ai.ts:302](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L302) |

***

### Ai

Defined in: [src/convex/integrations/ai.ts:309](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L309)

**`Experimental`**

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meteredaction"></a> `meteredAction` | \<`Args`, `Result`\>(`config`) => `RegisteredAction`\<`"public"`\> | **`Experimental`** A drop-in replacement for `action` that rate-limits, reserves prepaid credits, runs your handler, then settles the spend (usage lands in the billing provider as an ingested event). Failed runs release the reservation — nothing charged. **Examples** `export const generate = ai.meteredAction({ meter: 'credits', cost: args => args.long ? 5 : 1, args: { prompt: v.string(), long: v.optional(v.boolean()) }, handler: async (ctx, { prompt }) => runModel(prompt), })` **Token pricing — reserve an estimate, settle the actual usage** `export const generate = ai.meteredAction({ meter: 'credits', cost: { estimate: 200, finalize: result => priceTokens(result.usage, prices), }, args: { prompt: v.string() }, handler: async (ctx, { prompt }) => runModel(prompt), })` | [src/convex/integrations/ai.ts:339](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L339) |
| <a id="stream"></a> `stream` | \<`Args`, `Result`\>(`config`) => \{ `start`: `RegisteredAction`\<`"public"`\>; `body`: `RegisteredQuery`\<`"public"`\>; \} | **`Experimental`** A metered, persisted token stream. Returns `{ start, body }` to re-export from your module — `useAiStream` drives them: `start` reserves credits and creates the stream, the HTTP endpoint (`registerBackendRoutes({ ai })`) runs your handler and streams chunks, `body` serves the persisted text reactively (reload mid-stream and it continues). A started stream that is never delivered (the browser closed before the HTTP call, or it died mid-flight) holds its reservation until the scheduled auto-release hands the credits back — `streamTimeout`. | [src/convex/integrations/ai.ts:351](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L351) |
| <a id="httphandler"></a> `httpHandler` | `PublicHttpAction` | **`Experimental`** The stream endpoint for `registerBackendRoutes({ ai })` (POST + CORS preflight). | [src/convex/integrations/ai.ts:356](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L356) |
| <a id="corsorigin"></a> `corsOrigin` | `string` | **`Experimental`** CORS headers for the stream route (used by `registerBackendRoutes`). | [src/convex/integrations/ai.ts:358](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L358) |

***

### ModelPrice

Defined in: [src/convex/integrations/ai.ts:387](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L387)

**`Experimental`**

What one model charges, in credits per [ModelPrice.per](#per) tokens.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="input"></a> `input` | `number` | **`Experimental`** Credits per block of input (prompt) tokens. | [src/convex/integrations/ai.ts:389](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L389) |
| <a id="output"></a> `output` | `number` | **`Experimental`** Credits per block of output (completion) tokens. | [src/convex/integrations/ai.ts:391](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L391) |
| <a id="cachedinput"></a> `cachedInput?` | `number` | **`Experimental`** Credits per block of cache-read input tokens, when the model prices them separately. Omit and cached tokens are billed as ordinary input. | [src/convex/integrations/ai.ts:396](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L396) |
| <a id="per"></a> `per?` | `number` | **`Experimental`** Tokens each rate covers. Default 1; use `1_000_000` for per-million rates. | [src/convex/integrations/ai.ts:398](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L398) |

***

### TokenUsage

Defined in: [src/convex/integrations/ai.ts:405](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L405)

**`Experimental`**

A model call's token counts, as the SDKs report them.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="model"></a> `model` | `string` | **`Experimental`** The model id — the key looked up in the price table. | [src/convex/integrations/ai.ts:407](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L407) |
| <a id="input-1"></a> `input` | `number` | **`Experimental`** Input (prompt) tokens billed at the full rate. | [src/convex/integrations/ai.ts:409](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L409) |
| <a id="output-1"></a> `output` | `number` | **`Experimental`** Output (completion) tokens. | [src/convex/integrations/ai.ts:411](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L411) |
| <a id="cachedinput-1"></a> `cachedInput?` | `number` | **`Experimental`** Cache-read input tokens, when the model reports them separately. | [src/convex/integrations/ai.ts:413](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L413) |

## Type Aliases

### MeteredCost

```ts
type MeteredCost<Args, Result> = 
  | number
  | ((args) => number)
| FinalizedCost<Args, Result>;
```

Defined in: [src/convex/integrations/ai.ts:247](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L247)

**`Experimental`**

Credits per call: fixed, derived from the args, or estimated then finalized.

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `PropertyValidators` |
| `Result` |

***

### TokenPriceTable

```ts
type TokenPriceTable = Record<string, ModelPrice>;
```

Defined in: [src/convex/integrations/ai.ts:402](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L402)

**`Experimental`**

The app's price list: model id → [ModelPrice](#modelprice).

## Functions

### priceTokens()

```ts
function priceTokens(
   usage, 
   table, 
   options?
): number;
```

Defined in: [src/convex/integrations/ai.ts:437](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L437)

**`Experimental`**

Price a model call in credits from its token usage and a price table the app
owns. No provider knows what a model costs you — rates change weekly and
only your margin decides the credit price — so the table is yours; this is
the arithmetic, pure and testable.

Rates are credits per `per` tokens (default 1). Express per-million pricing
as `per: 1_000_000` on the entry or as a table-wide `options.per`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `usage` | [`TokenUsage`](#tokenusage) |
| `table` | [`TokenPriceTable`](#tokenpricetable) |
| `options` | \{ `per?`: `number`; `round?`: `"up"` \| `"nearest"` \| `"none"`; `minimum?`: `number`; \} |
| `options.per?` | `number` |
| `options.round?` | `"up"` \| `"nearest"` \| `"none"` |
| `options.minimum?` | `number` |

#### Returns

`number`

#### Example

```ts
const prices = {
  'fast-1': { input: 3, output: 15, per: 1_000_000 },
  'deep-1': { input: 15, output: 75, cachedInput: 1.5, per: 1_000_000 },
}
priceTokens({ model: 'fast-1', input: 12_000, output: 800 }, prices) // → 0.048
```

#### Throws

when the model is missing from the table — a silent 0 would be a
revenue leak, and an unpriced model is a deployment mistake worth surfacing.

***

### setupAi()

```ts
function setupAi(components, config): Ai;
```

Defined in: [src/convex/integrations/ai.ts:479](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/ai.ts#L479)

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
