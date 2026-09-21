---
navigation: true
---

# convex/integrations/billing

## Interfaces

### CatalogCreditGrant

Defined in: [src/convex/catalog.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L19)

A credit grant a plan or pack carries (a provider meter-credit benefit).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter"></a> `meter` | `string` | The catalog meter key the credits land on. | [src/convex/catalog.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L21) |
| <a id="units"></a> `units` | `number` | Units granted (per cycle for plans, once for packs). | [src/convex/catalog.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L23) |
| <a id="rollover"></a> `rollover?` | `boolean` | Carry unused credits into the next cycle. Defaults to `false` for plan grants (use-it-or-lose-it monthly allowances) and `true` for packs (purchased credits keep). | [src/convex/catalog.ts:29](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L29) |

***

### CatalogMeter

Defined in: [src/convex/catalog.ts:33](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L33)

A usage meter, keyed by the event name spends use (`spendCredits({ meter })`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="aggregation"></a> `aggregation?` | `"count"` \| `"sum"` | How events aggregate: `'sum'` (default) sums `property` across events — multi-credit spends in one event; `'count'` counts events (1 credit per event, not refundable). | [src/convex/catalog.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L39) |
| <a id="property"></a> `property?` | `string` | The metadata property summed by `'sum'` meters. Default `'amount'`. | [src/convex/catalog.ts:41](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L41) |
| <a id="eventname"></a> `eventName?` | `string` | Event name the meter filters on. Defaults to the catalog key. | [src/convex/catalog.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L43) |

***

### CatalogPlan

Defined in: [src/convex/catalog.ts:98](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L98)

A subscription plan (recurring product).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name"></a> `name` | `string` | - | [src/convex/catalog.ts:99](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L99) |
| <a id="description"></a> `description?` | `string` | - | [src/convex/catalog.ts:100](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L100) |
| <a id="interval"></a> `interval` | `"month"` \| `"year"` | Billing interval. | [src/convex/catalog.ts:102](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L102) |
| <a id="price"></a> `price` | `number` | Price in cents. | [src/convex/catalog.ts:104](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L104) |
| <a id="credits"></a> `credits?` | [`CatalogCreditGrant`](#catalogcreditgrant) | Credits included with the plan, granted every cycle. | [src/convex/catalog.ts:106](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L106) |
| <a id="features"></a> `features?` | `string`[] | Feature-benefit keys (from [BillingCatalog.features](#features-1)) this plan grants. | [src/convex/catalog.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L108) |
| <a id="trial"></a> `trial?` | `CatalogTrial` | Free trial before the first charge. | [src/convex/catalog.ts:110](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L110) |
| <a id="usage"></a> `usage?` | `CatalogUsagePrice`[] | Metered prices charged on top of `price` (pay-as-you-go overage). | [src/convex/catalog.ts:112](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L112) |
| <a id="taxbehavior"></a> `taxBehavior?` | `CatalogTaxBehavior` | Tax treatment of the price. Defaults to the organization's setting. | [src/convex/catalog.ts:114](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L114) |
| <a id="customfields"></a> `customFields?` | `string`[] | Checkout field keys (from [BillingCatalog.customFields](#customfields-2)) to collect. | [src/convex/catalog.ts:116](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L116) |

***

### CatalogPack

Defined in: [src/convex/catalog.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L120)

A one-time credit pack.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name-1"></a> `name` | `string` | - | [src/convex/catalog.ts:121](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L121) |
| <a id="description-1"></a> `description?` | `string` | - | [src/convex/catalog.ts:122](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L122) |
| <a id="price-1"></a> `price` | `number` | Price in cents. | [src/convex/catalog.ts:124](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L124) |
| <a id="credits-1"></a> `credits` | [`CatalogCreditGrant`](#catalogcreditgrant) | Credits granted once at purchase. | [src/convex/catalog.ts:126](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L126) |
| <a id="taxbehavior-1"></a> `taxBehavior?` | `CatalogTaxBehavior` | Tax treatment of the price. Defaults to the organization's setting. | [src/convex/catalog.ts:128](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L128) |
| <a id="customfields-1"></a> `customFields?` | `string`[] | Checkout field keys (from [BillingCatalog.customFields](#customfields-2)) to collect. | [src/convex/catalog.ts:130](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L130) |

***

### CatalogFeature

Defined in: [src/convex/catalog.ts:138](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L138)

A feature benefit, gate-checked client-side via `useFeatures().has(key)`.
Pushed as the provider's native feature-flag benefit; the catalog key rides
along in the benefit metadata, which is what the gate matches on.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="description-2"></a> `description` | `string` | [src/convex/catalog.ts:139](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L139) |

***

### BillingCatalog

Defined in: [src/convex/catalog.ts:142](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L142)

Webhook events that signal a customer's plans / benefits / credits may have changed.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="currency"></a> `currency?` | `string` | ISO 4217 currency every `price` is created in, lowercase (`'usd'`, `'eur'`). Defaults to the organization's default presentment currency, which the provider requires on every product. | [src/convex/catalog.ts:148](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L148) |
| <a id="meters"></a> `meters?` | `Record`\<`string`, [`CatalogMeter`](#catalogmeter)\> | - | [src/convex/catalog.ts:149](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L149) |
| <a id="plans"></a> `plans?` | `Record`\<`string`, [`CatalogPlan`](#catalogplan)\> | - | [src/convex/catalog.ts:150](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L150) |
| <a id="packs"></a> `packs?` | `Record`\<`string`, [`CatalogPack`](#catalogpack)\> | - | [src/convex/catalog.ts:151](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L151) |
| <a id="features-1"></a> `features?` | `Record`\<`string`, [`CatalogFeature`](#catalogfeature)\> | - | [src/convex/catalog.ts:152](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L152) |
| <a id="customfields-2"></a> `customFields?` | `Record`\<`string`, `CatalogCustomField`\> | Checkout fields plans and packs can collect, keyed by catalog key. | [src/convex/catalog.ts:154](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L154) |

***

### BillingRateLimiter

Defined in: [src/convex/integrations/billing.ts:80](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L80)

A structural rate limiter for throttling `syncEntitlements` — satisfied by
`setupRateLimiter(...)` from `nuxt-backend/rate-limit`, which seeds the
`billingSync` limit by default. Kept structural (rather than importing the
rate-limiter's own type) so any compatible limiter is assignable.

#### Methods

##### limit()

```ts
limit(
   ctx, 
   name, 
   options?
): Promise<{
  ok: boolean;
  retryAfter?: number;
}>;
```

Defined in: [src/convex/integrations/billing.ts:84](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L84)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunWriteCtx` |
| `name` | `"billingSync"` |
| `options?` | \{ `key?`: `string`; `throws?`: `boolean`; \} |
| `options.key?` | `string` |
| `options.throws?` | `boolean` |

###### Returns

`Promise`\<\{
  `ok`: `boolean`;
  `retryAfter?`: `number`;
\}\>

***

### SubscriptionTarget

Defined in: [src/convex/integrations/billing.ts:151](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L151)

Shared addressing for the subscription-lifecycle operations.

#### Extended by

- [`UpdateSubscriptionOptions`](#updatesubscriptionoptions)
- [`CancelSubscriptionOptions`](#cancelsubscriptionoptions)
- [`PauseSubscriptionOptions`](#pausesubscriptionoptions)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="subscriptionid"></a> `subscriptionId?` | `string` | Which subscription to act on. Omit for the account's single live subscription — required once SetupBillingConfig.multipleSubscriptions is on and an entity can hold several at once. | [src/convex/integrations/billing.ts:157](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L157) |

***

### UpdateSubscriptionOptions

Defined in: [src/convex/integrations/billing.ts:161](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L161)

Options for [Billing.updateSubscription](#updatesubscription) (upgrade / downgrade).

#### Extends

- [`SubscriptionTarget`](#subscriptiontarget)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-1"></a> `subscriptionId?` | `string` | Which subscription to act on. Omit for the account's single live subscription — required once SetupBillingConfig.multipleSubscriptions is on and an entity can hold several at once. | [`SubscriptionTarget`](#subscriptiontarget).[`subscriptionId`](#subscriptionid) | [src/convex/integrations/billing.ts:157](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L157) |
| <a id="productid"></a> `productId?` | `string` | The product to switch to. | - | [src/convex/integrations/billing.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L163) |
| <a id="proration"></a> `proration?` | [`ProrationBehavior`](#prorationbehavior) | How to settle the mid-period money difference. | - | [src/convex/integrations/billing.ts:165](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L165) |

***

### CancelSubscriptionOptions

Defined in: [src/convex/integrations/billing.ts:169](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L169)

Options for [Billing.cancelSubscription](#cancelsubscription).

#### Extends

- [`SubscriptionTarget`](#subscriptiontarget)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-2"></a> `subscriptionId?` | `string` | Which subscription to act on. Omit for the account's single live subscription — required once SetupBillingConfig.multipleSubscriptions is on and an entity can hold several at once. | [`SubscriptionTarget`](#subscriptiontarget).[`subscriptionId`](#subscriptionid) | [src/convex/integrations/billing.ts:157](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L157) |
| <a id="atperiodend"></a> `atPeriodEnd?` | `boolean` | Keep the subscription running until the period it is paid for ends (default). `false` revokes it immediately — benefits are withdrawn on the spot and the remainder is not refunded. | - | [src/convex/integrations/billing.ts:175](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L175) |
| <a id="reason"></a> `reason?` | [`CancellationReason`](#cancellationreason) | The customer's own churn reason. | - | [src/convex/integrations/billing.ts:177](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L177) |
| <a id="comment"></a> `comment?` | `string` | The customer's own words. Never an internal note — they can read it back. | - | [src/convex/integrations/billing.ts:179](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L179) |

***

### PauseSubscriptionOptions

Defined in: [src/convex/integrations/billing.ts:183](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L183)

Options for [Billing.pauseSubscription](#pausesubscription).

#### Extends

- [`SubscriptionTarget`](#subscriptiontarget)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-3"></a> `subscriptionId?` | `string` | Which subscription to act on. Omit for the account's single live subscription — required once SetupBillingConfig.multipleSubscriptions is on and an entity can hold several at once. | [`SubscriptionTarget`](#subscriptiontarget).[`subscriptionId`](#subscriptionid) | [src/convex/integrations/billing.ts:157](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L157) |
| <a id="resumesat"></a> `resumesAt?` | `Date` | When the paused subscription resumes by itself (must be after the current period ends). Omit to pause until it is resumed by hand. | - | [src/convex/integrations/billing.ts:188](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L188) |

***

### OrdersOptions

Defined in: [src/convex/integrations/billing.ts:206](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L206)

Options for [Billing.getOrders](#getorders).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="limit-1"></a> `limit?` | `number` | Orders per page (1–100, default 10). | [src/convex/integrations/billing.ts:208](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L208) |
| <a id="cursor"></a> `cursor?` | `string` | An opaque page token from a previous page's `nextCursor`. | [src/convex/integrations/billing.ts:210](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L210) |
| <a id="page"></a> `page?` | `number` | The provider's 1-based page number — the raw form of `cursor`. | [src/convex/integrations/billing.ts:212](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L212) |

***

### BillingPage

Defined in: [src/convex/integrations/billing.ts:236](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L236)

A page of provider records, plus the token that reads the next one.

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="items"></a> `items` | `Item`[] | - | [src/convex/integrations/billing.ts:237](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L237) |
| <a id="pagination"></a> `pagination` | \{ `totalCount`: `number`; `maxPage`: `number`; \} | - | [src/convex/integrations/billing.ts:238](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L238) |
| `pagination.totalCount` | `number` | - | [src/convex/integrations/billing.ts:238](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L238) |
| `pagination.maxPage` | `number` | - | [src/convex/integrations/billing.ts:238](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L238) |
| <a id="nextcursor"></a> `nextCursor?` | `string` | Pass back as `cursor` to read the next page; absent on the last one. | [src/convex/integrations/billing.ts:240](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L240) |

***

### UsageHistoryOptions

Defined in: [src/convex/integrations/billing.ts:244](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L244)

Options for [Billing.getUsageHistory](#getusagehistory).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter-1"></a> `meter?` | `string` | Which meter's consumption to read: a configured credit-meter name (`'credits'`) or a raw meter id. Omit for every ingested event on the account. | [src/convex/integrations/billing.ts:250](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L250) |
| <a id="limit-2"></a> `limit?` | `number` | Events per page (1–100, default 10). | [src/convex/integrations/billing.ts:252](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L252) |
| <a id="cursor-1"></a> `cursor?` | `string` | An opaque page token from a previous page's `nextCursor`. | [src/convex/integrations/billing.ts:254](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L254) |
| <a id="page-1"></a> `page?` | `number` | The provider's 1-based page number — the raw form of `cursor`. | [src/convex/integrations/billing.ts:256](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L256) |
| <a id="starttimestamp"></a> `startTimestamp?` | `Date` | Only events at or after this moment. | [src/convex/integrations/billing.ts:258](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L258) |
| <a id="endtimestamp"></a> `endTimestamp?` | `Date` | Only events at or before this moment. | [src/convex/integrations/billing.ts:260](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L260) |

***

### RefundOrderOptions

Defined in: [src/convex/integrations/billing.ts:279](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L279)

Options for [Billing.refundOrder](#refundorder).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="orderid"></a> `orderId` | `string` | - | [src/convex/integrations/billing.ts:280](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L280) |
| <a id="amount"></a> `amount?` | `number` | Amount to refund in the currency's minor unit (cents). Omit to refund everything still refundable on the order. | [src/convex/integrations/billing.ts:285](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L285) |
| <a id="reason-1"></a> `reason` | [`RefundReason`](#refundreason) | - | [src/convex/integrations/billing.ts:286](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L286) |
| <a id="revokebenefits"></a> `revokeBenefits?` | `boolean` | Withdraw the order's benefits as well. The provider only allows this for one-time purchases — a subscription's benefits are withdrawn when the subscription itself is revoked. | [src/convex/integrations/billing.ts:292](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L292) |
| <a id="metadata"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Extra key-value data stored on the refund. | [src/convex/integrations/billing.ts:294](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L294) |

***

### RefundRecord

Defined in: [src/convex/integrations/billing.ts:298](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L298)

The outcome of [Billing.refundOrder](#refundorder), JSON-normalized.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [src/convex/integrations/billing.ts:299](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L299) |
| <a id="orderid-1"></a> `orderId` | `string` | - | [src/convex/integrations/billing.ts:300](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L300) |
| <a id="status"></a> `status` | `string` | - | [src/convex/integrations/billing.ts:301](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L301) |
| <a id="reason-2"></a> `reason` | `string` | - | [src/convex/integrations/billing.ts:302](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L302) |
| <a id="amount-1"></a> `amount` | `number` | Refunded amount in the currency's minor unit (cents). | [src/convex/integrations/billing.ts:304](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L304) |
| <a id="currency-1"></a> `currency` | `string` | - | [src/convex/integrations/billing.ts:305](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L305) |
| <a id="revokebenefits-1"></a> `revokeBenefits` | `boolean` | - | [src/convex/integrations/billing.ts:306](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L306) |

***

### DiscountListOptions

Defined in: [src/convex/integrations/billing.ts:310](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L310)

Filters for [BillingDiscounts.list](#list).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="query"></a> `query?` | `string` | Match against the discount's name. | [src/convex/integrations/billing.ts:312](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L312) |
| <a id="limit-3"></a> `limit?` | `number` | Discounts per page (1–100, default 10). | [src/convex/integrations/billing.ts:314](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L314) |
| <a id="page-2"></a> `page?` | `number` | The provider's 1-based page number. | [src/convex/integrations/billing.ts:316](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L316) |

***

### BillingDiscounts

Defined in: [src/convex/integrations/billing.ts:325](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L325)

Discount (coupon) management. Privileged by design — a public action that
mints discounts would let anyone create a 100%-off code — so these are
server-side methods, not registered functions: call them from an
`internalAction` or an admin-tier action of your own.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="create"></a> `create` | (`discount`) => `Promise`\<\{ `id`: `string`; `code`: `string` \| `null`; \}\> | Create a discount / coupon. Accepts the full provider shape (fixed or percentage). | [src/convex/integrations/billing.ts:327](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L327) |
| <a id="list"></a> `list` | (`options?`) => `Promise`\<[`BillingPage`](#billingpage)\<`Discount`\>\> | List discounts (newest provider order), one page at a time. | [src/convex/integrations/billing.ts:329](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L329) |
| <a id="remove"></a> `remove` | (`discountId`) => `Promise`\<`void`\> | Permanently delete a discount. Redemptions already applied stay applied. | [src/convex/integrations/billing.ts:331](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L331) |

***

### CheckoutPrefill

Defined in: [src/convex/integrations/billing.ts:338](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L338)

Pre-filled customer details for a checkout session. Every field is only a
default the customer can still change — the provider owns the form.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name-2"></a> `name?` | `string` | - | [src/convex/integrations/billing.ts:339](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L339) |
| <a id="email"></a> `email?` | `string` | - | [src/convex/integrations/billing.ts:340](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L340) |
| <a id="billingname"></a> `billingName?` | `string` | The name that should appear on the invoice, when it differs from `name`. | [src/convex/integrations/billing.ts:342](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L342) |
| <a id="billingaddress"></a> `billingAddress?` | \{ `country`: `string`; `line1?`: `string`; `line2?`: `string`; `postalCode?`: `string`; `city?`: `string`; `state?`: `string`; \} | - | [src/convex/integrations/billing.ts:343](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L343) |
| `billingAddress.country` | `string` | ISO 3166-1 alpha-2 country code — the one field the provider requires. | [src/convex/integrations/billing.ts:345](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L345) |
| `billingAddress.line1?` | `string` | - | [src/convex/integrations/billing.ts:346](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L346) |
| `billingAddress.line2?` | `string` | - | [src/convex/integrations/billing.ts:347](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L347) |
| `billingAddress.postalCode?` | `string` | - | [src/convex/integrations/billing.ts:348](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L348) |
| `billingAddress.city?` | `string` | - | [src/convex/integrations/billing.ts:349](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L349) |
| `billingAddress.state?` | `string` | - | [src/convex/integrations/billing.ts:350](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L350) |
| <a id="taxid"></a> `taxId?` | `string` | VAT / tax identification number. | [src/convex/integrations/billing.ts:353](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L353) |
| <a id="business"></a> `business?` | `boolean` | Bill a business rather than an individual. Turning this on makes the provider require a full billing address and billing name. | [src/convex/integrations/billing.ts:358](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L358) |

***

### EntitlementBenefit

Defined in: [src/convex/integrations/billing.ts:411](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L411)

A single granted benefit (entitlement) in a customer's billing state.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | - | [src/convex/integrations/billing.ts:412](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L412) |
| <a id="benefitid"></a> `benefitId` | `string` | - | [src/convex/integrations/billing.ts:413](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L413) |
| <a id="type"></a> `type` | `string` | - | [src/convex/integrations/billing.ts:414](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L414) |
| <a id="metadata-2"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | The benefit's **live** provider metadata (read from the benefit, not the grant-time snapshot in customer state). Lets consumers feature-gate by a friendly key — set e.g. `{ key: 'premium' }` on the benefit and check `useFeatures().has('premium')`. | [src/convex/integrations/billing.ts:421](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L421) |

***

### EntitlementMeter

Defined in: [src/convex/integrations/billing.ts:425](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L425)

A credit-meter balance in a customer's billing state (prepaid credits).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meterid"></a> `meterId` | `string` | - | [src/convex/integrations/billing.ts:426](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L426) |
| <a id="consumedunits"></a> `consumedUnits` | `number` | - | [src/convex/integrations/billing.ts:427](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L427) |
| <a id="creditedunits"></a> `creditedUnits` | `number` | - | [src/convex/integrations/billing.ts:428](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L428) |
| <a id="balance"></a> `balance` | `number` | - | [src/convex/integrations/billing.ts:429](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L429) |
| <a id="cyclestart"></a> `cycleStart?` | `number` | The granting subscription's current period (epoch ms) — a meter has no period of its own in the provider's model. Absent for meters granted only by one-time credit packs. | [src/convex/integrations/billing.ts:435](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L435) |
| <a id="cycleend"></a> `cycleEnd?` | `number` | - | [src/convex/integrations/billing.ts:436](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L436) |
| <a id="rollover-1"></a> `rollover?` | `boolean` | Whether unspent credited units carry into the next cycle. | [src/convex/integrations/billing.ts:438](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L438) |

***

### CustomerEntitlements

Defined in: [src/convex/integrations/billing.ts:445](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L445)

A user's full billing entitlement state — active plans, granted benefits, and
credit-meter balances — normalized for caching into the reactive component table.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="customerid"></a> `customerId` | `string` \| `null` | [src/convex/integrations/billing.ts:446](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L446) |
| <a id="activeproductids"></a> `activeProductIds` | `string`[] | [src/convex/integrations/billing.ts:447](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L447) |
| <a id="benefits"></a> `benefits` | [`EntitlementBenefit`](#entitlementbenefit)[] | [src/convex/integrations/billing.ts:448](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L448) |
| <a id="meters-1"></a> `meters` | [`EntitlementMeter`](#entitlementmeter)[] | [src/convex/integrations/billing.ts:449](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L449) |

***

### CreditMeterConfig

Defined in: [src/convex/integrations/billing.ts:458](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L458)

A named credit meter: how a spend by friendly name (`meter: 'credits'`)
resolves to the provider meter and its ingestion shape. Declared in
`setupBilling({ credits })` or generated into `billing.generated.ts` by
`nuxt-backend billing sync`.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meterid-1"></a> `meterId` | `string` | The provider meter id the balance guard runs against. | [src/convex/integrations/billing.ts:460](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L460) |
| <a id="eventname-1"></a> `eventName?` | `string` | Event name the meter's filter matches. Defaults to the config key. | [src/convex/integrations/billing.ts:462](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L462) |
| <a id="property-1"></a> `property?` | `string` | For sum-aggregation meters: the metadata property carrying the amount — ingested as `metadata[property] = value`. Omit for count meters (which count events, so each spend is exactly 1 credit). | [src/convex/integrations/billing.ts:468](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L468) |

***

### BillingCatalogIds

Defined in: [src/convex/integrations/billing.ts:472](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L472)

The environment-keyed id map `nuxt-backend billing sync` generates.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="products"></a> `products?` | `Record`\<`string`, `string`\> | Catalog key → provider product id (plans and packs). | [src/convex/integrations/billing.ts:474](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L474) |
| <a id="meters-2"></a> `meters?` | `Record`\<`string`, [`CreditMeterConfig`](#creditmeterconfig)\> | Catalog key → credit meter config. | [src/convex/integrations/billing.ts:476](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L476) |

***

### SpendCreditsEvent

Defined in: [src/convex/integrations/billing.ts:480](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L480)

A prepaid-credit consumption event (drawn from the customer's meter balance).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="userid"></a> `userId?` | `string` | The billing entity id — the workspace id (`billTo: 'organization'`, the default) or the auth user id (`billTo: 'user'`). Omit to resolve it from the caller's identity (the active workspace / signed-in user). | [src/convex/integrations/billing.ts:486](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L486) |
| <a id="meter-2"></a> `meter?` | `string` | A configured credit meter name (`setupBilling({ credits })` / catalog key) — the preferred spend target: resolves the meter id, event name, and ingestion shape in one word. | [src/convex/integrations/billing.ts:492](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L492) |
| <a id="name-3"></a> `name?` | `string` | The meter event name. Defaults to the configured meter's `eventName`/key. | [src/convex/integrations/billing.ts:494](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L494) |
| <a id="meterid-2"></a> `meterId?` | `string` | A raw credit meter id to guard against (escape hatch when no named meter config exists). When a meter resolves (by `meter` or `meterId`), the spend is **reserved** against the cached balance first and **blocked** (throws) if it is below `value` — keeping credits strictly prepaid (never billed as overage). The reservation settles after the provider event ingests, or releases on failure, so a failed run never consumes credits. | [src/convex/integrations/billing.ts:503](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L503) |
| <a id="value"></a> `value?` | `number` | Credits required for this spend (default `1`). | [src/convex/integrations/billing.ts:505](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L505) |
| <a id="allowoverage"></a> `allowOverage?` | `boolean` | Let the balance go negative instead of refusing the spend — the pay-as-you-go case: the meter has no credit benefit behind it, so every unit is overage the provider invoices at the end of the cycle. Off by default: credits stay strictly prepaid. | [src/convex/integrations/billing.ts:512](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L512) |
| <a id="metadata-3"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Event properties used by the meter's aggregation/filter. | [src/convex/integrations/billing.ts:514](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L514) |
| <a id="externalid"></a> `externalId?` | `string` | Idempotency key to prevent double-counting (defaults to a random UUID). | [src/convex/integrations/billing.ts:516](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L516) |
| <a id="timestamp"></a> `timestamp?` | `Date` | Event time (defaults to now). | [src/convex/integrations/billing.ts:518](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L518) |

***

### SpendReservation

Defined in: [src/convex/integrations/billing.ts:526](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L526)

A credit reservation's addressing data — serializable, so a spend can
reserve in one function and settle/release in another (the streaming HTTP
dispatcher does exactly that).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="entityid"></a> `entityId` | `string` | The billing entity the spend belongs to. | [src/convex/integrations/billing.ts:528](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L528) |
| <a id="externalid-1"></a> `externalId` | `string` | Idempotency key shared by the reservation and the provider event. | [src/convex/integrations/billing.ts:530](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L530) |
| <a id="reserved"></a> `reserved` | `boolean` | Whether a meter guard actually reserved cached balance. | [src/convex/integrations/billing.ts:532](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L532) |
| <a id="meter-3"></a> `meter?` | `string` | The configured meter name (when reserved via one). | [src/convex/integrations/billing.ts:534](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L534) |
| <a id="meterid-3"></a> `meterId?` | `string` | The raw meter id (when reserved). | [src/convex/integrations/billing.ts:536](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L536) |
| <a id="value-1"></a> `value` | `number` | Credits reserved. | [src/convex/integrations/billing.ts:538](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L538) |

***

### RefundCreditsEvent

Defined in: [src/convex/integrations/billing.ts:542](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L542)

A prepaid-credit refund (compensating event on a sum meter).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="userid-1"></a> `userId?` | `string` | The billing entity id; omit to resolve from the caller's identity. | [src/convex/integrations/billing.ts:544](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L544) |
| <a id="meter-4"></a> `meter` | `string` | The configured credit meter name to refund on (must be a sum meter). | [src/convex/integrations/billing.ts:546](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L546) |
| <a id="value-2"></a> `value` | `number` | Credits to give back. | [src/convex/integrations/billing.ts:548](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L548) |
| <a id="metadata-4"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Extra event properties. | [src/convex/integrations/billing.ts:550](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L550) |
| <a id="externalid-2"></a> `externalId?` | `string` | Idempotency key (defaults to a random UUID). | [src/convex/integrations/billing.ts:552](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L552) |

***

### GiftRecord

Defined in: [src/convex/integrations/billing.ts:562](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L562)

A gift purchase record, as stored by the `backend` component
(`components.backend.gifts.*`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-2"></a> `id` | `string` | - | [src/convex/integrations/billing.ts:563](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L563) |
| <a id="recipientemail"></a> `recipientEmail` | `string` | - | [src/convex/integrations/billing.ts:564](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L564) |
| <a id="purchaseruserid"></a> `purchaserUserId` | `string` | - | [src/convex/integrations/billing.ts:565](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L565) |
| <a id="purchaseremail"></a> `purchaserEmail?` | `string` | - | [src/convex/integrations/billing.ts:566](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L566) |
| <a id="purchasername"></a> `purchaserName?` | `string` | - | [src/convex/integrations/billing.ts:567](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L567) |
| <a id="productids-1"></a> `productIds` | `string`[] | - | [src/convex/integrations/billing.ts:568](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L568) |
| <a id="message"></a> `message?` | `string` | - | [src/convex/integrations/billing.ts:569](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L569) |
| <a id="status-1"></a> `status` | `string` | `'pending'` (checkout created) → `'paid'` (order webhook) → `'claimed'`. | [src/convex/integrations/billing.ts:571](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L571) |
| <a id="billingcustomerid"></a> `billingCustomerId` | `string` | - | [src/convex/integrations/billing.ts:572](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L572) |
| <a id="billingorderid"></a> `billingOrderId?` | `string` | - | [src/convex/integrations/billing.ts:573](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L573) |
| <a id="claimedbyuserid"></a> `claimedByUserId?` | `string` | - | [src/convex/integrations/billing.ts:574](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L574) |
| <a id="claimedentityid"></a> `claimedEntityId?` | `string` | - | [src/convex/integrations/billing.ts:575](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L575) |
| <a id="createdat"></a> `createdAt` | `number` | - | [src/convex/integrations/billing.ts:576](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L576) |
| <a id="paidat"></a> `paidAt?` | `number` | - | [src/convex/integrations/billing.ts:577](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L577) |
| <a id="claimedat"></a> `claimedAt?` | `number` | - | [src/convex/integrations/billing.ts:578](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L578) |

***

### GiftEmailMessage

Defined in: [src/convex/integrations/billing.ts:582](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L582)

The gift-notification email built by SetupBillingConfig.giftEmail.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` | [src/convex/integrations/billing.ts:583](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L583) |
| <a id="subject"></a> `subject` | `string` | [src/convex/integrations/billing.ts:584](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L584) |
| <a id="html"></a> `html?` | `string` | [src/convex/integrations/billing.ts:585](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L585) |
| <a id="text"></a> `text?` | `string` | [src/convex/integrations/billing.ts:586](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L586) |

***

### GiftEmailData

Defined in: [src/convex/integrations/billing.ts:590](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L590)

The data available to the gift-notification email template.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="recipientemail-1"></a> `recipientEmail` | `string` | - | [src/convex/integrations/billing.ts:591](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L591) |
| <a id="purchasername-1"></a> `purchaserName?` | `string` | - | [src/convex/integrations/billing.ts:592](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L592) |
| <a id="purchaseremail-1"></a> `purchaserEmail?` | `string` | - | [src/convex/integrations/billing.ts:593](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L593) |
| <a id="message-1"></a> `message?` | `string` | - | [src/convex/integrations/billing.ts:594](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L594) |
| <a id="claimurl"></a> `claimUrl` | `string` | The app URL where the recipient signs in (or up) to receive the gift. | [src/convex/integrations/billing.ts:596](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L596) |

***

### BillingComponents

Defined in: [src/convex/integrations/billing.ts:609](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L609)

The component handles `setupBilling` reads from your generated `components`
object. Pass the whole object — each key is picked structurally:

- `polar` — the upstream billing-provider component (checkout / portal /
  webhooks / customer mapping).
- `backend` — the package's all-in-one component: `billing` is the reactive
  entitlement cache, `gifts` the gift-purchase records, and `email` (optional)
  delivers gift notifications.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="polar"></a> `polar` | `ComponentApi` | - | [src/convex/integrations/billing.ts:610](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L610) |
| <a id="backend"></a> `backend` | \{ `billing`: \{ `getByUser`: `FunctionReference`\<`"query"`, `"internal"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\>; `upsert`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\>; `userByCustomer`: `FunctionReference`\<`"query"`, `"internal"`, \{ `customerId`: `string`; \}, `string` \| `null`\>; `debit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; `allowOverage?`: `boolean`; \}, \{ `ok`: `boolean`; `balance`: `number`; `reason?`: `"no-row"` \| `"no-meter"` \| `"insufficient"`; \}\>; `settle`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `finalAmount?`: `number`; \}, `null`\>; `release`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `credit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; \}, `null`\>; `clearPendingSpends?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; \}, `null`\>; `deleteByUser?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; \}, `null`\>; `getBenefitMetadata`: `FunctionReference`\<`"query"`, `"internal"`, \{ `benefitIds`: `string`[]; \}, \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `updatedAt`: `number`; \}[]\>; `upsertBenefitMetadata`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `entries`: \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; \}[]; \}, `null`\>; \}; `gifts`: \{ `create`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\>; `markPaid`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\>; `markNotified`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; \}, `boolean`\>; `markClaimed`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\>; `listByEmail`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\>; `resolveRecipient`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\>; \}; `email?`: \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](/api-reference/reference/convex/integrations/email#sendemailoptions), `string` \| `null`\>; \}; `webhooks?`: `WebhookLogRefs`; \} | - | [src/convex/integrations/billing.ts:611](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L611) |
| `backend.billing` | \{ `getByUser`: `FunctionReference`\<`"query"`, `"internal"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\>; `upsert`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\>; `userByCustomer`: `FunctionReference`\<`"query"`, `"internal"`, \{ `customerId`: `string`; \}, `string` \| `null`\>; `debit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; `allowOverage?`: `boolean`; \}, \{ `ok`: `boolean`; `balance`: `number`; `reason?`: `"no-row"` \| `"no-meter"` \| `"insufficient"`; \}\>; `settle`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `finalAmount?`: `number`; \}, `null`\>; `release`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\>; `credit`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; \}, `null`\>; `clearPendingSpends?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; \}, `null`\>; `deleteByUser?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; \}, `null`\>; `getBenefitMetadata`: `FunctionReference`\<`"query"`, `"internal"`, \{ `benefitIds`: `string`[]; \}, \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `updatedAt`: `number`; \}[]\>; `upsertBenefitMetadata`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `entries`: \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; \}[]; \}, `null`\>; \} | - | [src/convex/integrations/billing.ts:615](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L615) |
| `backend.billing.getByUser` | `FunctionReference`\<`"query"`, `"internal"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\> | - | [src/convex/integrations/billing.ts:616](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L616) |
| `backend.billing.upsert` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\> | - | [src/convex/integrations/billing.ts:617](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L617) |
| `backend.billing.userByCustomer` | `FunctionReference`\<`"query"`, `"internal"`, \{ `customerId`: `string`; \}, `string` \| `null`\> | - | [src/convex/integrations/billing.ts:624](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L624) |
| `backend.billing.debit` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; `externalId`: `string`; `allowOverage?`: `boolean`; \}, \{ `ok`: `boolean`; `balance`: `number`; `reason?`: `"no-row"` \| `"no-meter"` \| `"insufficient"`; \}\> | - | [src/convex/integrations/billing.ts:625](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L625) |
| `backend.billing.settle` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; `finalAmount?`: `number`; \}, `null`\> | - | [src/convex/integrations/billing.ts:632](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L632) |
| `backend.billing.release` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `externalId`: `string`; \}, `null`\> | - | [src/convex/integrations/billing.ts:633](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L633) |
| `backend.billing.credit` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; `meterId`: `string`; `amount`: `number`; \}, `null`\> | - | [src/convex/integrations/billing.ts:634](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L634) |
| `backend.billing.clearPendingSpends?` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; \}, `null`\> | Drop every in-flight spend reservation for one entity, without re-crediting: used after a refund, where the provider's balance is already the truth and re-subtracting local reservations would push the cache below it. Optional so an app pinned to an older component build still type-checks — the refund path then just re-syncs. | [src/convex/integrations/billing.ts:642](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L642) |
| `backend.billing.deleteByUser?` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `userId`: `string`; \}, `null`\> | Delete one entity's entitlement cache row (account erasure). Optional so an app pinned to an older component build still type-checks — `billing.forgetEntity` then throws, naming the missing function. | [src/convex/integrations/billing.ts:648](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L648) |
| `backend.billing.getBenefitMetadata` | `FunctionReference`\<`"query"`, `"internal"`, \{ `benefitIds`: `string`[]; \}, \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; `updatedAt`: `number`; \}[]\> | - | [src/convex/integrations/billing.ts:649](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L649) |
| `backend.billing.upsertBenefitMetadata` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `entries`: \{ `benefitId`: `string`; `metadata`: `Record`\<`string`, `string` \| `number` \| `boolean`\>; \}[]; \}, `null`\> | - | [src/convex/integrations/billing.ts:654](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L654) |
| `backend.gifts` | \{ `create`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\>; `markPaid`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\>; `markNotified`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; \}, `boolean`\>; `markClaimed`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\>; `listByEmail`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\>; `resolveRecipient`: `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\>; \} | - | [src/convex/integrations/billing.ts:658](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L658) |
| `backend.gifts.create` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\> | - | [src/convex/integrations/billing.ts:659](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L659) |
| `backend.gifts.markPaid` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\> | - | [src/convex/integrations/billing.ts:668](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L668) |
| `backend.gifts.markNotified` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; \}, `boolean`\> | - | [src/convex/integrations/billing.ts:669](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L669) |
| `backend.gifts.markClaimed` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\> | - | [src/convex/integrations/billing.ts:670](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L670) |
| `backend.gifts.listByEmail` | `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\> | - | [src/convex/integrations/billing.ts:671](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L671) |
| `backend.gifts.get` | `FunctionReference`\<`"query"`, `"internal"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\> | - | [src/convex/integrations/billing.ts:672](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L672) |
| `backend.gifts.resolveRecipient` | `FunctionReference`\<`"query"`, `"internal"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\> | - | [src/convex/integrations/billing.ts:673](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L673) |
| `backend.email?` | \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](/api-reference/reference/convex/integrations/email#sendemailoptions), `string` \| `null`\>; \} | - | [src/convex/integrations/billing.ts:675](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L675) |
| `backend.email.send` | `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](/api-reference/reference/convex/integrations/email#sendemailoptions), `string` \| `null`\> | - | [src/convex/integrations/billing.ts:676](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L676) |
| `backend.webhooks?` | `WebhookLogRefs` | - | [src/convex/integrations/billing.ts:678](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L678) |

***

### Billing

Defined in: [src/convex/integrations/billing.ts:974](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L974)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="provider"></a> `provider` | `Polar` | The underlying billing-provider component client (an advanced escape hatch — use `provider.polar` for the raw SDK). Needed by `registerBackendRoutes` to mount the webhook. | [src/convex/integrations/billing.ts:980](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L980) |
| <a id="api"></a> `api` | `Omit`\<\{ `changeCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `productId`: `string`; \}, `Promise`\<`void`\>\>; `cancelCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `revokeImmediately?`: `boolean`; \}, `Promise`\<`void`\>\>; `getConfiguredProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ \[`key`: `string`\]: \| \{ `benefits?`: \{ `createdAt`: ...; `deletable`: ...; `description`: ...; `id`: ...; `metadata?`: ...; `modifiedAt`: ...; `organizationId`: ...; `properties?`: ...; `selectable`: ...; `type`: ...; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: ... \| ...; `checksumSha256Base64`: ... \| ...; `checksumSha256Hex`: ... \| ...; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: ... \| ...; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: ... \| ...; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: ... \| ...; `version`: ... \| ...; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: ... \| ...; `capAmount?`: ... \| ... \| ...; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: ... \| ... \| ...; `meter?`: ... \| ...; `meterId?`: ... \| ...; `minimumAmount?`: ... \| ... \| ...; `modifiedAt`: ... \| ...; `presetAmount?`: ... \| ... \| ...; `priceAmount?`: ... \| ...; `priceCurrency?`: ... \| ...; `productId`: `string`; `recurringInterval?`: ... \| ... \| ...; `seatTiers?`: ... \| ...; `source?`: ... \| ...; `type?`: ... \| ...; `unitAmount?`: ... \| ...; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `undefined`; \}\>\>; `listAllProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: ... \| ...; `modifiedAt`: ... \| ...; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: ...; `name`: ...; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: ...[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \}[]\>\>; `listAllSubscriptions`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `amount`: `number` \| `null`; `cancelAtPeriodEnd`: `boolean`; `canceledAt?`: `string` \| `null`; `checkoutId`: `string` \| `null`; `createdAt`: `string`; `currency`: `string` \| `null`; `currentPeriodEnd`: `string` \| `null`; `currentPeriodStart`: `string`; `customFieldData?`: `Record`\<`string`, `any`\>; `customerCancellationComment?`: `string` \| `null`; `customerCancellationReason?`: `string` \| `null`; `customerId`: `string`; `discountId?`: `string` \| `null`; `endedAt`: `string` \| `null`; `endsAt?`: `string` \| `null`; `id`: `string`; `metadata`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `priceId?`: `string`; `product`: \| \{ `benefits?`: ...[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: ...; `checksumSha256Base64`: ...; `checksumSha256Hex`: ...; `createdAt`: ...; `id`: ...; `isUploaded`: ...; `lastModifiedAt`: ...; `mimeType`: ...; `name`: ...; `organizationId`: ...; `path`: ...; `publicUrl`: ...; `service?`: ...; `size`: ...; `sizeReadable`: ...; `storageVersion`: ...; `version`: ...; \}[]; `metadata?`: `Record`\<..., ...\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `prices`: \{ `amountType?`: ...; `capAmount?`: ...; `createdAt`: ...; `id`: ...; `isArchived`: ...; `maximumAmount?`: ...; `meter?`: ...; `meterId?`: ...; `minimumAmount?`: ...; `modifiedAt`: ...; `presetAmount?`: ...; `priceAmount?`: ...; `priceCurrency?`: ...; `productId`: ...; `recurringInterval?`: ...; `seatTiers?`: ...; `source?`: ...; `type?`: ...; `unitAmount?`: ...; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `null`; `productId`: `string`; `recurringInterval`: `string` \| `null`; `recurringIntervalCount?`: `number`; `seats?`: `number` \| `null`; `startedAt`: `string` \| `null`; `status`: `string`; `trialEnd?`: `string` \| `null`; `trialStart?`: `string` \| `null`; \}[]\>\>; `generateCheckoutLink`: `RegisteredAction`\<`"public"`, \{ `metadata?`: `Record`\<`string`, `string`\>; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; `subscriptionId?`: `string`; `locale?`: `string`; `productIds`: `string`[]; `origin`: `string`; `successUrl`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; `generateCustomerPortalUrl`: `RegisteredAction`\<`"public"`, \{ `returnUrl?`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; \}, `"listAllSubscriptions"` \| `"generateCheckoutLink"`\> & \{ `listAllSubscriptions`: `RegisteredQuery`\<`"public"`\>; `giftCheckout`: `RegisteredAction`\<`"public"`\>; `generateCheckoutLink`: `RegisteredAction`\<`"public"`, [`CheckoutOptions`](#checkoutoptions), `Promise`\<\{ `url`: `string`; \}\>\>; \} | The ready-made checkout / portal / subscription functions to re-export from your Convex module (the result of the provider's `api()`), plus `giftCheckout`. `listAllSubscriptions` is wrapped to resolve the billing entity like the reactive reads do — it returns `null` instead of throwing for claimless callers (signed out, or the auth-handshake / reconnect window reactive queries subscribe in). `generateCheckoutLink` is replaced by this package's superset (prefill, custom fields, billing address, discount id), and is re-declared here so the scaffold's `export const { generateCheckoutLink } = billing.api` hands the app the wide argument type rather than upstream's narrow one. | [src/convex/integrations/billing.ts:993](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L993) |
| <a id="functions"></a> `functions` | \{ `getCurrentSubscription`: `RegisteredQuery`\<`"public"`\>; `getFeatures`: `RegisteredQuery`\<`"public"`\>; `getCredits`: `RegisteredQuery`\<`"public"`\>; `syncEntitlements`: `RegisteredAction`\<`"public"`\>; `syncProducts`: `RegisteredAction`\<`"public"`\>; `getReceivedGifts`: `RegisteredQuery`\<`"public"`\>; `claimGift`: `RegisteredAction`\<`"public"`\>; `getWebhookDeliveries`: `RegisteredQuery`\<`"public"`\>; `updateSubscription`: `RegisteredAction`\<`"public"`\>; `cancelSubscription`: `RegisteredAction`\<`"public"`\>; `uncancelSubscription`: `RegisteredAction`\<`"public"`\>; `pauseSubscription`: `RegisteredAction`\<`"public"`\>; `resumeSubscription`: `RegisteredAction`\<`"public"`\>; `getOrders`: `RegisteredAction`\<`"public"`\>; `getInvoiceUrl`: `RegisteredAction`\<`"public"`\>; `getUsageHistory`: `RegisteredAction`\<`"public"`\>; `refundOrder`: `RegisteredAction`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `billing.ts` so `useBilling` / `useFeatures` / `useCredits` / `useGifts` work with zero hand-wiring: the reactive current-subscription, feature-gating and credit-balance queries, a `syncEntitlements` action to refresh the cache after checkout / top-up, a `syncProducts` action to pull the provider's product catalog into the reactive products table (fresh deployments render empty pricing until it runs once — webhooks keep it fresh afterwards), and the gift queries/claim action. | [src/convex/integrations/billing.ts:1008](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1008) |
| `functions.getCurrentSubscription` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1009](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1009) |
| `functions.getFeatures` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1010](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1010) |
| `functions.getCredits` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1011](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1011) |
| `functions.syncEntitlements` | `RegisteredAction`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1012](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1012) |
| `functions.syncProducts` | `RegisteredAction`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1013](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1013) |
| `functions.getReceivedGifts` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1014](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1014) |
| `functions.claimGift` | `RegisteredAction`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1015](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1015) |
| `functions.getWebhookDeliveries` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:1016](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1016) |
| `functions.updateSubscription` | `RegisteredAction`\<`"public"`\> | Switch the caller's subscription to another product. | [src/convex/integrations/billing.ts:1018](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1018) |
| `functions.cancelSubscription` | `RegisteredAction`\<`"public"`\> | Cancel at period end (default) or revoke immediately. | [src/convex/integrations/billing.ts:1020](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1020) |
| `functions.uncancelSubscription` | `RegisteredAction`\<`"public"`\> | Undo a scheduled cancellation. | [src/convex/integrations/billing.ts:1022](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1022) |
| `functions.pauseSubscription` | `RegisteredAction`\<`"public"`\> | Pause at period end. | [src/convex/integrations/billing.ts:1024](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1024) |
| `functions.resumeSubscription` | `RegisteredAction`\<`"public"`\> | Resume a paused subscription immediately. | [src/convex/integrations/billing.ts:1026](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1026) |
| `functions.getOrders` | `RegisteredAction`\<`"public"`\> | The caller's order history, read live from the provider. | [src/convex/integrations/billing.ts:1028](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1028) |
| `functions.getInvoiceUrl` | `RegisteredAction`\<`"public"`\> | A signed invoice URL for one of the caller's orders. | [src/convex/integrations/billing.ts:1030](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1030) |
| `functions.getUsageHistory` | `RegisteredAction`\<`"public"`\> | The caller's metered consumption history, read live from the provider. | [src/convex/integrations/billing.ts:1032](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1032) |
| `functions.refundOrder` | `RegisteredAction`\<`"public"`\> | Refund an order — admin-tier (see SetupBillingConfig.requireAdmin). | [src/convex/integrations/billing.ts:1034](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1034) |
| <a id="webhookevents"></a> `webhookEvents` | [`BillingWebhookEventHandlers`](#billingwebhookeventhandlers) | Typed billing webhook handlers for `registerBackendRoutes` (mounted at `/billing/events`) that keep the reactive cache fresh (subscriptions, benefit grants, credit balances) and fulfil paid gifts. | [src/convex/integrations/billing.ts:1041](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1041) |
| <a id="webhookhandler"></a> `webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | The guarded `/billing/events` endpoint `registerBackendRoutes` mounts: fail-closed (503 while the secret is unset, 413 over the size cap, 403 on bad signatures across the rotation list, 200 on redeliveries of processed ids, 202 for authentic-but-unknown types) with every delivery outcome recorded in the component's ring buffer. | [src/convex/integrations/billing.ts:1049](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1049) |
| <a id="getcustomerstate"></a> `getCustomerState` | (`ctx`, `args`) => `Promise`\<[`CustomerEntitlements`](#customerentitlements)\> | Resolve a user's full billing entitlement state (active plans, benefits, and credit-meter balances) live from the provider. Call from an **action**; the ready-made `syncEntitlements` already caches the result for you. | [src/convex/integrations/billing.ts:1055](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1055) |
| <a id="spendcredits"></a> `spendCredits` | (`ctx`, `event`) => `Promise`\<`void`\> | Spend prepaid credits — call from your own **server** action when a metered feature is used. The billing entity (workspace or user, per `billTo`) resolves from the caller's identity; pass `userId` to spend for a specific entity. With a configured `meter` (or raw `meterId`), the spend reserves against the cached balance atomically (strictly prepaid — two concurrent spends can never both pass), ingests the provider event, then settles; a failed run releases the reservation and consumes nothing. | [src/convex/integrations/billing.ts:1065](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1065) |
| <a id="refundcredits"></a> `refundCredits` | (`ctx`, `event`) => `Promise`\<`void`\> | Give credits back on a **sum** meter (compensating negative-value event + optimistic cache re-credit). Count meters cannot be refunded. | [src/convex/integrations/billing.ts:1070](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1070) |
| <a id="reservecredits"></a> `reserveCredits` | (`ctx`, `event`) => `Promise`\<[`SpendReservation`](#spendreservation)\> | The reserve step of a spend, alone — for flows that run work between the guard and the charge (`setupAi().meteredAction` / streaming). Atomically reserves against the cached balance (throws when insufficient) and returns serializable addressing data for [Billing.settleSpend](#settlespend) / [Billing.releaseSpend](#releasespend). `allowRefresh: false` skips the cold-cache self-heal (required from mutation contexts — the refresh fetches). | [src/convex/integrations/billing.ts:1079](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1079) |
| <a id="settlespend"></a> `settleSpend` | (`ctx`, `reservation`, `options?`) => `Promise`\<`void`\> | Ingest the provider event for a reservation and finalize the spend. | [src/convex/integrations/billing.ts:1081](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1081) |
| <a id="releasespend"></a> `releaseSpend` | (`ctx`, `reservation`) => `Promise`\<`void`\> | Undo a reservation whose work failed — nothing is charged. | [src/convex/integrations/billing.ts:1083](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1083) |
| <a id="resolveentity"></a> `resolveEntity` | (`ctx`) => `Promise`\< \| \{ `userId`: `string`; `email`: `string`; \} \| `null`\> | Resolve the billing entity from the caller's identity claims — the active workspace (`billTo: 'organization'`) or the signed-in user. `null` when signed out. | [src/convex/integrations/billing.ts:1089](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1089) |
| <a id="forgetentity"></a> `forgetEntity` | (`ctx`, `userId`) => `Promise`\<`void`\> | Forget a billing entity: drop its cached entitlements (plans, benefits, credit balances, in-flight reservations). The provider's customer record is untouched — this is the app-side erasure step, e.g. from the `onUserDeleted` auth hook with the deleted user's id (`billTo: 'user'`) or a dissolved workspace's id. A no-op for an unknown entity. | [src/convex/integrations/billing.ts:1097](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1097) |
| <a id="discounts"></a> `discounts` | [`BillingDiscounts`](#billingdiscounts) | Discount (coupon) management: `create`, `list`, `remove`. Server-side by design — minting discounts is privileged, so wire it through an `internalAction` or your own admin-tier action. | [src/convex/integrations/billing.ts:1103](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1103) |
| <a id="updatesubscription"></a> `updateSubscription` | (`ctx`, `options?`) => `Promise`\<`Subscription`\> | Switch a subscription to another product (upgrade / downgrade), optionally choosing how the mid-period difference is settled. Call from an **action**; the ready-made `updateSubscription` function does it for the caller. | [src/convex/integrations/billing.ts:1109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1109) |
| <a id="cancelsubscription"></a> `cancelSubscription` | (`ctx`, `options?`) => `Promise`\<`Subscription`\> | Cancel a subscription — at period end by default, immediately with `atPeriodEnd: false`. The reason and comment are the customer's own words and are visible to them. | [src/convex/integrations/billing.ts:1115](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1115) |
| <a id="uncancelsubscription"></a> `uncancelSubscription` | (`ctx`, `options?`) => `Promise`\<`Subscription`\> | Undo a scheduled cancellation, putting the subscription back on renewal. | [src/convex/integrations/billing.ts:1117](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1117) |
| <a id="pausesubscription"></a> `pauseSubscription` | (`ctx`, `options?`) => `Promise`\<`Subscription`\> | Pause a subscription at the end of the current period, optionally with an automatic resume date. Pause/resume are newer than the rest of the lifecycle: the provider's `subscription.paused` / `subscription.resumed` webhooks are known to the installed SDK but not confirmed live here, so entitlement reads treat a paused subscription as still live rather than assuming an event will arrive to say so. | [src/convex/integrations/billing.ts:1128](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1128) |
| <a id="resumesubscription"></a> `resumeSubscription` | (`ctx`, `options?`) => `Promise`\<`Subscription`\> | Resume a paused subscription immediately, starting a new billing period. | [src/convex/integrations/billing.ts:1130](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1130) |
| <a id="getorders"></a> `getOrders` | (`ctx`, `options?`) => `Promise`\<[`BillingPage`](#billingpage)\<[`BillingOrder`](#billingorder)\> \| `null`\> | The billing entity's order history, read **live** from the provider — this package keeps no local order table (that would be a ledger, and the provider already is one). `null` when no access token is configured. | [src/convex/integrations/billing.ts:1136](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1136) |
| <a id="getinvoiceurl"></a> `getInvoiceUrl` | (`ctx`, `orderId`) => `Promise`\< \| \{ `url`: `string`; \} \| `null`\> | A URL to one of the entity's own invoices. `null` when no access token is configured, and `null` while the provider is still generating the PDF (the call asks for generation, then the next call returns the URL). Throws if the order belongs to a different billing account. | [src/convex/integrations/billing.ts:1143](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1143) |
| <a id="getusagehistory"></a> `getUsageHistory` | (`ctx`, `options?`) => `Promise`\<[`BillingPage`](#billingpage)\<[`UsageEvent`](#usageevent)\> \| `null`\> | The billing entity's metered consumption history, read **live** from the provider's events API. There is no local usage ledger by design: the events this package ingests when it spends credits *are* the record, and the provider bills from them. `null` when no access token is configured. | [src/convex/integrations/billing.ts:1150](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1150) |
| <a id="refundorder"></a> `refundOrder` | (`ctx`, `options`) => `Promise`\<[`RefundRecord`](#refundrecord)\> | Refund an order — admin-tier, gated by SetupBillingConfig.requireAdmin. Omit `amount` to refund whatever is still refundable. Credits are **not** reversed here: meter credits come from the provider's own benefit grants, so the refund's `order.refunded` webhook is what reverses them. This package only drops the entity's in-flight spend reservations and re-reads the provider's balance. | [src/convex/integrations/billing.ts:1161](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1161) |

## Type Aliases

### DiscountInput

```ts
type DiscountInput = Parameters<typeof discountsCreate>[1];
```

Defined in: [src/convex/integrations/billing.ts:94](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L94)

Full discount-create payload (derived from the provider SDK) — fixed or percentage.

***

### ProrationBehavior

```ts
type ProrationBehavior = "invoice" | "prorate" | "next_period" | "reset";
```

Defined in: [src/convex/integrations/billing.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L113)

How the provider settles the money difference when a subscription switches
product mid-period (`proration_behavior`). Omit to use the organization's
configured default.

***

### ClientProrationBehavior

```ts
type ClientProrationBehavior = "invoice" | "prorate";
```

Defined in: [src/convex/integrations/billing.ts:124](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L124)

The subset of [ProrationBehavior](#prorationbehavior) a **client** may choose. `invoice`
and `prorate` both settle the difference now; `next_period` and `reset`
hand over the new plan's credits and features immediately while deferring
(or waiving) the charge, so letting a caller pick one is letting them
upgrade themselves for free. Those two stay server-side: pass them from
app code through `billing.updateSubscription(ctx, …)`, or make them the
organization's configured default.

***

### CancellationReason

```ts
type CancellationReason = 
  | "customer_service"
  | "low_quality"
  | "missing_features"
  | "switched_service"
  | "too_complex"
  | "too_expensive"
  | "unused"
  | "other";
```

Defined in: [src/convex/integrations/billing.ts:131](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L131)

The provider's churn-reason enum, recorded with a cancellation. Only set it
when the customer actually told you — it surfaces to them in their purchases
library, so it is their words, not an internal note.

***

### RefundReason

```ts
type RefundReason = 
  | "duplicate"
  | "fraudulent"
  | "customer_request"
  | "service_disruption"
  | "satisfaction_guarantee"
  | "other";
```

Defined in: [src/convex/integrations/billing.ts:142](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L142)

Why an order was refunded (provider `refunds.create` reason).

***

### CurrentSubscriptions

```ts
type CurrentSubscriptions = {
  subscriptions: Record<string, unknown>[];
} & Record<string, unknown>;
```

Defined in: [src/convex/integrations/billing.ts:200](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L200)

What `getCurrentSubscription` returns once
SetupBillingConfig.multipleSubscriptions is on: the array leads,
because with add-ons there is no single "the" subscription. The primary
subscription's own fields are spread alongside it, so single-plan consumers
(`subscription.productId`, `subscription.status`) keep reading exactly as
before. Still `null` when the entity has no live subscription at all — the
"null means free plan" contract never changes.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `subscriptions` | `Record`\<`string`, `unknown`\>[] | Every live subscription, in the provider's order. | [src/convex/integrations/billing.ts:202](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L202) |

***

### BillingOrder

```ts
type BillingOrder = {
  id: string;
  createdAt: string;
  status: string;
  totalAmount: number;
  currency: string;
  paid: boolean;
  invoiceNumber: string | null;
  isInvoiceGenerated: boolean;
} & Record<string, unknown>;
```

Defined in: [src/convex/integrations/billing.ts:221](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L221)

A past charge, normalized for a Convex action's return value: the provider's
`Order` fields with every date rendered as an ISO string (Convex cannot
serialize `Date`). The index signature keeps every other provider field
reachable without a cast.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `id` | `string` | - | [src/convex/integrations/billing.ts:222](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L222) |
| `createdAt` | `string` | - | [src/convex/integrations/billing.ts:223](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L223) |
| `status` | `string` | - | [src/convex/integrations/billing.ts:224](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L224) |
| `totalAmount` | `number` | Amount in the currency's minor unit (cents), after discounts and taxes. | [src/convex/integrations/billing.ts:226](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L226) |
| `currency` | `string` | - | [src/convex/integrations/billing.ts:227](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L227) |
| `paid` | `boolean` | - | [src/convex/integrations/billing.ts:228](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L228) |
| `invoiceNumber` | `string` \| `null` | Assigned when the invoice is finalized; `null` on draft orders. | [src/convex/integrations/billing.ts:230](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L230) |
| `isInvoiceGenerated` | `boolean` | Whether an invoice PDF exists yet — [Billing.getInvoiceUrl](#getinvoiceurl) needs one. | [src/convex/integrations/billing.ts:232](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L232) |

***

### UsageEvent

```ts
type UsageEvent = {
  id: string;
  timestamp: string;
  name: string;
  units?: number;
  metadata?: Record<string, string | number | boolean>;
} & Record<string, unknown>;
```

Defined in: [src/convex/integrations/billing.ts:270](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L270)

One ingested usage event as the provider's events API returns it, normalized
for a Convex action's return value (dates as ISO strings). `units` is
resolved from the meter's value property — the same property a spend ingests
— and is absent when the meter is unknown or counts events rather than
summing a property.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `string` | [src/convex/integrations/billing.ts:271](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L271) |
| `timestamp` | `string` | [src/convex/integrations/billing.ts:272](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L272) |
| `name` | `string` | [src/convex/integrations/billing.ts:273](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L273) |
| `units?` | `number` | [src/convex/integrations/billing.ts:274](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L274) |
| `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | [src/convex/integrations/billing.ts:275](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L275) |

***

### CheckoutOptions

```ts
type CheckoutOptions = {
  productIds: string[];
  origin: string;
  successUrl: string;
  subscriptionId?: string;
  metadata?: Record<string, string>;
  trialInterval?: "day" | "week" | "month" | "year" | null;
  trialIntervalCount?: number | null;
  locale?: string;
  prefill?: CheckoutPrefill;
  customFields?: Record<string, string | number | boolean>;
  requireBillingAddress?: boolean;
  allowDiscountCodes?: boolean;
  discountId?: string;
};
```

Defined in: [src/convex/integrations/billing.ts:368](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L368)

Everything [Billing.api](#api)'s `generateCheckoutLink` accepts. A type
alias rather than an interface so it can type the registered action itself
(Convex's `DefaultFunctionArgs` needs an implicit index signature, which only
aliases get) — that is what makes the wide argument list visible to an app
that re-exports `generateCheckoutLink` from the scaffold.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="productids"></a> `productIds` | `string`[] | - | [src/convex/integrations/billing.ts:369](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L369) |
| <a id="origin"></a> `origin` | `string` | The origin of the page embedding the checkout (for the iframe handshake). | [src/convex/integrations/billing.ts:371](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L371) |
| <a id="successurl"></a> `successUrl` | `string` | - | [src/convex/integrations/billing.ts:372](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L372) |
| <a id="subscriptionid-4"></a> `subscriptionId?` | `string` | Upgrade an existing free subscription instead of starting a new one. | [src/convex/integrations/billing.ts:374](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L374) |
| <a id="metadata-1"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [src/convex/integrations/billing.ts:375](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L375) |
| <a id="trialinterval"></a> `trialInterval?` | `"day"` \| `"week"` \| `"month"` \| `"year"` \| `null` | - | [src/convex/integrations/billing.ts:376](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L376) |
| <a id="trialintervalcount"></a> `trialIntervalCount?` | `number` \| `null` | - | [src/convex/integrations/billing.ts:377](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L377) |
| <a id="locale"></a> `locale?` | `string` | BCP-47 language tag for the checkout UI. | [src/convex/integrations/billing.ts:379](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L379) |
| <a id="prefill"></a> `prefill?` | [`CheckoutPrefill`](#checkoutprefill) | Pre-filled customer details. | [src/convex/integrations/billing.ts:381](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L381) |
| <a id="customfields-3"></a> `customFields?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Values for the organization's custom checkout fields, keyed by field slug. | [src/convex/integrations/billing.ts:383](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L383) |
| <a id="requirebillingaddress"></a> `requireBillingAddress?` | `boolean` | Require the full billing address, not just the country. | [src/convex/integrations/billing.ts:385](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L385) |
| <a id="allowdiscountcodes"></a> `allowDiscountCodes?` | `boolean` | Let the customer type a discount code into the provider's own checkout (default `true`). That is where a customer-entered code belongs: the provider validates it against the live catalog, so this package never has to. | [src/convex/integrations/billing.ts:392](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L392) |
| <a id="discountid"></a> `discountId?` | `string` | Pre-apply a discount by **id** — the only form the provider's checkout payload takes. There is no code→id lookup in the provider's API (its discount list filters by name, not code), so a campaign that knows a code resolves it once with `billing.discounts.list()` and stores the id, rather than making every checkout scan the catalog. | [src/convex/integrations/billing.ts:400](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L400) |

***

### BillingWebhookEventHandlers

```ts
type BillingWebhookEventHandlers = WebhookEventHandlers;
```

Defined in: [src/convex/integrations/billing.ts:408](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L408)

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
  multipleSubscriptions?: boolean;
  requireAdmin?: (ctx) => Promise<void>;
  events?: Partial<BillingWebhookEventHandlers>;
  giftEmail?: (data) => GiftEmailMessage;
  credits?: Record<string, CreditMeterConfig>;
  catalog?: Partial<Record<"sandbox" | "production", BillingCatalogIds | undefined>>;
  benefitMetadataTtlMs?: number;
  onUnknownEvent?: (ctx, event) => Promise<void>;
  deliveryLog?: boolean;
};
```

Defined in: [src/convex/integrations/billing.ts:703](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L703)

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
| `accessToken?` | `string` | Provider access token. Defaults to the required `BILLING_ACCESS_TOKEN` env var. | [src/convex/integrations/billing.ts:705](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L705) |
| `environment?` | `"sandbox"` \| `"production"` | Provider environment. Defaults to the required `BILLING_ENVIRONMENT` env var (`'sandbox'` otherwise). | [src/convex/integrations/billing.ts:707](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L707) |
| `webhookSecret?` | `string` | Webhook signature secret. Defaults to the required `BILLING_WEBHOOK_SECRET` env var. | [src/convex/integrations/billing.ts:709](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L709) |
| `billTo?` | `"organization"` \| `"user"` | Who owns subscriptions and credits: the active workspace (`'organization'`, the default — members share the workspace's plan and credits) or the individual user (`'user'`, for B2C apps without shared billing). | [src/convex/integrations/billing.ts:715](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L715) |
| `getUserInfo?` | `PolarConfig`\[`"getUserInfo"`\] | Override the billing-entity resolution for **action** contexts (checkout / portal / sync). Only consulted with `billTo: 'user'`; the default reads the signed-in user from identity claims. | [src/convex/integrations/billing.ts:721](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L721) |
| `currentUserId()?` | (`ctx`) => `Promise`\<`string` \| `null`\> | Override the billing-entity resolution for **query** contexts (the reactive `getCurrentSubscription` / `getFeatures` / `getCredits` reads). Only consulted with `billTo: 'user'`; the default reads identity claims. Return `null` when signed out so reads degrade gracefully. | [src/convex/integrations/billing.ts:728](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L728) |
| `rateLimiter?` | [`BillingRateLimiter`](#billingratelimiter) | Throttle every client-callable function that reaches the live provider — `syncEntitlements`, `syncProducts`, checkout, the subscription-lifecycle actions, order history and invoices. Pass your `setupRateLimiter(...)` limiter and each authenticated call is checked against the `billingSync` limit (10/min, keyed by the workspace/user), so a caller can't loop one to amplify the provider fan-out. Omit to leave them unthrottled. | [src/convex/integrations/billing.ts:737](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L737) |
| `multipleSubscriptions?` | `boolean` | Let one billing entity hold several live subscriptions at once (a plan plus add-ons, say). The upstream single-subscription read throws the moment a second one exists, so this switches `getCurrentSubscription` to the subscriptions-array-first shape ([CurrentSubscriptions](#currentsubscriptions)) and makes `subscriptionId` the way lifecycle actions pick their target. | [src/convex/integrations/billing.ts:745](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L745) |
| `requireAdmin()?` | (`ctx`) => `Promise`\<`void`\> | Gate the admin-tier billing actions (`refundOrder` — moving real money). Throw from here to refuse. The default requires an `admin` role claim on the caller's identity (the admin plugin's role, carried on the JWT); supply your own to check permissions, a workspace role, or an allowlist. | [src/convex/integrations/billing.ts:752](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L752) |
| `events?` | `Partial`\<[`BillingWebhookEventHandlers`](#billingwebhookeventhandlers)\> | React to billing webhook events, keyed by the provider's own event names (`'order.paid'`, `'subscription.active'`, …). Your handler runs **after** the built-in entitlement-cache refresh (and gift fulfilment), so features/credits read fresh inside it. Events outside the built-in refresh set are mounted too. | [src/convex/integrations/billing.ts:760](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L760) |
| `giftEmail()?` | (`data`) => [`GiftEmailMessage`](#giftemailmessage) | Restyle the gift-notification email sent to the recipient once their gift is paid. The default is a minimal, dependency-free template linking to `SITE_URL` (where signing in claims the gift automatically). | [src/convex/integrations/billing.ts:766](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L766) |
| `credits?` | `Record`\<`string`, [`CreditMeterConfig`](#creditmeterconfig)\> | Named credit meters: spend by friendly name (`spendCredits({ meter: 'credits' })`, `useCredits('credits')`) instead of provider meter ids. Usually supplied via SetupBillingConfig.catalog; explicit entries here win. | [src/convex/integrations/billing.ts:773](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L773) |
| `catalog?` | `Partial`\<`Record`\<`"sandbox"` \| `"production"`, [`BillingCatalogIds`](#billingcatalogids) \| `undefined`\>\> | The environment-keyed id map generated by `nuxt-backend billing sync` (`backend/billing.generated.ts`): fills `products` and `credits` for the active `BILLING_ENVIRONMENT`, so provider UUIDs live in exactly one generated file. Explicit `products`/`credits` config wins. | [src/convex/integrations/billing.ts:780](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L780) |
| `benefitMetadataTtlMs?` | `number` | Maximum age of a cached benefit-metadata snapshot before an entitlement sync re-reads it live (ms, default 15 minutes). The `benefit.updated` webhook patches snapshots immediately regardless. | [src/convex/integrations/billing.ts:786](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L786) |
| `onUnknownEvent()?` | (`ctx`, `event`) => `Promise`\<`void`\> | Called for an **authentic** (signature-verified) webhook event whose type this package's provider SDK cannot parse — e.g. an event newer than the installed package. The delivery is acknowledged with 202 either way, so unknown types can never put the endpoint into a retry loop. | [src/convex/integrations/billing.ts:793](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L793) |
| `deliveryLog?` | `boolean` | Record every inbound webhook delivery in the component's capped ring buffer (powers redelivery dedupe, doctor's "last webhook received", and the DevTools feed). `false` disables the log — and with it dedupe. | [src/convex/integrations/billing.ts:799](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L799) |

## Variables

### BILLING\_WEBHOOK\_PROVISION\_EVENTS

```ts
const BILLING_WEBHOOK_PROVISION_EVENTS: readonly ["checkout.created", "checkout.updated", "checkout.expired", "customer.created", "customer.updated", "customer.deleted", "customer.state_changed", "customer_seat.assigned", "customer_seat.claimed", "customer_seat.revoked", "member.created", "member.updated", "member.deleted", "order.created", "order.updated", "order.paid", "order.refunded", "subscription.created", "subscription.updated", "subscription.active", "subscription.canceled", "subscription.uncanceled", "subscription.revoked", "subscription.past_due", "refund.created", "refund.updated", "product.created", "product.updated", "benefit.created", "benefit.updated", "benefit_grant.created", "benefit_grant.cycled", "benefit_grant.updated", "benefit_grant.revoked", "organization.updated"];
```

Defined in: [src/convex/catalog.ts:190](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L190)

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

Defined in: [src/convex/integrations/billing.ts:827](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L827)

Internal: lets tests pin the provision list against the refresh set.

***

### ALL\_BILLING\_EVENTS

```ts
const ALL_BILLING_EVENTS: readonly ["checkout.created", "checkout.updated", "checkout.expired", "customer.created", "customer.updated", "customer.deleted", "customer.state_changed", "customer_seat.assigned", "customer_seat.claimed", "customer_seat.revoked", "member.created", "member.updated", "member.deleted", "order.created", "order.updated", "order.paid", "order.refunded", "subscription.created", "subscription.updated", "subscription.active", "subscription.canceled", "subscription.uncanceled", "subscription.revoked", "subscription.past_due", "refund.created", "refund.updated", "product.created", "product.updated", "benefit.created", "benefit.updated", "benefit_grant.created", "benefit_grant.cycled", "benefit_grant.updated", "benefit_grant.revoked", "organization.updated", "subscription.paused", "subscription.resumed"];
```

Defined in: [src/convex/integrations/billing.ts:835](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L835)

The provider's full webhook catalog. The composed handler map covers every
one of these, so any verified delivery gets logging, dedupe, and consumer
dispatch — events outside it (a newer provider than this package) land in
`onUnknownEvent` with a 202 instead of an error loop.

## Functions

### defineBillingCatalog()

```ts
function defineBillingCatalog(catalog): BillingCatalog;
```

Defined in: [src/convex/catalog.ts:178](https://github.com/qruto/nuxt-backend/blob/main/src/convex/catalog.ts#L178)

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
      credits: { meter: 'credits', units: 500 }, features: ['priority_support'],
      trial: { interval: 'day', count: 14 },
      usage: [{ meter: 'credits', unitAmount: 5 }] },
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

Defined in: [src/convex/integrations/billing.ts:957](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L957)

The packaged default gift-notification email — minimal, dependency-free.
Used when SetupBillingConfig.giftEmail is not supplied; exported so
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

Defined in: [src/convex/integrations/billing.ts:1194](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/billing.ts#L1194)

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
