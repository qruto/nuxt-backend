---
navigation: true
---

# convex/integrations/billing

## Interfaces

### CatalogCreditGrant

Defined in: [nuxt-backend/src/convex/catalog.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L19)

A credit grant a plan or pack carries (a provider meter-credit benefit).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter"></a> `meter` | `string` | The catalog meter key the credits land on. | [nuxt-backend/src/convex/catalog.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L21) |
| <a id="units"></a> `units` | `number` | Units granted (per cycle for plans, once for packs). | [nuxt-backend/src/convex/catalog.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L23) |
| <a id="rollover"></a> `rollover?` | `boolean` | Carry unused credits into the next cycle. Defaults to `false` for plan grants (use-it-or-lose-it monthly allowances) and `true` for packs (purchased credits keep). | [nuxt-backend/src/convex/catalog.ts:29](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L29) |

***

### CatalogMeter

Defined in: [nuxt-backend/src/convex/catalog.ts:33](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L33)

A usage meter, keyed by the event name spends use (`spendCredits({ meter })`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="aggregation"></a> `aggregation?` | `"count"` \| `"sum"` | How events aggregate: `'sum'` (default) sums `property` across events — multi-credit spends in one event; `'count'` counts events (1 credit per event, not refundable). | [nuxt-backend/src/convex/catalog.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L39) |
| <a id="property"></a> `property?` | `string` | The metadata property summed by `'sum'` meters. Default `'amount'`. | [nuxt-backend/src/convex/catalog.ts:41](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L41) |
| <a id="eventname"></a> `eventName?` | `string` | Event name the meter filters on. Defaults to the catalog key. | [nuxt-backend/src/convex/catalog.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L43) |

***

### CatalogPlan

Defined in: [nuxt-backend/src/convex/catalog.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L47)

A subscription plan (recurring product).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name"></a> `name` | `string` | - | [nuxt-backend/src/convex/catalog.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L48) |
| <a id="description"></a> `description?` | `string` | - | [nuxt-backend/src/convex/catalog.ts:49](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L49) |
| <a id="interval"></a> `interval` | `"month"` \| `"year"` | Billing interval. | [nuxt-backend/src/convex/catalog.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L51) |
| <a id="price"></a> `price` | `number` | Price in cents. | [nuxt-backend/src/convex/catalog.ts:53](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L53) |
| <a id="credits"></a> `credits?` | [`CatalogCreditGrant`](#catalogcreditgrant) | Credits included with the plan, granted every cycle. | [nuxt-backend/src/convex/catalog.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L55) |
| <a id="features"></a> `features?` | `string`[] | Feature-benefit keys (from [BillingCatalog.features](#features-1)) this plan grants. | [nuxt-backend/src/convex/catalog.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L57) |

***

### CatalogPack

Defined in: [nuxt-backend/src/convex/catalog.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L61)

A one-time credit pack.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name-1"></a> `name` | `string` | - | [nuxt-backend/src/convex/catalog.ts:62](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L62) |
| <a id="description-1"></a> `description?` | `string` | - | [nuxt-backend/src/convex/catalog.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L63) |
| <a id="price-1"></a> `price` | `number` | Price in cents. | [nuxt-backend/src/convex/catalog.ts:65](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L65) |
| <a id="credits-1"></a> `credits` | [`CatalogCreditGrant`](#catalogcreditgrant) | Credits granted once at purchase. | [nuxt-backend/src/convex/catalog.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L67) |

***

### CatalogFeature

Defined in: [nuxt-backend/src/convex/catalog.ts:71](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L71)

A feature benefit, gate-checked client-side via `useFeatures().has(key)`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="description-2"></a> `description` | `string` | [nuxt-backend/src/convex/catalog.ts:72](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L72) |

***

### BillingCatalog

Defined in: [nuxt-backend/src/convex/catalog.ts:75](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L75)

Webhook events that signal a customer's plans / benefits / credits may have changed.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meters"></a> `meters?` | `Record`\<`string`, [`CatalogMeter`](#catalogmeter)\> | [nuxt-backend/src/convex/catalog.ts:76](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L76) |
| <a id="plans"></a> `plans?` | `Record`\<`string`, [`CatalogPlan`](#catalogplan)\> | [nuxt-backend/src/convex/catalog.ts:77](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L77) |
| <a id="packs"></a> `packs?` | `Record`\<`string`, [`CatalogPack`](#catalogpack)\> | [nuxt-backend/src/convex/catalog.ts:78](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L78) |
| <a id="features-1"></a> `features?` | `Record`\<`string`, [`CatalogFeature`](#catalogfeature)\> | [nuxt-backend/src/convex/catalog.ts:79](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L79) |

***

### BillingRateLimiter

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:59](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L59)

A structural rate limiter for throttling `syncEntitlements` — satisfied by
`setupRateLimiter(...)` from `nuxt-backend/rate-limit`, which seeds the
`billingSync` limit by default. Kept structural (rather than importing the
rate-limiter's own type) so any compatible limiter is assignable.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<\{ `ok`: `boolean`; `retryAfter?`: `number`; \}\> | [nuxt-backend/src/convex/integrations/billing.ts:60](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L60) |

***

### EntitlementBenefit

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:80](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L80)

A single granted benefit (entitlement) in a customer's billing state.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:81](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L81) |
| <a id="benefitid"></a> `benefitId` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:82](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L82) |
| <a id="type"></a> `type` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L83) |
| <a id="metadata"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | The benefit's **live** provider metadata (read from the benefit, not the grant-time snapshot in customer state). Lets consumers feature-gate by a friendly key — set e.g. `{ key: 'premium' }` on the benefit and check `useFeatures().has('premium')`. | [nuxt-backend/src/convex/integrations/billing.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L90) |

***

### EntitlementMeter

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:94](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L94)

A credit-meter balance in a customer's billing state (prepaid credits).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meterid"></a> `meterId` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:95](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L95) |
| <a id="consumedunits"></a> `consumedUnits` | `number` | [nuxt-backend/src/convex/integrations/billing.ts:96](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L96) |
| <a id="creditedunits"></a> `creditedUnits` | `number` | [nuxt-backend/src/convex/integrations/billing.ts:97](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L97) |
| <a id="balance"></a> `balance` | `number` | [nuxt-backend/src/convex/integrations/billing.ts:98](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L98) |

***

### CustomerEntitlements

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:105](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L105)

A user's full billing entitlement state — active plans, granted benefits, and
credit-meter balances — normalized for caching into the reactive component table.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="customerid"></a> `customerId` | `string` \| `null` | [nuxt-backend/src/convex/integrations/billing.ts:106](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L106) |
| <a id="activeproductids"></a> `activeProductIds` | `string`[] | [nuxt-backend/src/convex/integrations/billing.ts:107](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L107) |
| <a id="benefits"></a> `benefits` | [`EntitlementBenefit`](#entitlementbenefit)[] | [nuxt-backend/src/convex/integrations/billing.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L108) |
| <a id="meters-1"></a> `meters` | [`EntitlementMeter`](#entitlementmeter)[] | [nuxt-backend/src/convex/integrations/billing.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L109) |

***

### CreditMeterConfig

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:118](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L118)

A named credit meter: how a spend by friendly name (`meter: 'credits'`)
resolves to the provider meter and its ingestion shape. Declared in
`setupBilling({ credits })` or generated into `billing.generated.ts` by
`nuxt-backend billing sync`.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meterid-1"></a> `meterId` | `string` | The provider meter id the balance guard runs against. | [nuxt-backend/src/convex/integrations/billing.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L120) |
| <a id="eventname-1"></a> `eventName?` | `string` | Event name the meter's filter matches. Defaults to the config key. | [nuxt-backend/src/convex/integrations/billing.ts:122](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L122) |
| <a id="property-1"></a> `property?` | `string` | For sum-aggregation meters: the metadata property carrying the amount — ingested as `metadata[property] = value`. Omit for count meters (which count events, so each spend is exactly 1 credit). | [nuxt-backend/src/convex/integrations/billing.ts:128](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L128) |

***

### BillingCatalogIds

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:132](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L132)

The environment-keyed id map `nuxt-backend billing sync` generates.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="products"></a> `products?` | `Record`\<`string`, `string`\> | Catalog key → provider product id (plans and packs). | [nuxt-backend/src/convex/integrations/billing.ts:134](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L134) |
| <a id="meters-2"></a> `meters?` | `Record`\<`string`, [`CreditMeterConfig`](#creditmeterconfig)\> | Catalog key → credit meter config. | [nuxt-backend/src/convex/integrations/billing.ts:136](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L136) |

***

### SpendCreditsEvent

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:140](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L140)

A prepaid-credit consumption event (drawn from the customer's meter balance).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="userid"></a> `userId?` | `string` | The billing entity id — the workspace id (`billTo: 'organization'`, the default) or the auth user id (`billTo: 'user'`). Omit to resolve it from the caller's identity (the active workspace / signed-in user). | [nuxt-backend/src/convex/integrations/billing.ts:146](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L146) |
| <a id="meter-1"></a> `meter?` | `string` | A configured credit meter name (`setupBilling({ credits })` / catalog key) — the preferred spend target: resolves the meter id, event name, and ingestion shape in one word. | [nuxt-backend/src/convex/integrations/billing.ts:152](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L152) |
| <a id="name-2"></a> `name?` | `string` | The meter event name. Defaults to the configured meter's `eventName`/key. | [nuxt-backend/src/convex/integrations/billing.ts:154](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L154) |
| <a id="meterid-2"></a> `meterId?` | `string` | A raw credit meter id to guard against (escape hatch when no named meter config exists). When a meter resolves (by `meter` or `meterId`), the spend is **reserved** against the cached balance first and **blocked** (throws) if it is below `value` — keeping credits strictly prepaid (never billed as overage). The reservation settles after the provider event ingests, or releases on failure, so a failed run never consumes credits. | [nuxt-backend/src/convex/integrations/billing.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L163) |
| <a id="value"></a> `value?` | `number` | Credits required for this spend (default `1`). | [nuxt-backend/src/convex/integrations/billing.ts:165](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L165) |
| <a id="metadata-1"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Event properties used by the meter's aggregation/filter. | [nuxt-backend/src/convex/integrations/billing.ts:167](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L167) |
| <a id="externalid"></a> `externalId?` | `string` | Idempotency key to prevent double-counting (defaults to a random UUID). | [nuxt-backend/src/convex/integrations/billing.ts:169](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L169) |
| <a id="timestamp"></a> `timestamp?` | `Date` | Event time (defaults to now). | [nuxt-backend/src/convex/integrations/billing.ts:171](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L171) |

***

### SpendReservation

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:179](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L179)

A credit reservation's addressing data — serializable, so a spend can
reserve in one function and settle/release in another (the streaming HTTP
dispatcher does exactly that).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="entityid"></a> `entityId` | `string` | The billing entity the spend belongs to. | [nuxt-backend/src/convex/integrations/billing.ts:181](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L181) |
| <a id="externalid-1"></a> `externalId` | `string` | Idempotency key shared by the reservation and the provider event. | [nuxt-backend/src/convex/integrations/billing.ts:183](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L183) |
| <a id="reserved"></a> `reserved` | `boolean` | Whether a meter guard actually reserved cached balance. | [nuxt-backend/src/convex/integrations/billing.ts:185](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L185) |
| <a id="meter-2"></a> `meter?` | `string` | The configured meter name (when reserved via one). | [nuxt-backend/src/convex/integrations/billing.ts:187](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L187) |
| <a id="meterid-3"></a> `meterId?` | `string` | The raw meter id (when reserved). | [nuxt-backend/src/convex/integrations/billing.ts:189](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L189) |
| <a id="value-1"></a> `value` | `number` | Credits reserved. | [nuxt-backend/src/convex/integrations/billing.ts:191](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L191) |

***

### RefundCreditsEvent

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:195](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L195)

A prepaid-credit refund (compensating event on a sum meter).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="userid-1"></a> `userId?` | `string` | The billing entity id; omit to resolve from the caller's identity. | [nuxt-backend/src/convex/integrations/billing.ts:197](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L197) |
| <a id="meter-3"></a> `meter` | `string` | The configured credit meter name to refund on (must be a sum meter). | [nuxt-backend/src/convex/integrations/billing.ts:199](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L199) |
| <a id="value-2"></a> `value` | `number` | Credits to give back. | [nuxt-backend/src/convex/integrations/billing.ts:201](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L201) |
| <a id="metadata-2"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Extra event properties. | [nuxt-backend/src/convex/integrations/billing.ts:203](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L203) |
| <a id="externalid-2"></a> `externalId?` | `string` | Idempotency key (defaults to a random UUID). | [nuxt-backend/src/convex/integrations/billing.ts:205](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L205) |

***

### GiftRecord

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:215](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L215)

A gift purchase record, as stored by the `backend` component
(`components.backend.gifts.*`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:216](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L216) |
| <a id="recipientemail"></a> `recipientEmail` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:217](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L217) |
| <a id="purchaseruserid"></a> `purchaserUserId` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:218](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L218) |
| <a id="purchaseremail"></a> `purchaserEmail?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:219](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L219) |
| <a id="purchasername"></a> `purchaserName?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:220](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L220) |
| <a id="productids"></a> `productIds` | `string`[] | - | [nuxt-backend/src/convex/integrations/billing.ts:221](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L221) |
| <a id="message"></a> `message?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:222](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L222) |
| <a id="status"></a> `status` | `string` | `'pending'` (checkout created) → `'paid'` (order webhook) → `'claimed'`. | [nuxt-backend/src/convex/integrations/billing.ts:224](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L224) |
| <a id="billingcustomerid"></a> `billingCustomerId` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:225](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L225) |
| <a id="billingorderid"></a> `billingOrderId?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:226](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L226) |
| <a id="claimedbyuserid"></a> `claimedByUserId?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:227](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L227) |
| <a id="claimedentityid"></a> `claimedEntityId?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:228](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L228) |
| <a id="createdat"></a> `createdAt` | `number` | - | [nuxt-backend/src/convex/integrations/billing.ts:229](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L229) |
| <a id="paidat"></a> `paidAt?` | `number` | - | [nuxt-backend/src/convex/integrations/billing.ts:230](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L230) |
| <a id="claimedat"></a> `claimedAt?` | `number` | - | [nuxt-backend/src/convex/integrations/billing.ts:231](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L231) |

***

### GiftEmailMessage

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:235](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L235)

The gift-notification email built by [SetupBillingConfig.giftEmail](#setupbillingconfig).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:236](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L236) |
| <a id="subject"></a> `subject` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:237](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L237) |
| <a id="html"></a> `html?` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:238](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L238) |
| <a id="text"></a> `text?` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:239](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L239) |

***

### GiftEmailData

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:243](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L243)

The data available to the gift-notification email template.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="recipientemail-1"></a> `recipientEmail` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:244](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L244) |
| <a id="purchasername-1"></a> `purchaserName?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:245](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L245) |
| <a id="purchaseremail-1"></a> `purchaserEmail?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:246](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L246) |
| <a id="message-1"></a> `message?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:247](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L247) |
| <a id="claimurl"></a> `claimUrl` | `string` | The app URL where the recipient signs in (or up) to receive the gift. | [nuxt-backend/src/convex/integrations/billing.ts:249](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L249) |

***

### BillingComponents

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:262](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L262)

The component handles `setupBilling` reads from your generated `components`
object. Pass the whole object — each key is picked structurally:

- `polar` — the upstream billing-provider component (checkout / portal /
  webhooks / customer mapping).
- `backend` — the package's all-in-one component: `billing` is the reactive
  entitlement cache, `gifts` the gift-purchase records, and `email` (optional)
  delivers gift notifications.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="polar"></a> `polar` | `ComponentApi` | [nuxt-backend/src/convex/integrations/billing.ts:263](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L263) |
| <a id="backend"></a> `backend` | \{ `billing`: \{ `getByUser`: `FunctionReference`\<`"query"`, `"internal"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\>; `upsert`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\>; `userByCustomer`: `FunctionReference`\<`"query"`, `"internal"`, \{ `customerId`: `string`; \}, `string` \| `null`\>; `debit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; \}, \{ `ok`: `boolean`; `balance`: `number`; `reason?`: `"no-row"` \| `"no-meter"` \| `"insufficient"`; \}\>; `settle`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `release`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `credit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; \}, `null`\>; `getBenefitMetadata`: `FunctionReference`\<`"query"`, `"internal"`, \{ `benefitIds`: `string`[]; \}, \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `updatedAt`: `number`; \}[]\>; `upsertBenefitMetadata`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `entries`: \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; \}[]; \}, `null`\>; \}; `gifts`: \{ `create`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\>; `markPaid`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\>; `markNotified`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; \}, `boolean`\>; `markClaimed`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\>; `listByEmail`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\>; `resolveRecipient`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\>; \}; `email?`: \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](/api-reference/reference/convex/integrations/email#sendemailoptions), `string` \| `null`\>; \}; `webhooks?`: `WebhookLogRefs`; \} | [nuxt-backend/src/convex/integrations/billing.ts:264](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L264) |
| `backend.billing` | \{ `getByUser`: `FunctionReference`\<`"query"`, `"internal"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\>; `upsert`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\>; `userByCustomer`: `FunctionReference`\<`"query"`, `"internal"`, \{ `customerId`: `string`; \}, `string` \| `null`\>; `debit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; \}, \{ `ok`: `boolean`; `balance`: `number`; `reason?`: `"no-row"` \| `"no-meter"` \| `"insufficient"`; \}\>; `settle`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `release`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `credit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; \}, `null`\>; `getBenefitMetadata`: `FunctionReference`\<`"query"`, `"internal"`, \{ `benefitIds`: `string`[]; \}, \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `updatedAt`: `number`; \}[]\>; `upsertBenefitMetadata`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `entries`: \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; \}[]; \}, `null`\>; \} | [nuxt-backend/src/convex/integrations/billing.ts:268](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L268) |
| `backend.billing.getByUser` | `FunctionReference`\<`"query"`, `"internal"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:269](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L269) |
| `backend.billing.upsert` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:270](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L270) |
| `backend.billing.userByCustomer` | `FunctionReference`\<`"query"`, `"internal"`, \{ `customerId`: `string`; \}, `string` \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:277](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L277) |
| `backend.billing.debit` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; \}, \{ `ok`: `boolean`; `balance`: `number`; `reason?`: `"no-row"` \| `"no-meter"` \| `"insufficient"`; \}\> | [nuxt-backend/src/convex/integrations/billing.ts:278](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L278) |
| `backend.billing.settle` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:284](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L284) |
| `backend.billing.release` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:285](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L285) |
| `backend.billing.credit` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:286](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L286) |
| `backend.billing.getBenefitMetadata` | `FunctionReference`\<`"query"`, `"internal"`, \{ `benefitIds`: `string`[]; \}, \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `updatedAt`: `number`; \}[]\> | [nuxt-backend/src/convex/integrations/billing.ts:287](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L287) |
| `backend.billing.upsertBenefitMetadata` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `entries`: \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; \}[]; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:292](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L292) |
| `backend.gifts` | \{ `create`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\>; `markPaid`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\>; `markNotified`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; \}, `boolean`\>; `markClaimed`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\>; `listByEmail`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\>; `resolveRecipient`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\>; \} | [nuxt-backend/src/convex/integrations/billing.ts:296](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L296) |
| `backend.gifts.create` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\> | [nuxt-backend/src/convex/integrations/billing.ts:297](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L297) |
| `backend.gifts.markPaid` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:306](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L306) |
| `backend.gifts.markNotified` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; \}, `boolean`\> | [nuxt-backend/src/convex/integrations/billing.ts:307](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L307) |
| `backend.gifts.markClaimed` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:308](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L308) |
| `backend.gifts.listByEmail` | `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\> | [nuxt-backend/src/convex/integrations/billing.ts:309](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L309) |
| `backend.gifts.get` | `FunctionReference`\<`"query"`, `"internal"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:310](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L310) |
| `backend.gifts.resolveRecipient` | `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:311](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L311) |
| `backend.email?` | \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](/api-reference/reference/convex/integrations/email#sendemailoptions), `string` \| `null`\>; \} | [nuxt-backend/src/convex/integrations/billing.ts:313](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L313) |
| `backend.email.send` | `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](/api-reference/reference/convex/integrations/email#sendemailoptions), `string` \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:314](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L314) |
| `backend.webhooks?` | `WebhookLogRefs` | [nuxt-backend/src/convex/integrations/billing.ts:316](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L316) |

***

### Billing

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:546](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L546)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="provider"></a> `provider` | `Polar` | The underlying billing-provider component client (an advanced escape hatch — use `provider.polar` for the raw SDK). Needed by `registerBackendRoutes` to mount the webhook. | [nuxt-backend/src/convex/integrations/billing.ts:552](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L552) |
| <a id="api"></a> `api` | `Omit`\<\{ `changeCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `productId`: `string`; \}, `Promise`\<`void`\>\>; `cancelCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `revokeImmediately?`: `boolean`; \}, `Promise`\<`void`\>\>; `getConfiguredProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ \[`key`: `string`\]: \| \{ `benefits?`: \{ `createdAt`: ...; `deletable`: ...; `description`: ...; `id`: ...; `metadata?`: ...; `modifiedAt`: ...; `organizationId`: ...; `properties?`: ...; `selectable`: ...; `type`: ...; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: ... \| ...; `checksumSha256Base64`: ... \| ...; `checksumSha256Hex`: ... \| ...; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: ... \| ...; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: ... \| ...; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: ... \| ...; `version`: ... \| ...; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: ... \| ...; `capAmount?`: ... \| ... \| ...; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: ... \| ... \| ...; `meter?`: ... \| ...; `meterId?`: ... \| ...; `minimumAmount?`: ... \| ... \| ...; `modifiedAt`: ... \| ...; `presetAmount?`: ... \| ... \| ...; `priceAmount?`: ... \| ...; `priceCurrency?`: ... \| ...; `productId`: `string`; `recurringInterval?`: ... \| ... \| ...; `seatTiers?`: ... \| ...; `source?`: ... \| ...; `type?`: ... \| ...; `unitAmount?`: ... \| ...; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `undefined`; \}\>\>; `listAllProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: ... \| ...; `modifiedAt`: ... \| ...; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: ...; `name`: ...; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: ...[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \}[]\>\>; `listAllSubscriptions`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `amount`: `number` \| `null`; `cancelAtPeriodEnd`: `boolean`; `canceledAt?`: `string` \| `null`; `checkoutId`: `string` \| `null`; `createdAt`: `string`; `currency`: `string` \| `null`; `currentPeriodEnd`: `string` \| `null`; `currentPeriodStart`: `string`; `customFieldData?`: `Record`\<`string`, `any`\>; `customerCancellationComment?`: `string` \| `null`; `customerCancellationReason?`: `string` \| `null`; `customerId`: `string`; `discountId?`: `string` \| `null`; `endedAt`: `string` \| `null`; `endsAt?`: `string` \| `null`; `id`: `string`; `metadata`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `priceId?`: `string`; `product`: \| \{ `benefits?`: ...[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: ...; `checksumSha256Base64`: ...; `checksumSha256Hex`: ...; `createdAt`: ...; `id`: ...; `isUploaded`: ...; `lastModifiedAt`: ...; `mimeType`: ...; `name`: ...; `organizationId`: ...; `path`: ...; `publicUrl`: ...; `service?`: ...; `size`: ...; `sizeReadable`: ...; `storageVersion`: ...; `version`: ...; \}[]; `metadata?`: `Record`\<..., ...\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `prices`: \{ `amountType?`: ...; `capAmount?`: ...; `createdAt`: ...; `id`: ...; `isArchived`: ...; `maximumAmount?`: ...; `meter?`: ...; `meterId?`: ...; `minimumAmount?`: ...; `modifiedAt`: ...; `presetAmount?`: ...; `priceAmount?`: ...; `priceCurrency?`: ...; `productId`: ...; `recurringInterval?`: ...; `seatTiers?`: ...; `source?`: ...; `type?`: ...; `unitAmount?`: ...; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `null`; `productId`: `string`; `recurringInterval`: `string` \| `null`; `recurringIntervalCount?`: `number`; `seats?`: `number` \| `null`; `startedAt`: `string` \| `null`; `status`: `string`; `trialEnd?`: `string` \| `null`; `trialStart?`: `string` \| `null`; \}[]\>\>; `generateCheckoutLink`: `RegisteredAction`\<`"public"`, \{ `metadata?`: `Record`\<`string`, `string`\>; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; `subscriptionId?`: `string`; `locale?`: `string`; `productIds`: `string`[]; `origin`: `string`; `successUrl`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; `generateCustomerPortalUrl`: `RegisteredAction`\<`"public"`, \{ `returnUrl?`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; \}, `"listAllSubscriptions"`\> & \{ `listAllSubscriptions`: `RegisteredQuery`\<`"public"`\>; `giftCheckout`: `RegisteredAction`\<`"public"`\>; \} | The ready-made checkout / portal / subscription functions to re-export from your Convex module (the result of the provider's `api()`), plus `giftCheckout`. `listAllSubscriptions` is wrapped to resolve the billing entity like the reactive reads do — it returns `null` instead of throwing for claimless callers (signed out, or the auth-handshake / reconnect window reactive queries subscribe in). | [nuxt-backend/src/convex/integrations/billing.ts:561](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L561) |
| <a id="functions"></a> `functions` | \{ `getCurrentSubscription`: `RegisteredQuery`\<`"public"`\>; `getFeatures`: `RegisteredQuery`\<`"public"`\>; `getCredits`: `RegisteredQuery`\<`"public"`\>; `syncEntitlements`: `RegisteredAction`\<`"public"`\>; `syncProducts`: `RegisteredAction`\<`"public"`\>; `getReceivedGifts`: `RegisteredQuery`\<`"public"`\>; `claimGift`: `RegisteredAction`\<`"public"`\>; `getWebhookDeliveries`: `RegisteredQuery`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `billing.ts` so `useBilling` / `useFeatures` / `useCredits` / `useGifts` work with zero hand-wiring: the reactive current-subscription, feature-gating and credit-balance queries, a `syncEntitlements` action to refresh the cache after checkout / top-up, a `syncProducts` action to pull the provider's product catalog into the reactive products table (fresh deployments render empty pricing until it runs once — webhooks keep it fresh afterwards), and the gift queries/claim action. | [nuxt-backend/src/convex/integrations/billing.ts:575](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L575) |
| `functions.getCurrentSubscription` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:576](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L576) |
| `functions.getFeatures` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:577](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L577) |
| `functions.getCredits` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:578](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L578) |
| `functions.syncEntitlements` | `RegisteredAction`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:579](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L579) |
| `functions.syncProducts` | `RegisteredAction`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:580](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L580) |
| `functions.getReceivedGifts` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:581](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L581) |
| `functions.claimGift` | `RegisteredAction`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:582](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L582) |
| `functions.getWebhookDeliveries` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:583](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L583) |
| <a id="webhookevents"></a> `webhookEvents` | [`BillingWebhookEventHandlers`](#billingwebhookeventhandlers) | Typed billing webhook handlers for `registerBackendRoutes` (mounted at `/billing/events`) that keep the reactive cache fresh (subscriptions, benefit grants, credit balances) and fulfil paid gifts. | [nuxt-backend/src/convex/integrations/billing.ts:590](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L590) |
| <a id="webhookhandler"></a> `webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | The guarded `/billing/events` endpoint `registerBackendRoutes` mounts: fail-closed (503 while the secret is unset, 413 over the size cap, 403 on bad signatures across the rotation list, 200 on redeliveries of processed ids, 202 for authentic-but-unknown types) with every delivery outcome recorded in the component's ring buffer. | [nuxt-backend/src/convex/integrations/billing.ts:598](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L598) |
| <a id="getcustomerstate"></a> `getCustomerState` | (`ctx`, `args`) => `Promise`\<[`CustomerEntitlements`](#customerentitlements)\> | Resolve a user's full billing entitlement state (active plans, benefits, and credit-meter balances) live from the provider. Call from an **action**; the ready-made `syncEntitlements` already caches the result for you. | [nuxt-backend/src/convex/integrations/billing.ts:604](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L604) |
| <a id="spendcredits"></a> `spendCredits` | (`ctx`, `event`) => `Promise`\<`void`\> | Spend prepaid credits — call from your own **server** action when a metered feature is used. The billing entity (workspace or user, per `billTo`) resolves from the caller's identity; pass `userId` to spend for a specific entity. With a configured `meter` (or raw `meterId`), the spend reserves against the cached balance atomically (strictly prepaid — two concurrent spends can never both pass), ingests the provider event, then settles; a failed run releases the reservation and consumes nothing. | [nuxt-backend/src/convex/integrations/billing.ts:614](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L614) |
| <a id="refundcredits"></a> `refundCredits` | (`ctx`, `event`) => `Promise`\<`void`\> | Give credits back on a **sum** meter (compensating negative-value event + optimistic cache re-credit). Count meters cannot be refunded. | [nuxt-backend/src/convex/integrations/billing.ts:619](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L619) |
| <a id="reservecredits"></a> `reserveCredits` | (`ctx`, `event`) => `Promise`\<[`SpendReservation`](#spendreservation)\> | The reserve step of a spend, alone — for flows that run work between the guard and the charge (`setupAi().meteredAction` / streaming). Atomically reserves against the cached balance (throws when insufficient) and returns serializable addressing data for [Billing.settleSpend](#settlespend) / [Billing.releaseSpend](#releasespend). `allowRefresh: false` skips the cold-cache self-heal (required from mutation contexts — the refresh fetches). | [nuxt-backend/src/convex/integrations/billing.ts:628](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L628) |
| <a id="settlespend"></a> `settleSpend` | (`ctx`, `reservation`, `options?`) => `Promise`\<`void`\> | Ingest the provider event for a reservation and finalize the spend. | [nuxt-backend/src/convex/integrations/billing.ts:630](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L630) |
| <a id="releasespend"></a> `releaseSpend` | (`ctx`, `reservation`) => `Promise`\<`void`\> | Undo a reservation whose work failed — nothing is charged. | [nuxt-backend/src/convex/integrations/billing.ts:632](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L632) |
| <a id="resolveentity"></a> `resolveEntity` | (`ctx`) => `Promise`\< \| \{ `userId`: `string`; `email`: `string`; \} \| `null`\> | Resolve the billing entity from the caller's identity claims — the active workspace (`billTo: 'organization'`) or the signed-in user. `null` when signed out. | [nuxt-backend/src/convex/integrations/billing.ts:638](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L638) |
| <a id="creatediscount"></a> `createDiscount` | (`discount`) => `Promise`\<\{ `id`: `string`; `code`: `string` \| `null`; \}\> | Create a discount / coupon (provider `discounts.create`). Call from an **action**. Accepts the full discount-create shape (fixed or percentage). | [nuxt-backend/src/convex/integrations/billing.ts:643](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L643) |

## Type Aliases

### DiscountInput

```ts
type DiscountInput = Parameters<typeof discountsCreate>[1];
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:70](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L70)

Full discount-create payload (derived from the provider SDK) — fixed or percentage.

***

### BillingWebhookEventHandlers

```ts
type BillingWebhookEventHandlers = WebhookEventHandlers;
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:77](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L77)

Per-event billing webhook handlers, keyed by the provider's event names
(`'order.paid'`, `'subscription.active'`, …). Service-neutral alias for the
shape `registerBackendRoutes` mounts at `/billing/events`.

***

### SetupBillingConfig

```ts
type SetupBillingConfig = Omit<PolarConfig, "getUserInfo" | "organizationToken" | "server" | "webhookSecret"> & {
  accessToken?: string;
  environment?: "sandbox" | "production";
  webhookSecret?: string;
  billTo?: "organization" | "user";
  getUserInfo?: PolarConfig["getUserInfo"];
  currentUserId?: (ctx) => Promise<string | null>;
  rateLimiter?: BillingRateLimiter;
  events?: Partial<BillingWebhookEventHandlers>;
  giftEmail?: (data) => GiftEmailMessage;
  credits?: Record<string, CreditMeterConfig>;
  catalog?: Partial<Record<"sandbox" | "production", BillingCatalogIds | undefined>>;
  benefitMetadataTtlMs?: number;
  onUnknownEvent?: (ctx, event) => Promise<void>;
  deliveryLog?: boolean;
};
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:341](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L341)

Billing configuration. Service-neutral at the package boundary: the access
token, environment, and webhook secret default to the required
`BILLING_ACCESS_TOKEN` / `BILLING_ENVIRONMENT` / `BILLING_WEBHOOK_SECRET`
env vars, so `setupBilling(components)` needs no env plumbing. Product maps
and other provider passthrough config are accepted as-is, plus `billTo`.

The billing entity resolves from identity claims out of the box — the
active workspace (`billTo: 'organization'`, the default) or the signed-in
user (`billTo: 'user'`) — so `getUserInfo` / `currentUserId` are optional
overrides, not required wiring.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `accessToken?` | `string` | Provider access token. Defaults to the required `BILLING_ACCESS_TOKEN` env var. | [nuxt-backend/src/convex/integrations/billing.ts:343](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L343) |
| `environment?` | `"sandbox"` \| `"production"` | Provider environment. Defaults to the required `BILLING_ENVIRONMENT` env var (`'sandbox'` otherwise). | [nuxt-backend/src/convex/integrations/billing.ts:345](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L345) |
| `webhookSecret?` | `string` | Webhook signature secret. Defaults to the required `BILLING_WEBHOOK_SECRET` env var. | [nuxt-backend/src/convex/integrations/billing.ts:347](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L347) |
| `billTo?` | `"organization"` \| `"user"` | Who owns subscriptions and credits: the active workspace (`'organization'`, the default — members share the workspace's plan and credits) or the individual user (`'user'`, for B2C apps without shared billing). | [nuxt-backend/src/convex/integrations/billing.ts:353](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L353) |
| `getUserInfo?` | `PolarConfig`\[`"getUserInfo"`\] | Override the billing-entity resolution for **action** contexts (checkout / portal / sync). Only consulted with `billTo: 'user'`; the default reads the signed-in user from identity claims. | [nuxt-backend/src/convex/integrations/billing.ts:359](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L359) |
| `currentUserId()?` | (`ctx`) => `Promise`\<`string` \| `null`\> | Override the billing-entity resolution for **query** contexts (the reactive `getCurrentSubscription` / `getFeatures` / `getCredits` reads). Only consulted with `billTo: 'user'`; the default reads identity claims. Return `null` when signed out so reads degrade gracefully. | [nuxt-backend/src/convex/integrations/billing.ts:366](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L366) |
| `rateLimiter?` | [`BillingRateLimiter`](#billingratelimiter) | Throttle `syncEntitlements` per billing entity. Pass your `setupRateLimiter(...)` limiter and each authenticated sync is checked against the `billingSync` limit (10/min, keyed by the workspace/user), so a caller can't loop it to amplify the live provider fan-out. Omit to leave the action unthrottled. | [nuxt-backend/src/convex/integrations/billing.ts:374](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L374) |
| `events?` | `Partial`\<[`BillingWebhookEventHandlers`](#billingwebhookeventhandlers)\> | React to billing webhook events, keyed by the provider's own event names (`'order.paid'`, `'subscription.active'`, …). Your handler runs **after** the built-in entitlement-cache refresh (and gift fulfilment), so features/credits read fresh inside it. Events outside the built-in refresh set are mounted too. | [nuxt-backend/src/convex/integrations/billing.ts:382](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L382) |
| `giftEmail()?` | (`data`) => [`GiftEmailMessage`](#giftemailmessage) | Restyle the gift-notification email sent to the recipient once their gift is paid. The default is a minimal, dependency-free template linking to `SITE_URL` (where signing in claims the gift automatically). | [nuxt-backend/src/convex/integrations/billing.ts:388](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L388) |
| `credits?` | `Record`\<`string`, [`CreditMeterConfig`](#creditmeterconfig)\> | Named credit meters: spend by friendly name (`spendCredits({ meter: 'credits' })`, `useCredits('credits')`) instead of provider meter ids. Usually supplied via [SetupBillingConfig.catalog](#setupbillingconfig); explicit entries here win. | [nuxt-backend/src/convex/integrations/billing.ts:395](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L395) |
| `catalog?` | `Partial`\<`Record`\<`"sandbox"` \| `"production"`, [`BillingCatalogIds`](#billingcatalogids) \| `undefined`\>\> | The environment-keyed id map generated by `nuxt-backend billing sync` (`backend/billing.generated.ts`): fills `products` and `credits` for the active `BILLING_ENVIRONMENT`, so provider UUIDs live in exactly one generated file. Explicit `products`/`credits` config wins. | [nuxt-backend/src/convex/integrations/billing.ts:402](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L402) |
| `benefitMetadataTtlMs?` | `number` | Maximum age of a cached benefit-metadata snapshot before an entitlement sync re-reads it live (ms, default 15 minutes). The `benefit.updated` webhook patches snapshots immediately regardless. | [nuxt-backend/src/convex/integrations/billing.ts:408](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L408) |
| `onUnknownEvent()?` | (`ctx`, `event`) => `Promise`\<`void`\> | Called for an **authentic** (signature-verified) webhook event whose type this package's provider SDK cannot parse — e.g. an event newer than the installed package. The delivery is acknowledged with 202 either way, so unknown types can never put the endpoint into a retry loop. | [nuxt-backend/src/convex/integrations/billing.ts:415](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L415) |
| `deliveryLog?` | `boolean` | Record every inbound webhook delivery in the component's capped ring buffer (powers redelivery dedupe, doctor's "last webhook received", and the DevTools feed). `false` disables the log — and with it dedupe. | [nuxt-backend/src/convex/integrations/billing.ts:421](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L421) |

## Variables

### BILLING\_WEBHOOK\_PROVISION\_EVENTS

```ts
const BILLING_WEBHOOK_PROVISION_EVENTS: readonly ["checkout.created", "checkout.updated", "checkout.expired", "customer.created", "customer.updated", "customer.deleted", "customer.state_changed", "customer_seat.assigned", "customer_seat.claimed", "customer_seat.revoked", "member.created", "member.updated", "member.deleted", "order.created", "order.updated", "order.paid", "order.refunded", "subscription.created", "subscription.updated", "subscription.active", "subscription.canceled", "subscription.uncanceled", "subscription.revoked", "subscription.past_due", "refund.created", "refund.updated", "product.created", "product.updated", "benefit.created", "benefit.updated", "benefit_grant.created", "benefit_grant.cycled", "benefit_grant.updated", "benefit_grant.revoked", "organization.updated"];
```

Defined in: [nuxt-backend/src/convex/catalog.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L113)

The webhook event set `billing sync --webhook` subscribes the provider
endpoint to: the provider's full live catalog — the composed handler map
covers every one of these (logging, dedupe, consumer dispatch), and
anything newer lands in `onUnknownEvent` with a 202. Lives here —
dependency-free — so the CLI can import it without pulling Convex runtime
code. A unit test pins it against the runtime's refresh set.

***

### BILLING\_REFRESH\_EVENTS

```ts
const BILLING_REFRESH_EVENTS: readonly string[] = REFRESH_EVENTS;
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:449](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L449)

Internal: lets tests pin the provision list against the refresh set.

***

### ALL\_BILLING\_EVENTS

```ts
const ALL_BILLING_EVENTS: readonly ["checkout.created", "checkout.updated", "checkout.expired", "customer.created", "customer.updated", "customer.deleted", "customer.state_changed", "customer_seat.assigned", "customer_seat.claimed", "customer_seat.revoked", "member.created", "member.updated", "member.deleted", "order.created", "order.updated", "order.paid", "order.refunded", "subscription.created", "subscription.updated", "subscription.active", "subscription.canceled", "subscription.uncanceled", "subscription.revoked", "subscription.past_due", "refund.created", "refund.updated", "product.created", "product.updated", "benefit.created", "benefit.updated", "benefit_grant.created", "benefit_grant.cycled", "benefit_grant.updated", "benefit_grant.revoked", "organization.updated", "subscription.paused", "subscription.resumed"];
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:457](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L457)

The provider's full webhook catalog. The composed handler map covers every
one of these, so any verified delivery gets logging, dedupe, and consumer
dispatch — events outside it (a newer provider than this package) land in
`onUnknownEvent` with a 202 instead of an error loop.

## Functions

### defineBillingCatalog()

```ts
function defineBillingCatalog(catalog): BillingCatalog;
```

Defined in: [nuxt-backend/src/convex/catalog.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L101)

Declare the billing catalog (typed identity). Push it with
`npx nuxt-backend billing sync`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `catalog` | [`BillingCatalog`](#billingcatalog) |

#### Returns

[`BillingCatalog`](#billingcatalog)

#### Example

```ts
export default defineBillingCatalog({
  meters: { credits: {} },
  plans: {
    pro: { name: 'Pro', interval: 'month', price: 2900,
      credits: { meter: 'credits', units: 500 }, features: ['priority_support'] },
  },
  packs: {
    credits500: { name: '500 credits', price: 2000, credits: { meter: 'credits', units: 500 } },
  },
  features: { priority_support: { description: 'Priority support' } },
})
```

***

### defaultGiftEmail()

```ts
function defaultGiftEmail(data): GiftEmailMessage;
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:529](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L529)

The packaged default gift-notification email — minimal, dependency-free.
Used when [SetupBillingConfig.giftEmail](#setupbillingconfig) is not supplied; exported so
apps can preview it or build their override on top of it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`GiftEmailData`](#giftemaildata) |

#### Returns

[`GiftEmailMessage`](#giftemailmessage)

***

### setupBilling()

```ts
function setupBilling(components, config?): Billing;
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:676](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L676)

Configure billing for subscriptions, discounts, prepaid credits, and gift
purchases — linked to your auth users and cached reactively inside the
`backend` component (so consumers add nothing to their own schema).

Subscription / feature / credit reads return `null`/empty until the provider
has synced, so a mid-configuration deployment degrades gracefully; checkout /
portal / credit / discount operations need the required
`BILLING_ACCESS_TOKEN` env var.

Billing follows the tenant: with the default `billTo: 'organization'` the
active workspace owns the subscription and credits (every member shares
them); with `billTo: 'user'` each user is their own customer. Either way
the entity resolves from identity claims — zero wiring.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`BillingComponents`](#billingcomponents) |
| `config` | [`SetupBillingConfig`](#setupbillingconfig) |

#### Returns

[`Billing`](#billing)

#### Example

```ts
import { setupBilling } from 'nuxt-backend/billing'
import { components } from './_generated/api'

const billing = setupBilling(components)

export const { provider } = billing
export const { generateCheckoutLink, generateCustomerPortalUrl, giftCheckout } = billing.api
export const {
  getCurrentSubscription, getFeatures, getCredits, syncEntitlements,
  getReceivedGifts, claimGift,
} = billing.functions
```
