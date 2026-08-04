---
navigation: true
---

# convex/integrations/billing

## Interfaces

### BillingRateLimiter

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:57](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L57)

A structural rate limiter for throttling `syncEntitlements` — satisfied by
`setupRateLimiter(...)` from `nuxt-backend/convex/rate-limit`, which seeds the
`billingSync` limit by default. Kept structural (rather than importing the
rate-limiter's own type) so any compatible limiter is assignable.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="limit"></a> `limit` | (`ctx`, `name`, `options?`) => `Promise`\<\{ `ok`: `boolean`; `retryAfter?`: `number`; \}\> | [nuxt-backend/src/convex/integrations/billing.ts:58](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L58) |

***

### EntitlementBenefit

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:78](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L78)

A single granted benefit (entitlement) in a customer's billing state.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:79](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L79) |
| <a id="benefitid"></a> `benefitId` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:80](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L80) |
| <a id="type"></a> `type` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:81](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L81) |
| <a id="metadata"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | The benefit's **live** provider metadata (read from the benefit, not the grant-time snapshot in customer state). Lets consumers feature-gate by a friendly key — set e.g. `{ key: 'premium' }` on the benefit and check `useFeatures().has('premium')`. | [nuxt-backend/src/convex/integrations/billing.ts:88](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L88) |

***

### EntitlementMeter

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:92](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L92)

A credit-meter balance in a customer's billing state (prepaid credits).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meterid"></a> `meterId` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:93](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L93) |
| <a id="consumedunits"></a> `consumedUnits` | `number` | [nuxt-backend/src/convex/integrations/billing.ts:94](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L94) |
| <a id="creditedunits"></a> `creditedUnits` | `number` | [nuxt-backend/src/convex/integrations/billing.ts:95](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L95) |
| <a id="balance"></a> `balance` | `number` | [nuxt-backend/src/convex/integrations/billing.ts:96](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L96) |

***

### CustomerEntitlements

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:103](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L103)

A user's full billing entitlement state — active plans, granted benefits, and
credit-meter balances — normalized for caching into the reactive component table.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="customerid"></a> `customerId` | `string` \| `null` | [nuxt-backend/src/convex/integrations/billing.ts:104](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L104) |
| <a id="activeproductids"></a> `activeProductIds` | `string`[] | [nuxt-backend/src/convex/integrations/billing.ts:105](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L105) |
| <a id="benefits"></a> `benefits` | [`EntitlementBenefit`](#entitlementbenefit)[] | [nuxt-backend/src/convex/integrations/billing.ts:106](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L106) |
| <a id="meters"></a> `meters` | [`EntitlementMeter`](#entitlementmeter)[] | [nuxt-backend/src/convex/integrations/billing.ts:107](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L107) |

***

### SpendCreditsEvent

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:111](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L111)

A prepaid-credit consumption event (drawn from the customer's meter balance).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="userid"></a> `userId?` | `string` | The billing entity id — the workspace id (`billTo: 'organization'`, the default) or the auth user id (`billTo: 'user'`). Omit to resolve it from the caller's identity (the active workspace / signed-in user). | [nuxt-backend/src/convex/integrations/billing.ts:117](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L117) |
| <a id="name"></a> `name` | `string` | The meter event name (must match the credit meter's filter, e.g. `"credits"`). | [nuxt-backend/src/convex/integrations/billing.ts:119](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L119) |
| <a id="meterid-1"></a> `meterId?` | `string` | The credit meter id to guard against. When set, the spend is **blocked** (throws) if the balance is below `value` — keeping credits strictly prepaid (never billed as overage). Omit to skip the balance check. | [nuxt-backend/src/convex/integrations/billing.ts:125](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L125) |
| <a id="value"></a> `value?` | `number` | Credits required for this spend (default `1`) — used for the balance guard. | [nuxt-backend/src/convex/integrations/billing.ts:127](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L127) |
| <a id="metadata-1"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Event properties used by the meter's aggregation/filter. | [nuxt-backend/src/convex/integrations/billing.ts:129](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L129) |
| <a id="externalid"></a> `externalId?` | `string` | Idempotency key to prevent double-counting. | [nuxt-backend/src/convex/integrations/billing.ts:131](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L131) |
| <a id="timestamp"></a> `timestamp?` | `Date` | Event time (defaults to now). | [nuxt-backend/src/convex/integrations/billing.ts:133](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L133) |

***

### GiftRecord

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:143](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L143)

A gift purchase record, as stored by the `backend` component
(`components.backend.gifts.*`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:144](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L144) |
| <a id="recipientemail"></a> `recipientEmail` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:145](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L145) |
| <a id="purchaseruserid"></a> `purchaserUserId` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:146](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L146) |
| <a id="purchaseremail"></a> `purchaserEmail?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:147](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L147) |
| <a id="purchasername"></a> `purchaserName?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:148](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L148) |
| <a id="productids"></a> `productIds` | `string`[] | - | [nuxt-backend/src/convex/integrations/billing.ts:149](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L149) |
| <a id="message"></a> `message?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:150](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L150) |
| <a id="status"></a> `status` | `string` | `'pending'` (checkout created) → `'paid'` (order webhook) → `'claimed'`. | [nuxt-backend/src/convex/integrations/billing.ts:152](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L152) |
| <a id="billingcustomerid"></a> `billingCustomerId` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:153](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L153) |
| <a id="billingorderid"></a> `billingOrderId?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:154](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L154) |
| <a id="claimedbyuserid"></a> `claimedByUserId?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:155](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L155) |
| <a id="claimedentityid"></a> `claimedEntityId?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:156](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L156) |
| <a id="createdat"></a> `createdAt` | `number` | - | [nuxt-backend/src/convex/integrations/billing.ts:157](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L157) |
| <a id="paidat"></a> `paidAt?` | `number` | - | [nuxt-backend/src/convex/integrations/billing.ts:158](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L158) |
| <a id="claimedat"></a> `claimedAt?` | `number` | - | [nuxt-backend/src/convex/integrations/billing.ts:159](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L159) |

***

### GiftEmailMessage

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:163](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L163)

The gift-notification email built by [SetupBillingConfig.giftEmail](#setupbillingconfig).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:164](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L164) |
| <a id="subject"></a> `subject` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:165](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L165) |
| <a id="html"></a> `html?` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:166](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L166) |
| <a id="text"></a> `text?` | `string` | [nuxt-backend/src/convex/integrations/billing.ts:167](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L167) |

***

### GiftEmailData

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:171](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L171)

The data available to the gift-notification email template.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="recipientemail-1"></a> `recipientEmail` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:172](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L172) |
| <a id="purchasername-1"></a> `purchaserName?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:173](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L173) |
| <a id="purchaseremail-1"></a> `purchaserEmail?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:174](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L174) |
| <a id="message-1"></a> `message?` | `string` | - | [nuxt-backend/src/convex/integrations/billing.ts:175](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L175) |
| <a id="claimurl"></a> `claimUrl` | `string` | The app URL where the recipient signs in (or up) to receive the gift. | [nuxt-backend/src/convex/integrations/billing.ts:177](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L177) |

***

### BillingComponents

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:190](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L190)

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
| <a id="polar"></a> `polar` | `ComponentApi` | [nuxt-backend/src/convex/integrations/billing.ts:191](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L191) |
| <a id="backend"></a> `backend` | \{ `billing`: \{ `getByUser`: `FunctionReference`\<`"query"`, `"public"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\>; `upsert`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\>; `userByCustomer`: `FunctionReference`\<`"query"`, `"public"`, \{ `customerId`: `string`; \}, `string` \| `null`\>; \}; `gifts`: \{ `create`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\>; `markPaid`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\>; `markClaimed`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\>; `listByEmail`: `FunctionReference`\<`"query"`, `"public"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\>; `get`: `FunctionReference`\<`"query"`, `"public"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\>; `resolveRecipient`: `FunctionReference`\<`"query"`, `"public"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\>; \}; `email?`: \{ `send`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `to`: `string`; `subject`: `string`; `html?`: `string`; `text?`: `string`; \}, `string` \| `null`\>; \}; \} | [nuxt-backend/src/convex/integrations/billing.ts:192](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L192) |
| `backend.billing` | \{ `getByUser`: `FunctionReference`\<`"query"`, `"public"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\>; `upsert`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\>; `userByCustomer`: `FunctionReference`\<`"query"`, `"public"`, \{ `customerId`: `string`; \}, `string` \| `null`\>; \} | [nuxt-backend/src/convex/integrations/billing.ts:193](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L193) |
| `backend.billing.getByUser` | `FunctionReference`\<`"query"`, `"public"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:194](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L194) |
| `backend.billing.upsert` | `FunctionReference`\<`"mutation"`, `"public"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:195](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L195) |
| `backend.billing.userByCustomer` | `FunctionReference`\<`"query"`, `"public"`, \{ `customerId`: `string`; \}, `string` \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:202](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L202) |
| `backend.gifts` | \{ `create`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\>; `markPaid`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\>; `markClaimed`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\>; `listByEmail`: `FunctionReference`\<`"query"`, `"public"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\>; `get`: `FunctionReference`\<`"query"`, `"public"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\>; `resolveRecipient`: `FunctionReference`\<`"query"`, `"public"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\>; \} | [nuxt-backend/src/convex/integrations/billing.ts:204](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L204) |
| `backend.gifts.create` | `FunctionReference`\<`"mutation"`, `"public"`, \{ `recipientEmail`: `string`; `purchaserUserId`: `string`; `purchaserEmail?`: `string`; `purchaserName?`: `string`; `productIds`: `string`[]; `message?`: `string`; `billingCustomerId`: `string`; \}, `string`\> | [nuxt-backend/src/convex/integrations/billing.ts:205](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L205) |
| `backend.gifts.markPaid` | `FunctionReference`\<`"mutation"`, `"public"`, \{ `giftId`: `string`; `billingOrderId?`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:214](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L214) |
| `backend.gifts.markClaimed` | `FunctionReference`\<`"mutation"`, `"public"`, \{ `giftId`: `string`; `userId`: `string`; `entityId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:215](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L215) |
| `backend.gifts.listByEmail` | `FunctionReference`\<`"query"`, `"public"`, \{ `email`: `string`; `status?`: `string`; \}, [`GiftRecord`](#giftrecord)[]\> | [nuxt-backend/src/convex/integrations/billing.ts:216](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L216) |
| `backend.gifts.get` | `FunctionReference`\<`"query"`, `"public"`, \{ `giftId`: `string`; \}, [`GiftRecord`](#giftrecord) \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:217](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L217) |
| `backend.gifts.resolveRecipient` | `FunctionReference`\<`"query"`, `"public"`, \{ `email`: `string`; \}, \| \{ `userId`: `string`; `organizationId`: `string` \| `null`; \} \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:218](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L218) |
| `backend.email?` | \{ `send`: `FunctionReference`\<`"mutation"`, `"public"`, \{ `to`: `string`; `subject`: `string`; `html?`: `string`; `text?`: `string`; \}, `string` \| `null`\>; \} | [nuxt-backend/src/convex/integrations/billing.ts:220](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L220) |
| `backend.email.send` | `FunctionReference`\<`"mutation"`, `"public"`, \{ `to`: `string`; `subject`: `string`; `html?`: `string`; `text?`: `string`; \}, `string` \| `null`\> | [nuxt-backend/src/convex/integrations/billing.ts:221](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L221) |

***

### Billing

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:343](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L343)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="provider"></a> `provider` | `Polar` | The underlying billing-provider component client (an advanced escape hatch — use `provider.polar` for the raw SDK). Needed by `registerBackendRoutes` to mount the webhook. | [nuxt-backend/src/convex/integrations/billing.ts:349](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L349) |
| <a id="api"></a> `api` | `Omit`\<\{ `changeCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `productId`: `string`; \}, `Promise`\<`void`\>\>; `cancelCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `revokeImmediately?`: `boolean`; \}, `Promise`\<`void`\>\>; `getConfiguredProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ \[`key`: `string`\]: \| \{ `benefits?`: \{ `createdAt`: ...; `deletable`: ...; `description`: ...; `id`: ...; `metadata?`: ...; `modifiedAt`: ...; `organizationId`: ...; `properties?`: ...; `selectable`: ...; `type`: ...; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: ... \| ...; `checksumSha256Base64`: ... \| ...; `checksumSha256Hex`: ... \| ...; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: ... \| ...; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: ... \| ...; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: ... \| ...; `version`: ... \| ...; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: ... \| ...; `capAmount?`: ... \| ... \| ...; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: ... \| ... \| ...; `meter?`: ... \| ...; `meterId?`: ... \| ...; `minimumAmount?`: ... \| ... \| ...; `modifiedAt`: ... \| ...; `presetAmount?`: ... \| ... \| ...; `priceAmount?`: ... \| ...; `priceCurrency?`: ... \| ...; `productId`: `string`; `recurringInterval?`: ... \| ... \| ...; `seatTiers?`: ... \| ...; `source?`: ... \| ...; `type?`: ... \| ...; `unitAmount?`: ... \| ...; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `undefined`; \}\>\>; `listAllProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: ... \| ...; `modifiedAt`: ... \| ...; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: ...; `name`: ...; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: ...[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \}[]\>\>; `listAllSubscriptions`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `amount`: `number` \| `null`; `cancelAtPeriodEnd`: `boolean`; `canceledAt?`: `string` \| `null`; `checkoutId`: `string` \| `null`; `createdAt`: `string`; `currency`: `string` \| `null`; `currentPeriodEnd`: `string` \| `null`; `currentPeriodStart`: `string`; `customFieldData?`: `Record`\<`string`, `any`\>; `customerCancellationComment?`: `string` \| `null`; `customerCancellationReason?`: `string` \| `null`; `customerId`: `string`; `discountId?`: `string` \| `null`; `endedAt`: `string` \| `null`; `endsAt?`: `string` \| `null`; `id`: `string`; `metadata`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `priceId?`: `string`; `product`: \| \{ `benefits?`: ...[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: ...; `checksumSha256Base64`: ...; `checksumSha256Hex`: ...; `createdAt`: ...; `id`: ...; `isUploaded`: ...; `lastModifiedAt`: ...; `mimeType`: ...; `name`: ...; `organizationId`: ...; `path`: ...; `publicUrl`: ...; `service?`: ...; `size`: ...; `sizeReadable`: ...; `storageVersion`: ...; `version`: ...; \}[]; `metadata?`: `Record`\<..., ...\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `prices`: \{ `amountType?`: ...; `capAmount?`: ...; `createdAt`: ...; `id`: ...; `isArchived`: ...; `maximumAmount?`: ...; `meter?`: ...; `meterId?`: ...; `minimumAmount?`: ...; `modifiedAt`: ...; `presetAmount?`: ...; `priceAmount?`: ...; `priceCurrency?`: ...; `productId`: ...; `recurringInterval?`: ...; `seatTiers?`: ...; `source?`: ...; `type?`: ...; `unitAmount?`: ...; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `null`; `productId`: `string`; `recurringInterval`: `string` \| `null`; `recurringIntervalCount?`: `number`; `seats?`: `number` \| `null`; `startedAt`: `string` \| `null`; `status`: `string`; `trialEnd?`: `string` \| `null`; `trialStart?`: `string` \| `null`; \}[]\>\>; `generateCheckoutLink`: `RegisteredAction`\<`"public"`, \{ `metadata?`: `Record`\<`string`, `string`\>; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; `subscriptionId?`: `string`; `locale?`: `string`; `productIds`: `string`[]; `origin`: `string`; `successUrl`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; `generateCustomerPortalUrl`: `RegisteredAction`\<`"public"`, \{ `returnUrl?`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; \}, `"listAllSubscriptions"`\> & \{ `listAllSubscriptions`: `RegisteredQuery`\<`"public"`\>; `giftCheckout`: `RegisteredAction`\<`"public"`\>; \} | The ready-made checkout / portal / subscription functions to re-export from your Convex module (the result of the provider's `api()`), plus `giftCheckout`. `listAllSubscriptions` is wrapped to resolve the billing entity like the reactive reads do — it returns `null` instead of throwing for claimless callers (signed out, or the auth-handshake / reconnect window reactive queries subscribe in). | [nuxt-backend/src/convex/integrations/billing.ts:358](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L358) |
| <a id="functions"></a> `functions` | \{ `getCurrentSubscription`: `RegisteredQuery`\<`"public"`\>; `getFeatures`: `RegisteredQuery`\<`"public"`\>; `getCredits`: `RegisteredQuery`\<`"public"`\>; `syncEntitlements`: `RegisteredAction`\<`"public"`\>; `getReceivedGifts`: `RegisteredQuery`\<`"public"`\>; `claimGift`: `RegisteredAction`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `billing.ts` so `useBilling` / `useFeatures` / `useCredits` / `useGifts` work with zero hand-wiring: the reactive current-subscription, feature-gating and credit-balance queries, a `syncEntitlements` action to refresh the cache after checkout / top-up, and the gift queries/claim action. | [nuxt-backend/src/convex/integrations/billing.ts:369](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L369) |
| `functions.getCurrentSubscription` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:370](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L370) |
| `functions.getFeatures` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:371](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L371) |
| `functions.getCredits` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:372](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L372) |
| `functions.syncEntitlements` | `RegisteredAction`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:373](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L373) |
| `functions.getReceivedGifts` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:374](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L374) |
| `functions.claimGift` | `RegisteredAction`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/billing.ts:375](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L375) |
| <a id="webhookevents"></a> `webhookEvents` | [`BillingWebhookEventHandlers`](#billingwebhookeventhandlers) | Typed billing webhook handlers for `registerBackendRoutes` (mounted at `/billing/events`) that keep the reactive cache fresh (subscriptions, benefit grants, credit balances) and fulfil paid gifts. | [nuxt-backend/src/convex/integrations/billing.ts:382](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L382) |
| <a id="getcustomerstate"></a> `getCustomerState` | (`ctx`, `args`) => `Promise`\<[`CustomerEntitlements`](#customerentitlements)\> | Resolve a user's full billing entitlement state (active plans, benefits, and credit-meter balances) live from the provider. Call from an **action**; the ready-made `syncEntitlements` already caches the result for you. | [nuxt-backend/src/convex/integrations/billing.ts:388](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L388) |
| <a id="spendcredits"></a> `spendCredits` | (`ctx`, `event`) => `Promise`\<`void`\> | Spend prepaid credits (provider `events.ingest`) — call from your own **server** action when a metered feature is used. The billing entity (workspace or user, per `billTo`) resolves from the caller's identity; pass `userId` to spend for a specific entity. With `meterId` set, the spend is blocked when the balance is insufficient (strictly prepaid). | [nuxt-backend/src/convex/integrations/billing.ts:396](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L396) |
| <a id="creatediscount"></a> `createDiscount` | (`discount`) => `Promise`\<\{ `id`: `string`; `code`: `string` \| `null`; \}\> | Create a discount / coupon (provider `discounts.create`). Call from an **action**. Accepts the full discount-create shape (fixed or percentage). | [nuxt-backend/src/convex/integrations/billing.ts:401](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L401) |

## Type Aliases

### DiscountInput

```ts
type DiscountInput = Parameters<typeof discountsCreate>[1];
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:68](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L68)

Full discount-create payload (derived from the provider SDK) — fixed or percentage.

***

### BillingWebhookEventHandlers

```ts
type BillingWebhookEventHandlers = WebhookEventHandlers;
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:75](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L75)

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
};
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:252](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L252)

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
| `accessToken?` | `string` | Provider access token. Defaults to the required `BILLING_ACCESS_TOKEN` env var. | [nuxt-backend/src/convex/integrations/billing.ts:254](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L254) |
| `environment?` | `"sandbox"` \| `"production"` | Provider environment. Defaults to the required `BILLING_ENVIRONMENT` env var (`'sandbox'` otherwise). | [nuxt-backend/src/convex/integrations/billing.ts:256](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L256) |
| `webhookSecret?` | `string` | Webhook signature secret. Defaults to the required `BILLING_WEBHOOK_SECRET` env var. | [nuxt-backend/src/convex/integrations/billing.ts:258](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L258) |
| `billTo?` | `"organization"` \| `"user"` | Who owns subscriptions and credits: the active workspace (`'organization'`, the default — members share the workspace's plan and credits) or the individual user (`'user'`, for B2C apps without shared billing). | [nuxt-backend/src/convex/integrations/billing.ts:264](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L264) |
| `getUserInfo?` | `PolarConfig`\[`"getUserInfo"`\] | Override the billing-entity resolution for **action** contexts (checkout / portal / sync). Only consulted with `billTo: 'user'`; the default reads the signed-in user from identity claims. | [nuxt-backend/src/convex/integrations/billing.ts:270](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L270) |
| `currentUserId()?` | (`ctx`) => `Promise`\<`string` \| `null`\> | Override the billing-entity resolution for **query** contexts (the reactive `getCurrentSubscription` / `getFeatures` / `getCredits` reads). Only consulted with `billTo: 'user'`; the default reads identity claims. Return `null` when signed out so reads degrade gracefully. | [nuxt-backend/src/convex/integrations/billing.ts:277](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L277) |
| `rateLimiter?` | [`BillingRateLimiter`](#billingratelimiter) | Throttle `syncEntitlements` per billing entity. Pass your `setupRateLimiter(...)` limiter and each authenticated sync is checked against the `billingSync` limit (10/min, keyed by the workspace/user), so a caller can't loop it to amplify the live provider fan-out. Omit to leave the action unthrottled. | [nuxt-backend/src/convex/integrations/billing.ts:285](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L285) |
| `events?` | `Partial`\<[`BillingWebhookEventHandlers`](#billingwebhookeventhandlers)\> | React to billing webhook events, keyed by the provider's own event names (`'order.paid'`, `'subscription.active'`, …). Your handler runs **after** the built-in entitlement-cache refresh (and gift fulfilment), so features/credits read fresh inside it. Events outside the built-in refresh set are mounted too. | [nuxt-backend/src/convex/integrations/billing.ts:293](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L293) |
| `giftEmail()?` | (`data`) => [`GiftEmailMessage`](#giftemailmessage) | Restyle the gift-notification email sent to the recipient once their gift is paid. The default is a minimal, dependency-free template linking to `SITE_URL` (where signing in claims the gift automatically). | [nuxt-backend/src/convex/integrations/billing.ts:299](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L299) |

## Functions

### setupBilling()

```ts
function setupBilling(components, config?): Billing;
```

Defined in: [nuxt-backend/src/convex/integrations/billing.ts:434](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/billing.ts#L434)

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
import { setupBilling } from 'nuxt-backend/convex/billing'
import { components } from './_generated/api'

const billing = setupBilling(components)

export const { provider } = billing
export const { generateCheckoutLink, generateCustomerPortalUrl, giftCheckout } = billing.api
export const {
  getCurrentSubscription, getFeatures, getCredits, syncEntitlements,
  getReceivedGifts, claimGift,
} = billing.functions
```
