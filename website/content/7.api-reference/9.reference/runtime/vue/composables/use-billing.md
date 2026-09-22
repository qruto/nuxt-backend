---
navigation: true
---

# runtime/vue/composables/use-billing

## Interfaces

### BillingPage

Defined in: [src/runtime/vue/composables/use-billing.ts:56](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L56)

A page of provider records. The provider paginates by page number (not
cursor), so `pagination` carries the totals rather than a next token.

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="items"></a> `items` | `Item`[] | [src/runtime/vue/composables/use-billing.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L57) |
| <a id="pagination"></a> `pagination?` | \{ `totalCount`: `number`; `maxPage`: `number`; \} | [src/runtime/vue/composables/use-billing.ts:58](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L58) |
| `pagination.totalCount` | `number` | [src/runtime/vue/composables/use-billing.ts:58](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L58) |
| `pagination.maxPage` | `number` | [src/runtime/vue/composables/use-billing.ts:58](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L58) |

***

### PendingPlanUpdate

Defined in: [src/runtime/vue/composables/use-billing.ts:87](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L87)

A scheduled plan change that takes effect next period (the provider's
`pendingUpdate`). Seats are deliberately absent — this package does not do
per-seat billing.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [src/runtime/vue/composables/use-billing.ts:88](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L88) |
| <a id="appliesat"></a> `appliesAt` | `Date` \| `null` | When the change takes effect; `null` when the provider did not say. | [src/runtime/vue/composables/use-billing.ts:90](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L90) |
| <a id="productid"></a> `productId` | `string` \| `null` | The product the subscription switches to, `null` when unchanged. | [src/runtime/vue/composables/use-billing.ts:92](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L92) |

***

### EntitlementBenefit

Defined in: [src/runtime/vue/composables/use-billing.ts:99](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L99)

A granted benefit — the unit of feature-gating (`useFeatures().has()`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | - | [src/runtime/vue/composables/use-billing.ts:100](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L100) |
| <a id="benefitid"></a> `benefitId` | `string` | - | [src/runtime/vue/composables/use-billing.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L101) |
| <a id="type"></a> `type` | `string` | - | [src/runtime/vue/composables/use-billing.ts:102](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L102) |
| <a id="metadata"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | The benefit's live provider metadata (not the grant-time snapshot). Set a stable key here (e.g. `{ key: 'premium' }`) to feature-gate by a friendly name — `useFeatures().has('premium')` matches any metadata value. | [src/runtime/vue/composables/use-billing.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L108) |

***

### EntitlementMeter

Defined in: [src/runtime/vue/composables/use-billing.ts:112](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L112)

A prepaid credit-meter balance (`useCredits()`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meterid"></a> `meterId` | `string` | - | [src/runtime/vue/composables/use-billing.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L113) |
| <a id="name"></a> `name?` | `string` | The configured friendly name (`setupBilling({ credits })` / catalog key). | [src/runtime/vue/composables/use-billing.ts:115](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L115) |
| <a id="consumedunits"></a> `consumedUnits` | `number` | - | [src/runtime/vue/composables/use-billing.ts:116](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L116) |
| <a id="creditedunits"></a> `creditedUnits` | `number` | - | [src/runtime/vue/composables/use-billing.ts:117](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L117) |
| <a id="balance"></a> `balance` | `number` | - | [src/runtime/vue/composables/use-billing.ts:118](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L118) |
| <a id="cyclestart"></a> `cycleStart?` | `number` | The granting subscription's current period (epoch ms), when it has one — a meter has no period of its own in the provider's model, and one bought as a one-time credit pack has no cycle at all. | [src/runtime/vue/composables/use-billing.ts:124](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L124) |
| <a id="cycleend"></a> `cycleEnd?` | `number` | - | [src/runtime/vue/composables/use-billing.ts:125](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L125) |
| <a id="rollover"></a> `rollover?` | `boolean` | Whether unspent credited units carry into the next cycle. Only known on the syncs that re-read the granting benefit, so `undefined` means "not said", never "no". | [src/runtime/vue/composables/use-billing.ts:131](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L131) |

***

### Features

Defined in: [src/runtime/vue/composables/use-billing.ts:135](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L135)

Feature-gating state for the current user, as returned by `getFeatures`.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="plans"></a> `plans` | `string`[] | Active product ids the user is subscribed to. | [src/runtime/vue/composables/use-billing.ts:137](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L137) |
| <a id="benefits"></a> `benefits` | [`EntitlementBenefit`](#entitlementbenefit)[] | Granted benefits. | [src/runtime/vue/composables/use-billing.ts:139](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L139) |

***

### Credits

Defined in: [src/runtime/vue/composables/use-billing.ts:143](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L143)

Prepaid credit balances for the current user, as returned by `getCredits`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meters"></a> `meters` | [`EntitlementMeter`](#entitlementmeter)[] | [src/runtime/vue/composables/use-billing.ts:144](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L144) |

***

### CheckoutPrefill

Defined in: [src/runtime/vue/composables/use-billing.ts:148](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L148)

Pre-filled customer details for a checkout session (all still editable).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name-1"></a> `name?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:149](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L149) |
| <a id="email"></a> `email?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:150](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L150) |
| <a id="billingname"></a> `billingName?` | `string` | The name that should appear on the invoice, when it differs from `name`. | [src/runtime/vue/composables/use-billing.ts:152](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L152) |
| <a id="billingaddress"></a> `billingAddress?` | \{ `country`: `string`; `line1?`: `string`; `line2?`: `string`; `postalCode?`: `string`; `city?`: `string`; `state?`: `string`; \} | - | [src/runtime/vue/composables/use-billing.ts:153](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L153) |
| `billingAddress.country` | `string` | ISO 3166-1 alpha-2 country code — the one field the provider requires. | [src/runtime/vue/composables/use-billing.ts:155](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L155) |
| `billingAddress.line1?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:156](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L156) |
| `billingAddress.line2?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:157](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L157) |
| `billingAddress.postalCode?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:158](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L158) |
| `billingAddress.city?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:159](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L159) |
| `billingAddress.state?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:160](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L160) |
| <a id="taxid"></a> `taxId?` | `string` | VAT / tax identification number. | [src/runtime/vue/composables/use-billing.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L163) |
| <a id="business"></a> `business?` | `boolean` | Bill a business: the provider then requires a full address and name. | [src/runtime/vue/composables/use-billing.ts:165](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L165) |

***

### BillingApi

Defined in: [src/runtime/vue/composables/use-billing.ts:195](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L195)

The billing function references — the result of `setupBilling().api` re-exported
from your `backend/billing.ts` (plus the optional `getCurrentSubscription`
query). Supplied automatically from the injected `api.billing` namespace;
pass `options.api` to override.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="getconfiguredproducts"></a> `getConfiguredProducts?` | `Query`\<`Record`\<`string`, [`BillingProduct`](#billingproduct) \| `undefined`\>\> | [src/runtime/vue/composables/use-billing.ts:196](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L196) |
| <a id="listallproducts"></a> `listAllProducts?` | `Query`\<[`BillingProduct`](#billingproduct)[]\> | [src/runtime/vue/composables/use-billing.ts:197](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L197) |
| <a id="listallsubscriptions"></a> `listAllSubscriptions?` | `Query`\<[`BillingSubscription`](#billingsubscription)[] \| `null`\> | [src/runtime/vue/composables/use-billing.ts:198](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L198) |
| <a id="getcurrentsubscription"></a> `getCurrentSubscription?` | `Query`\<[`BillingSubscription`](#billingsubscription) \| `null`\> | [src/runtime/vue/composables/use-billing.ts:199](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L199) |
| <a id="generatecheckoutlink"></a> `generateCheckoutLink?` | `FunctionReference`\<`"action"`, `"public"`, [`CheckoutArgs`](#checkoutargs), \{ `url`: `string`; \}\> | [src/runtime/vue/composables/use-billing.ts:200](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L200) |
| <a id="generatecustomerportalurl"></a> `generateCustomerPortalUrl?` | `FunctionReference`\<`"action"`, `"public"`, \{ `returnUrl?`: `string`; \}, \{ `url`: `string`; \}\> | [src/runtime/vue/composables/use-billing.ts:201](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L201) |
| <a id="changecurrentsubscription"></a> `changeCurrentSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `productId`: `string`; \}, `null`\> | [src/runtime/vue/composables/use-billing.ts:202](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L202) |
| <a id="cancelcurrentsubscription"></a> `cancelCurrentSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `revokeImmediately?`: `boolean`; \}, `null`\> | [src/runtime/vue/composables/use-billing.ts:203](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L203) |
| <a id="updatesubscription"></a> `updateSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; `productId?`: `string`; `proration?`: [`ClientProrationBehavior`](#clientprorationbehavior); \}, `null`\> | [src/runtime/vue/composables/use-billing.ts:207](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L207) |
| <a id="cancelsubscription"></a> `cancelSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; `atPeriodEnd?`: `boolean`; `reason?`: [`CancellationReason`](#cancellationreason); `comment?`: `string`; \}, `null`\> | [src/runtime/vue/composables/use-billing.ts:208](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L208) |
| <a id="uncancelsubscription"></a> `uncancelSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; \}, `null`\> | [src/runtime/vue/composables/use-billing.ts:209](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L209) |
| <a id="pausesubscription"></a> `pauseSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; `resumesAt?`: `number`; \}, `null`\> | [src/runtime/vue/composables/use-billing.ts:210](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L210) |
| <a id="resumesubscription"></a> `resumeSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; \}, `null`\> | [src/runtime/vue/composables/use-billing.ts:211](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L211) |
| <a id="getorders"></a> `getOrders?` | `FunctionReference`\<`"action"`, `"public"`, [`OrdersArgs`](#ordersargs), \| [`BillingPage`](#billingpage)\<[`BillingOrder`](#billingorder)\> \| [`BillingOrder`](#billingorder)[] \| `null`\> | [src/runtime/vue/composables/use-billing.ts:212](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L212) |
| <a id="getinvoiceurl"></a> `getInvoiceUrl?` | `FunctionReference`\<`"action"`, `"public"`, \{ `orderId`: `string`; \}, \| \{ `url`: `string`; \} \| `null`\> | [src/runtime/vue/composables/use-billing.ts:213](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L213) |
| <a id="getusagehistory"></a> `getUsageHistory?` | `FunctionReference`\<`"action"`, `"public"`, [`UsageArgs`](#usageargs), \| [`BillingPage`](#billingpage)\<[`UsageEvent`](#usageevent)\> \| [`UsageEvent`](#usageevent)[] \| `null`\> | [src/runtime/vue/composables/use-billing.ts:214](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L214) |
| <a id="getfeatures"></a> `getFeatures?` | `Query`\<[`Features`](#features) \| `null`\> | [src/runtime/vue/composables/use-billing.ts:215](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L215) |
| <a id="getcredits"></a> `getCredits?` | `Query`\<[`Credits`](#credits) \| `null`\> | [src/runtime/vue/composables/use-billing.ts:216](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L216) |
| <a id="syncentitlements"></a> `syncEntitlements?` | `FunctionReference`\<`"action"`, `"public"`, `EmptyArgs`, `null`\> | [src/runtime/vue/composables/use-billing.ts:217](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L217) |
| <a id="giftcheckout"></a> `giftCheckout?` | `FunctionReference`\<`"action"`, `"public"`, [`GiftCheckoutArgs`](#giftcheckoutargs), \{ `url`: `string`; \}\> | [src/runtime/vue/composables/use-billing.ts:218](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L218) |
| <a id="getreceivedgifts"></a> `getReceivedGifts?` | `Query`\<[`ReceivedGift`](#receivedgift)[] \| `null`\> | [src/runtime/vue/composables/use-billing.ts:219](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L219) |
| <a id="claimgift"></a> `claimGift?` | `FunctionReference`\<`"action"`, `"public"`, \{ `giftId?`: `string`; \}, \{ `claimed`: `number`; \}\> | [src/runtime/vue/composables/use-billing.ts:220](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L220) |

***

### ReceivedGift

Defined in: [src/runtime/vue/composables/use-billing.ts:249](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L249)

A gift addressed to the current user (`getReceivedGifts` shape).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-2"></a> `id` | `string` | - | [src/runtime/vue/composables/use-billing.ts:250](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L250) |
| <a id="recipientemail-1"></a> `recipientEmail` | `string` | - | [src/runtime/vue/composables/use-billing.ts:251](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L251) |
| <a id="purchaseruserid"></a> `purchaserUserId` | `string` | - | [src/runtime/vue/composables/use-billing.ts:252](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L252) |
| <a id="purchaseremail"></a> `purchaserEmail?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:253](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L253) |
| <a id="purchasername"></a> `purchaserName?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:254](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L254) |
| <a id="productids-2"></a> `productIds` | `string`[] | - | [src/runtime/vue/composables/use-billing.ts:255](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L255) |
| <a id="message-1"></a> `message?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:256](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L256) |
| <a id="status"></a> `status` | `string` | `'pending'` (awaiting payment) → `'paid'` (claimable) → `'claimed'`. | [src/runtime/vue/composables/use-billing.ts:258](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L258) |
| <a id="createdat"></a> `createdAt` | `number` | - | [src/runtime/vue/composables/use-billing.ts:259](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L259) |
| <a id="paidat"></a> `paidAt?` | `number` | - | [src/runtime/vue/composables/use-billing.ts:260](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L260) |
| <a id="claimedat"></a> `claimedAt?` | `number` | - | [src/runtime/vue/composables/use-billing.ts:261](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L261) |

***

### CheckoutOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:265](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L265)

Per-call checkout overrides for [UseBillingReturn.checkout](#checkout).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="subscriptionid-1"></a> `subscriptionId?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:266](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L266) |
| <a id="metadata-3"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [src/runtime/vue/composables/use-billing.ts:267](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L267) |
| <a id="trialinterval-1"></a> `trialInterval?` | `"day"` \| `"week"` \| `"month"` \| `"year"` \| `null` | - | [src/runtime/vue/composables/use-billing.ts:268](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L268) |
| <a id="trialintervalcount-1"></a> `trialIntervalCount?` | `number` \| `null` | - | [src/runtime/vue/composables/use-billing.ts:269](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L269) |
| <a id="locale-1"></a> `locale?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:270](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L270) |
| <a id="successurl-2"></a> `successUrl?` | `string` | Where checkout returns the customer afterwards. Defaults to the current URL. | [src/runtime/vue/composables/use-billing.ts:272](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L272) |
| <a id="redirect"></a> `redirect?` | `boolean` | Open in the same tab instead of a new one (redirect checkout). | [src/runtime/vue/composables/use-billing.ts:274](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L274) |
| <a id="prefill-1"></a> `prefill?` | [`CheckoutPrefill`](#checkoutprefill) | Pre-filled customer details — defaults the customer can still change. | [src/runtime/vue/composables/use-billing.ts:276](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L276) |
| <a id="customfields-1"></a> `customFields?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Values for the organization's custom checkout fields, keyed by field slug. | [src/runtime/vue/composables/use-billing.ts:278](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L278) |
| <a id="requirebillingaddress-1"></a> `requireBillingAddress?` | `boolean` | Require the full billing address, not just the country. | [src/runtime/vue/composables/use-billing.ts:280](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L280) |
| <a id="allowdiscountcodes-1"></a> `allowDiscountCodes?` | `boolean` | Let the customer type a discount code (default `true`). | [src/runtime/vue/composables/use-billing.ts:282](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L282) |
| <a id="discountid-1"></a> `discountId?` | `string` | Pre-apply a discount by id. Ids only — the provider's checkout payload takes no codes, and its API has no code→id lookup, so a campaign resolves its code once (`billing.discounts.list()`) and stores the id. | [src/runtime/vue/composables/use-billing.ts:288](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L288) |

***

### UseBillingOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:291](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L291)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](#billingapi) | Override the injected `api.billing` namespace (or individual references). | [src/runtime/vue/composables/use-billing.ts:293](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L293) |

***

### SubscriptionTargetOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:302](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L302)

Which subscription a lifecycle call acts on. Omit for the account's single
live subscription; required once the backend runs with
`multipleSubscriptions` and one account can hold several at a time (the ids
are on [UseBillingReturn.subscriptions](#subscriptions)).

#### Extended by

- [`ChangePlanOptions`](#changeplanoptions)
- [`CancelOptions`](#canceloptions)
- [`PauseOptions`](#pauseoptions)

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="subscriptionid-2"></a> `subscriptionId?` | `string` | [src/runtime/vue/composables/use-billing.ts:303](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L303) |

***

### ChangePlanOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:307](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L307)

Per-call options for [UseBillingReturn.changePlan](#changeplan).

#### Extends

- [`SubscriptionTargetOptions`](#subscriptiontargetoptions)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-3"></a> `subscriptionId?` | `string` | - | [`SubscriptionTargetOptions`](#subscriptiontargetoptions).[`subscriptionId`](#subscriptionid-2) | [src/runtime/vue/composables/use-billing.ts:303](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L303) |
| <a id="proration"></a> `proration?` | [`ClientProrationBehavior`](#clientprorationbehavior) | How to settle the mid-period difference. Defaults to the provider setting. Client-selectable behaviours only — see [ClientProrationBehavior](#clientprorationbehavior). | - | [src/runtime/vue/composables/use-billing.ts:312](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L312) |

***

### CancelOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:316](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L316)

Per-call options for [UseBillingReturn.cancel](#cancel).

#### Extends

- [`SubscriptionTargetOptions`](#subscriptiontargetoptions)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-4"></a> `subscriptionId?` | `string` | - | [`SubscriptionTargetOptions`](#subscriptiontargetoptions).[`subscriptionId`](#subscriptionid-2) | [src/runtime/vue/composables/use-billing.ts:303](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L303) |
| <a id="atperiodend"></a> `atPeriodEnd?` | `boolean` | Keep access until the period the customer paid for ends (default `true`). `false` revokes immediately — no refund is implied either way. | - | [src/runtime/vue/composables/use-billing.ts:321](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L321) |
| <a id="reason"></a> `reason?` | [`CancellationReason`](#cancellationreason) | Churn reason, recorded on the subscription for the provider's analytics. | - | [src/runtime/vue/composables/use-billing.ts:323](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L323) |
| <a id="comment"></a> `comment?` | `string` | The customer's own words. Visible to them in the provider's portal. | - | [src/runtime/vue/composables/use-billing.ts:325](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L325) |

***

### PauseOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:329](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L329)

Per-call options for [UseBillingReturn.pause](#pause).

#### Extends

- [`SubscriptionTargetOptions`](#subscriptiontargetoptions)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-5"></a> `subscriptionId?` | `string` | - | [`SubscriptionTargetOptions`](#subscriptiontargetoptions).[`subscriptionId`](#subscriptionid-2) | [src/runtime/vue/composables/use-billing.ts:303](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L303) |
| <a id="resumesat"></a> `resumesAt?` | `number` \| `Date` | When the subscription should resume by itself (epoch ms or `Date`). Must be after the current period end; omit to keep it paused until `resume()`. | - | [src/runtime/vue/composables/use-billing.ts:334](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L334) |

***

### UseBillingReturn

Defined in: [src/runtime/vue/composables/use-billing.ts:337](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L337)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="products"></a> `products` | `ComputedRef`\< \| `Record`\<`string`, [`BillingProduct`](#billingproduct) \| `undefined`\> \| `undefined`\> | Configured products keyed by your product map, or `undefined` while loading. | [src/runtime/vue/composables/use-billing.ts:339](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L339) |
| <a id="subscription"></a> `subscription` | `ComputedRef`\<[`BillingSubscription`](#billingsubscription) \| `null` \| `undefined`\> | The current active subscription, `null` when on the free plan, `undefined` while loading. | [src/runtime/vue/composables/use-billing.ts:341](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L341) |
| <a id="subscriptions"></a> `subscriptions` | `ComputedRef`\<[`BillingSubscription`](#billingsubscription)[] \| `undefined`\> | Every subscription for the user (incl. ended/expired trials), or `undefined` while loading. | [src/runtime/vue/composables/use-billing.ts:343](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L343) |
| <a id="issubscribed"></a> `isSubscribed` | `ComputedRef`\<`boolean`\> | `true` once an active subscription is known. | [src/runtime/vue/composables/use-billing.ts:345](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L345) |
| <a id="isfree"></a> `isFree` | `ComputedRef`\<`boolean`\> | `true` once it's known the user has no active subscription. | [src/runtime/vue/composables/use-billing.ts:347](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L347) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until the subscription state has loaded. | [src/runtime/vue/composables/use-billing.ts:349](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L349) |
| <a id="status-1"></a> `status` | `ComputedRef`\<`string` \| `null` \| `undefined`\> | Provider subscription status (`active`, `trialing`, `past_due`, `paused`, `canceled`, …), `null` on the free plan, `undefined` while loading. | [src/runtime/vue/composables/use-billing.ts:354](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L354) |
| <a id="cancelatperiodend"></a> `cancelAtPeriodEnd` | `ComputedRef`\<`boolean`\> | `true` when the subscription is set to end when the paid period does. | [src/runtime/vue/composables/use-billing.ts:356](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L356) |
| <a id="pausedat"></a> `pausedAt` | `ComputedRef`\<`Date` \| `null`\> | When the subscription was paused, `null` while it is running. Read off the webhook-synced subscription row, whose columns are the provider component's — and that table carries no `paused_at` today, so this reads `null` until it does. Use [UseBillingReturn.isPaused](#ispaused), which also derives from `status`, to drive a paused-state UI. | [src/runtime/vue/composables/use-billing.ts:365](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L365) |
| <a id="resumesat-1"></a> `resumesAt` | `ComputedRef`\<`Date` \| `null`\> | When a paused subscription resumes by itself, `null` when nothing is scheduled. Same caveat as [UseBillingReturn.pausedAt](#pausedat): the synced subscription row has no `resumes_at` column yet, so this is `null` until the provider component adds one. | [src/runtime/vue/composables/use-billing.ts:372](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L372) |
| <a id="trialend"></a> `trialEnd` | `ComputedRef`\<`Date` \| `null`\> | End of the trial period, `null` when the plan has no trial. | [src/runtime/vue/composables/use-billing.ts:374](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L374) |
| <a id="istrialing"></a> `isTrialing` | `ComputedRef`\<`boolean`\> | `true` while the subscription is in its trial period. | [src/runtime/vue/composables/use-billing.ts:376](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L376) |
| <a id="ispaused"></a> `isPaused` | `ComputedRef`\<`boolean`\> | `true` while the subscription is paused. | [src/runtime/vue/composables/use-billing.ts:378](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L378) |
| <a id="pendingupdate"></a> `pendingUpdate` | `ComputedRef`\<[`PendingPlanUpdate`](#pendingplanupdate) \| `null`\> | A plan change already scheduled for the next period, `null` when none. Like [UseBillingReturn.pausedAt](#pausedat), this reads off the synced subscription row, which has no `pending_update` column yet — so it is `null` until the provider component syncs one. | [src/runtime/vue/composables/use-billing.ts:385](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L385) |
| <a id="checkout"></a> `checkout` | (`productIds`, `options?`) => `Promise`\<`string`\> | Generate a checkout for the given product(s) and open it (returns the URL). | [src/runtime/vue/composables/use-billing.ts:387](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L387) |
| <a id="gift"></a> `gift` | (`productIds`, `options`) => `Promise`\<`string`\> | Buy the given product(s) as a gift for someone else (by email). Opens checkout. | [src/runtime/vue/composables/use-billing.ts:389](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L389) |
| <a id="portal"></a> `portal` | (`options?`) => `Promise`\<`string`\> | Open the billing customer portal (returns the URL). | [src/runtime/vue/composables/use-billing.ts:391](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L391) |
| <a id="changeplan"></a> `changePlan` | (`productId`, `options?`) => `Promise`\<`void`\> | Switch the active subscription to another product (upgrade/downgrade). | [src/runtime/vue/composables/use-billing.ts:393](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L393) |
| <a id="cancel"></a> `cancel` | (`options?`) => `Promise`\<`void`\> | Cancel the active subscription — at period end by default. | [src/runtime/vue/composables/use-billing.ts:395](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L395) |
| <a id="uncancel"></a> `uncancel` | (`options?`) => `Promise`\<`void`\> | Undo a pending cancellation, putting the subscription back on renewal. | [src/runtime/vue/composables/use-billing.ts:397](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L397) |
| <a id="pause"></a> `pause` | (`options?`) => `Promise`\<`void`\> | Pause the subscription at the end of the current period. | [src/runtime/vue/composables/use-billing.ts:399](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L399) |
| <a id="resume"></a> `resume` | (`options?`) => `Promise`\<`void`\> | Resume a paused subscription immediately (starts a new billing period). | [src/runtime/vue/composables/use-billing.ts:401](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L401) |

***

### ProviderPager

Defined in: [src/runtime/vue/composables/use-billing.ts:494](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L494)

Reactive paging over a provider history endpoint (see [createProviderPager](#createproviderpager)).

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="items-1"></a> `items` | `Ref`\<`Item`[] \| `undefined`\> | The current page's records — `undefined` until the first load resolves. | [src/runtime/vue/composables/use-billing.ts:496](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L496) |
| <a id="page-2"></a> `page` | `Ref`\<`number`\> | The page being shown; provider page numbers start at 1. | [src/runtime/vue/composables/use-billing.ts:498](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L498) |
| <a id="total"></a> `total` | `ComputedRef`\<`number` \| `undefined`\> | Total records across all pages, when the provider reported it. | [src/runtime/vue/composables/use-billing.ts:500](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L500) |
| <a id="pagecount"></a> `pageCount` | `ComputedRef`\<`number` \| `undefined`\> | Number of pages, when the provider reported it. | [src/runtime/vue/composables/use-billing.ts:502](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L502) |
| <a id="hasmore"></a> `hasMore` | `ComputedRef`\<`boolean`\> | Whether a further page exists. | [src/runtime/vue/composables/use-billing.ts:504](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L504) |
| <a id="hasprevious"></a> `hasPrevious` | `ComputedRef`\<`boolean`\> | Whether an earlier page exists. | [src/runtime/vue/composables/use-billing.ts:506](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L506) |
| <a id="isloading-1"></a> `isLoading` | `ComputedRef`\<`boolean`\> | Whether a load is in flight. | [src/runtime/vue/composables/use-billing.ts:508](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L508) |
| <a id="error"></a> `error` | `Ref`\<`string` \| `null`\> | Message of the last failed load, `null` otherwise. Loads never reject. | [src/runtime/vue/composables/use-billing.ts:510](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L510) |
| <a id="refresh"></a> `refresh` | () => `Promise`\<`void`\> | Reload the current page. | [src/runtime/vue/composables/use-billing.ts:512](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L512) |
| <a id="next"></a> `next` | () => `Promise`\<`void`\> | Load the next page (no-op at the end). | [src/runtime/vue/composables/use-billing.ts:514](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L514) |
| <a id="previous"></a> `previous` | () => `Promise`\<`void`\> | Load the previous page (no-op on page 1). | [src/runtime/vue/composables/use-billing.ts:516](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L516) |
| <a id="goto"></a> `goTo` | (`page`) => `Promise`\<`void`\> | Jump to a page number. | [src/runtime/vue/composables/use-billing.ts:518](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L518) |

***

### ProviderPagerOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:522](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L522)

Options for [createProviderPager](#createproviderpager).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="limit-2"></a> `limit?` | `MaybeRefOrGetter`\<`number` \| `undefined`\> | Records per page. Reactive — changing it reloads from page 1. | [src/runtime/vue/composables/use-billing.ts:524](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L524) |
| <a id="immediate"></a> `immediate?` | `boolean` | Load the first page on mount. Default `true`. | [src/runtime/vue/composables/use-billing.ts:526](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L526) |
| <a id="enabled"></a> `enabled?` | () => `boolean` | While this is `false` the pager stays empty and never calls out. | [src/runtime/vue/composables/use-billing.ts:528](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L528) |
| <a id="watchsources"></a> `watchSources?` | () => `unknown` | Extra reactive inputs that should reload from page 1 when they change. | [src/runtime/vue/composables/use-billing.ts:530](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L530) |

***

### GiftOptions

Defined in: [src/runtime/vue/composables/use-billing.ts:628](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L628)

Per-call options for [UseBillingReturn.gift](#gift).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="message-2"></a> `message?` | `string` | A note shown to the recipient in the gift email. | [src/runtime/vue/composables/use-billing.ts:630](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L630) |
| <a id="metadata-4"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [src/runtime/vue/composables/use-billing.ts:631](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L631) |
| <a id="successurl-3"></a> `successUrl?` | `string` | Where the purchaser returns after paying. Defaults to the current URL. | [src/runtime/vue/composables/use-billing.ts:633](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L633) |
| <a id="redirect-1"></a> `redirect?` | `boolean` | Open in the same tab instead of a new one (redirect checkout). | [src/runtime/vue/composables/use-billing.ts:635](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L635) |

## Type Aliases

### BillingProduct

```ts
type BillingProduct = {
  id: string;
  name: string;
} & Record<string, unknown>;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L8)

A billing-provider product (loose — the provider owns the full shape; cast as needed).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `string` | [src/runtime/vue/composables/use-billing.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L8) |
| `name` | `string` | [src/runtime/vue/composables/use-billing.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L8) |

***

### BillingSubscription

```ts
type BillingSubscription = {
  id: string;
  status: string;
  productId: string;
} & Record<string, unknown>;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L10)

A billing-provider subscription (loose — the provider owns the full shape; cast as needed).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `string` | [src/runtime/vue/composables/use-billing.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L10) |
| `status` | `string` | [src/runtime/vue/composables/use-billing.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L10) |
| `productId` | `string` | [src/runtime/vue/composables/use-billing.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L10) |

***

### BillingOrder

```ts
type BillingOrder = {
  id: string;
  createdAt: string;
  status: string;
  totalAmount: number;
  currency: string;
  paid?: boolean;
  invoiceNumber?: string | null;
  isInvoiceGenerated?: boolean;
  billingReason?: string;
  productId?: string | null;
  subscriptionId?: string | null;
  product?:   | {
     id: string;
     name: string;
   }
     | null;
} & Record<string, unknown>;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L17)

A past charge, as the provider's orders API returns it. Field names mirror
the provider `Order` shape so nothing is lost in translation; the index
signature keeps the rest reachable without a cast.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `id` | `string` | - | [src/runtime/vue/composables/use-billing.ts:18](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L18) |
| `createdAt` | `string` | ISO timestamp of the charge. | [src/runtime/vue/composables/use-billing.ts:20](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L20) |
| `status` | `string` | - | [src/runtime/vue/composables/use-billing.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L21) |
| `totalAmount` | `number` | Amount in the currency's minor unit (cents), after discounts and taxes. | [src/runtime/vue/composables/use-billing.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L23) |
| `currency` | `string` | - | [src/runtime/vue/composables/use-billing.ts:24](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L24) |
| `paid?` | `boolean` | - | [src/runtime/vue/composables/use-billing.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L25) |
| `invoiceNumber?` | `string` \| `null` | Assigned when the invoice is finalized; `null` on draft orders. | [src/runtime/vue/composables/use-billing.ts:27](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L27) |
| `isInvoiceGenerated?` | `boolean` | Whether an invoice PDF exists yet — `getInvoiceUrl` needs one. | [src/runtime/vue/composables/use-billing.ts:29](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L29) |
| `billingReason?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L30) |
| `productId?` | `string` \| `null` | - | [src/runtime/vue/composables/use-billing.ts:31](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L31) |
| `subscriptionId?` | `string` \| `null` | - | [src/runtime/vue/composables/use-billing.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L32) |
| `product?` | \| \{ `id`: `string`; `name`: `string`; \} \| `null` | - | [src/runtime/vue/composables/use-billing.ts:33](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L33) |

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

Defined in: [src/runtime/vue/composables/use-billing.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L42)

One ingested usage event, as the provider's events API returns it — the
source of truth for consumption history (this package keeps no local
usage ledger). `units` is resolved server-side from the meter's value
property and is absent when the meter is unknown.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `id` | `string` | - | [src/runtime/vue/composables/use-billing.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L43) |
| `timestamp` | `string` | ISO timestamp of the event. | [src/runtime/vue/composables/use-billing.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L45) |
| `name` | `string` | The ingested event name (the one the meter filters on). | [src/runtime/vue/composables/use-billing.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L47) |
| `units?` | `number` | - | [src/runtime/vue/composables/use-billing.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L48) |
| `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | - | [src/runtime/vue/composables/use-billing.ts:49](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L49) |

***

### ClientProrationBehavior

```ts
type ClientProrationBehavior = "invoice" | "prorate";
```

Defined in: [src/runtime/vue/composables/use-billing.ts:69](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L69)

The subset of the provider's proration behaviours a **client** may choose
(`ProrationBehavior` in `nuxt-backend/billing` has all four). `invoice` and
`prorate` settle the difference now; `next_period` and `reset` hand over the
new plan immediately while deferring or waiving the charge, so they stay
server-side — pass them from your own Convex action via
`billing.updateSubscription(ctx, …)`, or make one the organization's default.

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

Defined in: [src/runtime/vue/composables/use-billing.ts:72](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L72)

The provider's churn-reason enum, recorded with a cancellation.

***

### CheckoutArgs

```ts
type CheckoutArgs = {
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

Defined in: [src/runtime/vue/composables/use-billing.ts:169](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L169)

Args of the generated `generateCheckoutLink` action.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="productids"></a> `productIds` | `string`[] | - | [src/runtime/vue/composables/use-billing.ts:170](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L170) |
| <a id="origin"></a> `origin` | `string` | - | [src/runtime/vue/composables/use-billing.ts:171](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L171) |
| <a id="successurl"></a> `successUrl` | `string` | - | [src/runtime/vue/composables/use-billing.ts:172](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L172) |
| <a id="subscriptionid"></a> `subscriptionId?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:173](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L173) |
| <a id="metadata-1"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [src/runtime/vue/composables/use-billing.ts:174](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L174) |
| <a id="trialinterval"></a> `trialInterval?` | `"day"` \| `"week"` \| `"month"` \| `"year"` \| `null` | - | [src/runtime/vue/composables/use-billing.ts:175](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L175) |
| <a id="trialintervalcount"></a> `trialIntervalCount?` | `number` \| `null` | - | [src/runtime/vue/composables/use-billing.ts:176](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L176) |
| <a id="locale"></a> `locale?` | `string` | - | [src/runtime/vue/composables/use-billing.ts:177](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L177) |
| <a id="prefill"></a> `prefill?` | [`CheckoutPrefill`](#checkoutprefill) | - | [src/runtime/vue/composables/use-billing.ts:178](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L178) |
| <a id="customfields"></a> `customFields?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Values for the organization's custom checkout fields, keyed by field slug. | [src/runtime/vue/composables/use-billing.ts:180](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L180) |
| <a id="requirebillingaddress"></a> `requireBillingAddress?` | `boolean` | Require the full billing address, not just the country. | [src/runtime/vue/composables/use-billing.ts:182](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L182) |
| <a id="allowdiscountcodes"></a> `allowDiscountCodes?` | `boolean` | Let the customer type a discount code (default `true`). | [src/runtime/vue/composables/use-billing.ts:184](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L184) |
| <a id="discountid"></a> `discountId?` | `string` | Pre-apply a discount by id — the only form the provider's checkout takes. | [src/runtime/vue/composables/use-billing.ts:186](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L186) |

***

### OrdersArgs

```ts
type OrdersArgs = {
  page?: number;
  limit?: number;
};
```

Defined in: [src/runtime/vue/composables/use-billing.ts:224](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L224)

Args of the `getOrders` action — provider page numbers start at 1.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="page"></a> `page?` | `number` | [src/runtime/vue/composables/use-billing.ts:224](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L224) |
| <a id="limit"></a> `limit?` | `number` | [src/runtime/vue/composables/use-billing.ts:224](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L224) |

***

### UsageArgs

```ts
type UsageArgs = {
  meter?: string;
  page?: number;
  limit?: number;
  startTimestamp?: number;
  endTimestamp?: number;
};
```

Defined in: [src/runtime/vue/composables/use-billing.ts:227](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L227)

Args of the `getUsageHistory` action (provider event history for one meter).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter"></a> `meter?` | `string` | A configured credit-meter name, or a raw meter id. | [src/runtime/vue/composables/use-billing.ts:229](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L229) |
| <a id="page-1"></a> `page?` | `number` | - | [src/runtime/vue/composables/use-billing.ts:230](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L230) |
| <a id="limit-1"></a> `limit?` | `number` | - | [src/runtime/vue/composables/use-billing.ts:231](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L231) |
| <a id="starttimestamp"></a> `startTimestamp?` | `number` | Epoch milliseconds — only events at or after this moment. | [src/runtime/vue/composables/use-billing.ts:233](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L233) |
| <a id="endtimestamp"></a> `endTimestamp?` | `number` | Epoch milliseconds — only events at or before this moment. | [src/runtime/vue/composables/use-billing.ts:235](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L235) |

***

### GiftCheckoutArgs

```ts
type GiftCheckoutArgs = {
  productIds: string[];
  recipientEmail: string;
  message?: string;
  origin: string;
  successUrl: string;
  metadata?: Record<string, string>;
};
```

Defined in: [src/runtime/vue/composables/use-billing.ts:239](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L239)

Args of the `giftCheckout` action (a checkout whose recipient is someone else).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="productids-1"></a> `productIds` | `string`[] | [src/runtime/vue/composables/use-billing.ts:240](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L240) |
| <a id="recipientemail"></a> `recipientEmail` | `string` | [src/runtime/vue/composables/use-billing.ts:241](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L241) |
| <a id="message"></a> `message?` | `string` | [src/runtime/vue/composables/use-billing.ts:242](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L242) |
| <a id="origin-1"></a> `origin` | `string` | [src/runtime/vue/composables/use-billing.ts:243](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L243) |
| <a id="successurl-1"></a> `successUrl` | `string` | [src/runtime/vue/composables/use-billing.ts:244](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L244) |
| <a id="metadata-2"></a> `metadata?` | `Record`\<`string`, `string`\> | [src/runtime/vue/composables/use-billing.ts:245](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L245) |

***

### PageFetcher

```ts
type PageFetcher<Item> = (args) => Promise<BillingPage<Item> | Item[] | null>;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:491](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L491)

Fetches one page from a provider-history action.

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | \{ `page`: `number`; `limit?`: `number`; \} |
| `args.page` | `number` |
| `args.limit?` | `number` |

#### Returns

`Promise`\<[`BillingPage`](#billingpage)\<`Item`\> \| `Item`[] \| `null`\>

## Functions

### toBillingDate()

```ts
function toBillingDate(value): Date | null;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:417](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L417)

Provider timestamps reach the client as ISO strings (the component's cache
stores them that way) but as epoch numbers when an action forwards the SDK's
`Date` through Convex's JSON wire. Accept both, and never hand a component an
`Invalid Date`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

#### Returns

`Date` \| `null`

***

### formatBillingAmount()

```ts
function formatBillingAmount(amount, currency?): string;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:430](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L430)

Money the way the provider states it — a minor-unit integer plus an ISO
currency code — rendered in the visitor's own locale. Unknown currency codes
fall back to the bare amount rather than throwing mid-render.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `amount` | `number` |
| `currency?` | `string` \| `null` |

#### Returns

`string`

***

### createCheckout()

```ts
function createCheckout(billing): (productIds, opts) => Promise<string>;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:453](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L453)

Build a `checkout(productIds, options)` action over a billing namespace —
shared by [useBilling](#usebilling) (subscriptions) and useCredits (top-ups),
since a credit-pack top-up is just a checkout for a one-time product. Must be
called during component setup (it sets up the underlying action).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `billing` | [`BillingApi`](#billingapi) |

#### Returns

(`productIds`, `opts`) => `Promise`\<`string`\>

***

### createProviderPager()

```ts
function createProviderPager<Item>(fetchPage, options?): ProviderPager<Item>;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:544](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L544)

The reactive paging both provider-history composables need — `useOrders`
and `useUsage` differ only in what they fetch. Provider history lives behind
page numbers rather than a cursor, so this tracks a page and its totals.

Loads run in the browser only (they need a Convex client and the signed-in
identity), never reject — a failure lands in `error` so a permanently
mounted history panel cannot break a page — and stay put when `fetchPage` is
`null`, which is how an undeployed backend function degrades. Must be called
during component setup.

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fetchPage` | [`PageFetcher`](#pagefetcher)\<`Item`\> \| `null` |
| `options` | [`ProviderPagerOptions`](#providerpageroptions) |

#### Returns

[`ProviderPager`](#providerpager)\<`Item`\>

***

### createGiftCheckout()

```ts
function createGiftCheckout(billing): (productIds, opts) => Promise<string>;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:646](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L646)

Build a `gift(productIds, { recipientEmail, ... })` action over a billing
namespace — shared by [useBilling](#usebilling) and useCredits (gifting a
credit pack is just a gift checkout of a one-time product). The purchaser
pays; the recipient (by email) receives the entitlement — attached
automatically if they have an account, claimable on first sign-in otherwise.
Must be called during component setup.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `billing` | [`BillingApi`](#billingapi) |

#### Returns

(`productIds`, `opts`) => `Promise`\<`string`\>

***

### useBilling()

```ts
function useBilling(options?): UseBillingReturn;
```

Defined in: [src/runtime/vue/composables/use-billing.ts:692](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L692)

Reactive billing state plus the full subscription lifecycle — checkout,
gift, portal, plan change, cancel/uncancel, pause/resume — linked to your
auth user. Works with no arguments via the auto-provided `api.billing`
namespace; pass `{ api }` to override.

Lifecycle reads (`status`, `cancelAtPeriodEnd`, `trialEnd`, `pausedAt`,
`pendingUpdate`, …) come straight off the provider's subscription record,
and every action degrades on its own: a backend that has not deployed the
matching function reads as "not set" and throws only when actually called.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`UseBillingOptions`](#usebillingoptions) |

#### Returns

[`UseBillingReturn`](#usebillingreturn)

#### Example

```vue
<script setup lang="ts">
const billing = useBilling()
</script>
<template>
  <p v-if="billing.isSubscribed.value">Pro</p>
  <button @click="billing.checkout(productId, { trialInterval: 'day', trialIntervalCount: 7 })">
    Upgrade
  </button>
</template>
```
