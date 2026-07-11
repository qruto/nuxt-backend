---
navigation: true
---

# convex/integrations/billing

## Interfaces

### EntitlementBenefit

Defined in: [src/convex/integrations/billing.ts:43](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L43)

A single granted benefit (entitlement) in a customer's Polar state.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [src/convex/integrations/billing.ts:44](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L44) |
| <a id="benefitid"></a> `benefitId` | `string` | - | [src/convex/integrations/billing.ts:45](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L45) |
| <a id="type"></a> `type` | `string` | - | [src/convex/integrations/billing.ts:46](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L46) |
| <a id="metadata"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | The benefit's **live** Polar metadata (read from the benefit, not the grant-time snapshot in customer state). Lets consumers feature-gate by a friendly key — set e.g. `{ key: 'premium' }` on the Polar benefit and check `useFeatures().has('premium')`. | [src/convex/integrations/billing.ts:53](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L53) |

***

### EntitlementMeter

Defined in: [src/convex/integrations/billing.ts:57](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L57)

A credit-meter balance in a customer's Polar state (prepaid credits).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meterid"></a> `meterId` | `string` | [src/convex/integrations/billing.ts:58](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L58) |
| <a id="consumedunits"></a> `consumedUnits` | `number` | [src/convex/integrations/billing.ts:59](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L59) |
| <a id="creditedunits"></a> `creditedUnits` | `number` | [src/convex/integrations/billing.ts:60](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L60) |
| <a id="balance"></a> `balance` | `number` | [src/convex/integrations/billing.ts:61](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L61) |

***

### CustomerEntitlements

Defined in: [src/convex/integrations/billing.ts:68](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L68)

A user's full Polar entitlement state — active plans, granted benefits, and
credit-meter balances — normalized for caching into the reactive component table.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="customerid"></a> `customerId` | `string` \| `null` | [src/convex/integrations/billing.ts:69](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L69) |
| <a id="activeproductids"></a> `activeProductIds` | `string`[] | [src/convex/integrations/billing.ts:70](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L70) |
| <a id="benefits"></a> `benefits` | [`EntitlementBenefit`](#entitlementbenefit)[] | [src/convex/integrations/billing.ts:71](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L71) |
| <a id="meters"></a> `meters` | [`EntitlementMeter`](#entitlementmeter)[] | [src/convex/integrations/billing.ts:72](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L72) |

***

### SpendCreditsEvent

Defined in: [src/convex/integrations/billing.ts:76](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L76)

A prepaid-credit consumption event (drawn from the customer's meter balance).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="userid"></a> `userId` | `string` | The auth user id (resolved to a Polar customer). | [src/convex/integrations/billing.ts:78](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L78) |
| <a id="name"></a> `name` | `string` | The meter event name (must match the credit meter's filter, e.g. `"credits"`). | [src/convex/integrations/billing.ts:80](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L80) |
| <a id="meterid-1"></a> `meterId?` | `string` | The credit meter id to guard against. When set, the spend is **blocked** (throws) if the balance is below `value` — keeping credits strictly prepaid (never billed as overage). Omit to skip the balance check. | [src/convex/integrations/billing.ts:86](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L86) |
| <a id="value"></a> `value?` | `number` | Credits required for this spend (default `1`) — used for the balance guard. | [src/convex/integrations/billing.ts:88](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L88) |
| <a id="metadata-1"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Event properties used by the meter's aggregation/filter. | [src/convex/integrations/billing.ts:90](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L90) |
| <a id="externalid"></a> `externalId?` | `string` | Idempotency key to prevent double-counting. | [src/convex/integrations/billing.ts:92](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L92) |
| <a id="timestamp"></a> `timestamp?` | `Date` | Event time (defaults to now). | [src/convex/integrations/billing.ts:94](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L94) |

***

### BillingComponentApi

Defined in: [src/convex/integrations/billing.ts:106](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L106)

The `billing` function group exposed by the `backend` component (see
`src/convex/component/billing.ts`), reachable from the app as
`components.backend.billing`. Stores the reactive entitlement/credit cache so
consumers add nothing to their own schema.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="billing"></a> `billing` | \{ `getByUser`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\>; `upsert`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"mutation"`, `"public"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\>; `userByCustomer`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `customerId`: `string`; \}, `string` \| `null`\>; \} | [src/convex/integrations/billing.ts:107](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L107) |
| `billing.getByUser` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `userId`: `string`; \}, `CachedEntitlements` \| `null`\> | [src/convex/integrations/billing.ts:108](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L108) |
| `billing.upsert` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"mutation"`, `"public"`, \{ `userId`: `string`; `customerId?`: `string`; `activeProductIds`: `string`[]; `benefits`: [`EntitlementBenefit`](#entitlementbenefit)[]; `meters`: [`EntitlementMeter`](#entitlementmeter)[]; \}, `null`\> | [src/convex/integrations/billing.ts:109](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L109) |
| `billing.userByCustomer` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `customerId`: `string`; \}, `string` \| `null`\> | [src/convex/integrations/billing.ts:116](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L116) |

***

### Billing

Defined in: [src/convex/integrations/billing.ts:158](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L158)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="polar"></a> `polar` | `Polar` | The underlying Polar component client (use `polar.polar` for the raw SDK). | [src/convex/integrations/billing.ts:160](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L160) |
| <a id="api"></a> `api` | \{ `changeCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `productId`: `string`; \}, `Promise`\<`void`\>\>; `cancelCurrentSubscription`: `RegisteredAction`\<`"public"`, \{ `revokeImmediately?`: `boolean`; \}, `Promise`\<`void`\>\>; `getConfiguredProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ \[`key`: `string`\]: \| \{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: `Record`\<..., ...\>; `modifiedAt`: `string` \| `null`; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: `string`; `name`: `string`; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: \{ `maxSeats`: ...; `minSeats`: ...; `pricePerSeat`: ...; \}[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `undefined`; \}\>\>; `listAllProducts`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: `string`; `name`: `string`; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: \{ `maxSeats`: ... \| ...; `minSeats`: `number`; `pricePerSeat`: `number`; \}[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \}[]\>\>; `listAllSubscriptions`: `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `amount`: `number` \| `null`; `cancelAtPeriodEnd`: `boolean`; `canceledAt?`: `string` \| `null`; `checkoutId`: `string` \| `null`; `createdAt`: `string`; `currency`: `string` \| `null`; `currentPeriodEnd`: `string` \| `null`; `currentPeriodStart`: `string`; `customFieldData?`: `Record`\<`string`, `any`\>; `customerCancellationComment?`: `string` \| `null`; `customerCancellationReason?`: `string` \| `null`; `customerId`: `string`; `discountId?`: `string` \| `null`; `endedAt`: `string` \| `null`; `endsAt?`: `string` \| `null`; `id`: `string`; `metadata`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `priceId?`: `string`; `product`: \| \{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: ... \| ...; `modifiedAt`: ... \| ...; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: ...; `name`: ...; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: ...[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `null`; `productId`: `string`; `recurringInterval`: `string` \| `null`; `recurringIntervalCount?`: `number`; `seats?`: `number` \| `null`; `startedAt`: `string` \| `null`; `status`: `string`; `trialEnd?`: `string` \| `null`; `trialStart?`: `string` \| `null`; \}[]\>\>; `generateCheckoutLink`: `RegisteredAction`\<`"public"`, \{ `metadata?`: `Record`\<`string`, `string`\>; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; `subscriptionId?`: `string`; `locale?`: `string`; `productIds`: `string`[]; `origin`: `string`; `successUrl`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; `generateCustomerPortalUrl`: `RegisteredAction`\<`"public"`, \{ `returnUrl?`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\>; \} | The ready-made checkout / portal / subscription functions to re-export from your Convex module (the result of `polar.api()`). | [src/convex/integrations/billing.ts:165](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L165) |
| `api.changeCurrentSubscription` | `RegisteredAction`\<`"public"`, \{ `productId`: `string`; \}, `Promise`\<`void`\>\> | - | node\_modules/@convex-dev/polar/dist/client/index.d.ts:500 |
| `api.cancelCurrentSubscription` | `RegisteredAction`\<`"public"`, \{ `revokeImmediately?`: `boolean`; \}, `Promise`\<`void`\>\> | - | node\_modules/@convex-dev/polar/dist/client/index.d.ts:503 |
| `api.getConfiguredProducts` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ \[`key`: `string`\]: \| \{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: `Record`\<..., ...\>; `modifiedAt`: `string` \| `null`; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: `string`; `name`: `string`; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: \{ `maxSeats`: ...; `minSeats`: ...; `pricePerSeat`: ...; \}[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `undefined`; \}\>\> | - | node\_modules/@convex-dev/polar/dist/client/index.d.ts:506 |
| `api.listAllProducts` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `priceAmount?`: `number`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: `string`; `name`: `string`; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: \{ `maxSeats`: ... \| ...; `minSeats`: `number`; `pricePerSeat`: `number`; \}[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \}[]\>\> | - | node\_modules/@convex-dev/polar/dist/client/index.d.ts:581 |
| `api.listAllSubscriptions` | `RegisteredQuery`\<`"public"`, \{ \}, `Promise`\<\{ `amount`: `number` \| `null`; `cancelAtPeriodEnd`: `boolean`; `canceledAt?`: `string` \| `null`; `checkoutId`: `string` \| `null`; `createdAt`: `string`; `currency`: `string` \| `null`; `currentPeriodEnd`: `string` \| `null`; `currentPeriodStart`: `string`; `customFieldData?`: `Record`\<`string`, `any`\>; `customerCancellationComment?`: `string` \| `null`; `customerCancellationReason?`: `string` \| `null`; `customerId`: `string`; `discountId?`: `string` \| `null`; `endedAt`: `string` \| `null`; `endsAt?`: `string` \| `null`; `id`: `string`; `metadata`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `priceId?`: `string`; `product`: \| \{ `benefits?`: \{ `createdAt`: `string`; `deletable`: `boolean`; `description`: `string`; `id`: `string`; `metadata?`: ... \| ...; `modifiedAt`: ... \| ...; `organizationId`: `string`; `properties?`: `any`; `selectable`: `boolean`; `type`: `string`; \}[]; `createdAt`: `string`; `description`: `string` \| `null`; `id`: `string`; `isArchived`: `boolean`; `isRecurring`: `boolean`; `medias`: \{ `checksumEtag`: `string` \| `null`; `checksumSha256Base64`: `string` \| `null`; `checksumSha256Hex`: `string` \| `null`; `createdAt`: `string`; `id`: `string`; `isUploaded`: `boolean`; `lastModifiedAt`: `string` \| `null`; `mimeType`: `string`; `name`: `string`; `organizationId`: `string`; `path`: `string`; `publicUrl`: `string`; `service?`: `string`; `size`: `number`; `sizeReadable`: `string`; `storageVersion`: `string` \| `null`; `version`: `string` \| `null`; \}[]; `metadata?`: `Record`\<`string`, `any`\>; `modifiedAt`: `string` \| `null`; `name`: `string`; `organizationId`: `string`; `prices`: \{ `amountType?`: `string`; `capAmount?`: `number` \| `null`; `createdAt`: `string`; `id`: `string`; `isArchived`: `boolean`; `maximumAmount?`: `number` \| `null`; `meter?`: \{ `id`: ...; `name`: ...; \}; `meterId?`: `string`; `minimumAmount?`: `number` \| `null`; `modifiedAt`: `string` \| `null`; `presetAmount?`: `number` \| `null`; `priceAmount?`: `number`; `priceCurrency?`: `string`; `productId`: `string`; `recurringInterval?`: `string` \| `null`; `seatTiers?`: ...[]; `source?`: `string`; `type?`: `string`; `unitAmount?`: `string`; \}[]; `recurringInterval?`: `string` \| `null`; `recurringIntervalCount?`: `number` \| `null`; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; \} \| `null`; `productId`: `string`; `recurringInterval`: `string` \| `null`; `recurringIntervalCount?`: `number`; `seats?`: `number` \| `null`; `startedAt`: `string` \| `null`; `status`: `string`; `trialEnd?`: `string` \| `null`; `trialStart?`: `string` \| `null`; \}[]\>\> | Query all subscriptions for the current user, including ended and expired trials. | node\_modules/@convex-dev/polar/dist/client/index.d.ts:657 |
| `api.generateCheckoutLink` | `RegisteredAction`\<`"public"`, \{ `metadata?`: `Record`\<`string`, `string`\>; `trialInterval?`: `string` \| `null`; `trialIntervalCount?`: `number` \| `null`; `subscriptionId?`: `string`; `locale?`: `string`; `productIds`: `string`[]; `origin`: `string`; `successUrl`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\> | Generate a Polar checkout URL, with optional trial period configuration. | node\_modules/@convex-dev/polar/dist/client/index.d.ts:761 |
| `api.generateCustomerPortalUrl` | `RegisteredAction`\<`"public"`, \{ `returnUrl?`: `string`; \}, `Promise`\<\{ `url`: `string`; \}\>\> | - | node\_modules/@convex-dev/polar/dist/client/index.d.ts:773 |
| <a id="functions"></a> `functions` | \{ `getCurrentSubscription`: `RegisteredQuery`\<`"public"`\>; `getFeatures`: `RegisteredQuery`\<`"public"`\>; `getCredits`: `RegisteredQuery`\<`"public"`\>; `syncEntitlements`: `RegisteredAction`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `backend/billing.ts` so `useBilling` / `useFeatures` / `useCredits` work with zero hand-wiring: the reactive current-subscription, feature-gating and credit-balance queries, plus a `syncEntitlements` action to refresh the cache after checkout / top-up. | [src/convex/integrations/billing.ts:172](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L172) |
| `functions.getCurrentSubscription` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:173](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L173) |
| `functions.getFeatures` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:174](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L174) |
| `functions.getCredits` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/billing.ts:175](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L175) |
| `functions.syncEntitlements` | `RegisteredAction`\<`"public"`\> | - | [src/convex/integrations/billing.ts:176](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L176) |
| <a id="webhookevents"></a> `webhookEvents` | `WebhookEventHandlers` | Typed Polar webhook handlers for `polar.registerRoutes(http, { events })` that keep the reactive cache fresh (subscriptions, benefit grants, credit balances). | [src/convex/integrations/billing.ts:182](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L182) |
| <a id="getcustomerstate"></a> `getCustomerState` | (`ctx`, `args`) => `Promise`\<[`CustomerEntitlements`](#customerentitlements)\> | Resolve a user's full Polar entitlement state (active plans, benefits, and credit-meter balances) live from Polar. Call from an **action**; the ready-made `syncEntitlements` already caches the result for you. | [src/convex/integrations/billing.ts:188](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L188) |
| <a id="spendcredits"></a> `spendCredits` | (`ctx`, `event`) => `Promise`\<`void`\> | Spend prepaid credits for a user (Polar `events.ingest`) — call from your own **server** action when a metered feature is used. With `meterId` set, the spend is blocked when the balance is insufficient (credits stay strictly prepaid). | [src/convex/integrations/billing.ts:194](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L194) |
| <a id="creatediscount"></a> `createDiscount` | (`discount`) => `Promise`\<\{ `id`: `string`; `code`: `string` \| `null`; \}\> | Create a discount / coupon (Polar `discounts.create`). Call from an **action**. Accepts the full Polar `DiscountCreate` shape (fixed or percentage). | [src/convex/integrations/billing.ts:199](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L199) |

## Type Aliases

### DiscountInput

```ts
type DiscountInput = Parameters<typeof discountsCreate>[1];
```

Defined in: [src/convex/integrations/billing.ts:40](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L40)

Full Polar discount-create payload (derived from the SDK) — fixed or percentage.

***

### SetupBillingConfig

```ts
type SetupBillingConfig = ConstructorParameters<typeof Polar>[1] & {
  currentUserId?: (ctx) => Promise<string | null>;
};
```

Defined in: [src/convex/integrations/billing.ts:127](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L127)

Polar client configuration. Mirrors `@convex-dev/polar`'s constructor config (a
required `getUserInfo` mapping the current user to a Polar customer, plus optional
product map / organization token / server) and adds a query-safe `currentUserId`
resolver used by the reactive feature/credit queries. The token, webhook secret,
and server fall back to the `POLAR_*` env vars when omitted.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `currentUserId()?` | (`ctx`) => `Promise`\<`string` \| `null`\> | Resolve the current auth user id from a **query** context (used by the reactive `getCurrentSubscription` / `getFeatures` / `getCredits` queries). Returns `null` when signed out so reads degrade gracefully (e.g. during SSR). `getUserInfo` covers action contexts (checkout / sync); this covers queries, where `ctx.runQuery` isn't available. Typed against an `any` data model so your concrete query ctx (e.g. for `authComponent.getAuthUser(ctx)`) is assignable without a cast. | [src/convex/integrations/billing.ts:138](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L138) |

## Functions

### setupBilling()

```ts
function setupBilling(
   component, 
   backend, 
   config): Billing;
```

Defined in: [src/convex/integrations/billing.ts:237](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/billing.ts#L237)

Configure the [Polar](https://www.convex.dev/components/polar) component
for subscriptions, discounts, and prepaid credits — linked to your auth users and
cached reactively inside the `backend` component (so consumers add nothing to their
own schema).

Subscription / feature / credit reads return `null`/empty until Polar has synced,
so an unconfigured deployment degrades gracefully; checkout / portal / credit /
discount operations require a `POLAR_ORGANIZATION_TOKEN`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `component` | `ComponentApi` |
| `backend` | [`BillingComponentApi`](#billingcomponentapi) |
| `config` | [`SetupBillingConfig`](#setupbillingconfig) |

#### Returns

[`Billing`](#billing-1)

#### Example

```ts
import { setupBilling } from 'nuxt-backend/convex/billing'
import { api, components } from './_generated/api'
import { env } from './_generated/server'
import { authComponent } from './auth'

const billing = setupBilling(components.polar, components.backend, {
  organizationToken: env.POLAR_ORGANIZATION_TOKEN,
  server: env.POLAR_SERVER ?? 'sandbox',
  getUserInfo: async (ctx) => {
    const user = await ctx.runQuery(api.auth.getAuthUser, {})
    return { userId: user._id, email: user.email }
  },
  currentUserId: async (ctx) => {
    if (!(await ctx.auth.getUserIdentity())) return null
    return (await authComponent.getAuthUser(ctx))._id
  },
})

export const { polar } = billing
export const { generateCheckoutLink, generateCustomerPortalUrl } = billing.api
export const { getCurrentSubscription, getFeatures, getCredits, syncEntitlements } = billing.functions
```
