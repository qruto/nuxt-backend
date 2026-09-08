---
navigation: true
---

# runtime/vue/composables/use-billing

## Interfaces

### BillingPage

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L55)

A page of provider records. The provider paginates by page number (not
cursor), so `pagination` carries the totals rather than a next token.

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="items"></a> `items` | `Item`[] | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:56](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L56) |
| <a id="pagination"></a> `pagination?` | \{ `totalCount`: `number`; `maxPage`: `number`; \} | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L57) |
| `pagination.totalCount` | `number` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L57) |
| `pagination.maxPage` | `number` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L57) |

***

### PendingPlanUpdate

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:92](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L92)

A scheduled plan change that takes effect next period (the provider's
`pendingUpdate`). Seats are deliberately absent — this package does not do
per-seat billing.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:93](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L93) |
| <a id="appliesat"></a> `appliesAt` | `Date` \| `null` | When the change takes effect; `null` when the provider did not say. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:95](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L95) |
| <a id="productid"></a> `productId` | `string` \| `null` | The product the subscription switches to, `null` when unchanged. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:97](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L97) |

***

### EntitlementBenefit

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:104](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L104)

A granted benefit — the unit of feature-gating (`useFeatures().has()`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:105](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L105) |
| <a id="benefitid"></a> `benefitId` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:106](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L106) |
| <a id="type"></a> `type` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:107](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L107) |
| <a id="metadata"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | The benefit's live provider metadata (not the grant-time snapshot). Set a stable key here (e.g. `{ key: 'premium' }`) to feature-gate by a friendly name — `useFeatures().has('premium')` matches any metadata value. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L113) |

***

### EntitlementMeter

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:117](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L117)

A prepaid credit-meter balance (`useCredits()`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meterid"></a> `meterId` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:118](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L118) |
| <a id="name"></a> `name?` | `string` | The configured friendly name (`setupBilling({ credits })` / catalog key). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L120) |
| <a id="consumedunits"></a> `consumedUnits` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:121](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L121) |
| <a id="creditedunits"></a> `creditedUnits` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:122](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L122) |
| <a id="balance"></a> `balance` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:123](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L123) |
| <a id="cyclestart"></a> `cycleStart?` | `number` | The granting subscription's current period (epoch ms), when it has one — a meter has no period of its own in the provider's model, and one bought as a one-time credit pack has no cycle at all. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:129](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L129) |
| <a id="cycleend"></a> `cycleEnd?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:130](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L130) |
| <a id="rollover"></a> `rollover?` | `boolean` | Whether unspent credited units carry into the next cycle. Only known on the syncs that re-read the granting benefit, so `undefined` means "not said", never "no". | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:136](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L136) |

***

### Features

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:140](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L140)

Feature-gating state for the current user, as returned by `getFeatures`.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="plans"></a> `plans` | `string`[] | Active product ids the user is subscribed to. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:142](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L142) |
| <a id="benefits"></a> `benefits` | [`EntitlementBenefit`](#entitlementbenefit)[] | Granted benefits. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:144](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L144) |

***

### Credits

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:148](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L148)

Prepaid credit balances for the current user, as returned by `getCredits`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meters"></a> `meters` | [`EntitlementMeter`](#entitlementmeter)[] | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:149](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L149) |

***

### CheckoutPrefill

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:153](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L153)

Pre-filled customer details for a checkout session (all still editable).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="name-1"></a> `name?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:154](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L154) |
| <a id="email"></a> `email?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:155](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L155) |
| <a id="billingname"></a> `billingName?` | `string` | The name that should appear on the invoice, when it differs from `name`. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:157](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L157) |
| <a id="billingaddress"></a> `billingAddress?` | \{ `country`: `string`; `line1?`: `string`; `line2?`: `string`; `postalCode?`: `string`; `city?`: `string`; `state?`: `string`; \} | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:158](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L158) |
| `billingAddress.country` | `string` | ISO 3166-1 alpha-2 country code — the one field the provider requires. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:160](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L160) |
| `billingAddress.line1?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:161](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L161) |
| `billingAddress.line2?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:162](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L162) |
| `billingAddress.postalCode?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L163) |
| `billingAddress.city?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:164](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L164) |
| `billingAddress.state?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:165](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L165) |
| <a id="taxid"></a> `taxId?` | `string` | VAT / tax identification number. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:168](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L168) |
| <a id="business"></a> `business?` | `boolean` | Bill a business: the provider then requires a full address and name. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:170](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L170) |

***

### BillingApi

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:200](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L200)

The billing function references — the result of `setupBilling().api` re-exported
from your `backend/billing.ts` (plus the optional `getCurrentSubscription`
query). Supplied automatically from the injected `api.billing` namespace;
pass `options.api` to override.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="getconfiguredproducts"></a> `getConfiguredProducts?` | `Query`\<`Record`\<`string`, [`BillingProduct`](#billingproduct) \| `undefined`\>\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:201](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L201) |
| <a id="listallproducts"></a> `listAllProducts?` | `Query`\<[`BillingProduct`](#billingproduct)[]\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:202](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L202) |
| <a id="listallsubscriptions"></a> `listAllSubscriptions?` | `Query`\<[`BillingSubscription`](#billingsubscription)[] \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:203](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L203) |
| <a id="getcurrentsubscription"></a> `getCurrentSubscription?` | `Query`\<[`BillingSubscription`](#billingsubscription) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:204](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L204) |
| <a id="generatecheckoutlink"></a> `generateCheckoutLink?` | `FunctionReference`\<`"action"`, `"public"`, [`CheckoutArgs`](#checkoutargs), \{ `url`: `string`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:205](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L205) |
| <a id="generatecustomerportalurl"></a> `generateCustomerPortalUrl?` | `FunctionReference`\<`"action"`, `"public"`, \{ `returnUrl?`: `string`; \}, \{ `url`: `string`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:206](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L206) |
| <a id="changecurrentsubscription"></a> `changeCurrentSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `productId`: `string`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:207](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L207) |
| <a id="cancelcurrentsubscription"></a> `cancelCurrentSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `revokeImmediately?`: `boolean`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:208](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L208) |
| <a id="updatesubscription"></a> `updateSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; `productId?`: `string`; `proration?`: [`ClientProrationBehavior`](#clientprorationbehavior); \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:212](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L212) |
| <a id="cancelsubscription"></a> `cancelSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; `atPeriodEnd?`: `boolean`; `reason?`: [`CancellationReason`](#cancellationreason); `comment?`: `string`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:213](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L213) |
| <a id="uncancelsubscription"></a> `uncancelSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:214](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L214) |
| <a id="pausesubscription"></a> `pauseSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; `resumesAt?`: `number`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:215](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L215) |
| <a id="resumesubscription"></a> `resumeSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `subscriptionId?`: `string`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:216](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L216) |
| <a id="getorders"></a> `getOrders?` | `FunctionReference`\<`"action"`, `"public"`, [`OrdersArgs`](#ordersargs), \| [`BillingPage`](#billingpage)\<[`BillingOrder`](#billingorder)\> \| [`BillingOrder`](#billingorder)[] \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:217](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L217) |
| <a id="getinvoiceurl"></a> `getInvoiceUrl?` | `FunctionReference`\<`"action"`, `"public"`, \{ `orderId`: `string`; \}, \| \{ `url`: `string`; \} \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:218](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L218) |
| <a id="getusagehistory"></a> `getUsageHistory?` | `FunctionReference`\<`"action"`, `"public"`, [`UsageArgs`](#usageargs), \| [`BillingPage`](#billingpage)\<[`UsageEvent`](#usageevent)\> \| [`UsageEvent`](#usageevent)[] \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:219](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L219) |
| <a id="getfeatures"></a> `getFeatures?` | `Query`\<[`Features`](#features) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:220](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L220) |
| <a id="getcredits"></a> `getCredits?` | `Query`\<[`Credits`](#credits) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:221](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L221) |
| <a id="syncentitlements"></a> `syncEntitlements?` | `FunctionReference`\<`"action"`, `"public"`, `EmptyArgs`, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:222](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L222) |
| <a id="giftcheckout"></a> `giftCheckout?` | `FunctionReference`\<`"action"`, `"public"`, [`GiftCheckoutArgs`](#giftcheckoutargs), \{ `url`: `string`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:223](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L223) |
| <a id="getreceivedgifts"></a> `getReceivedGifts?` | `Query`\<[`ReceivedGift`](#receivedgift)[] \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:224](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L224) |
| <a id="claimgift"></a> `claimGift?` | `FunctionReference`\<`"action"`, `"public"`, \{ `giftId?`: `string`; \}, \{ `claimed`: `number`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:225](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L225) |

***

### ReceivedGift

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:254](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L254)

A gift addressed to the current user (`getReceivedGifts` shape).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-2"></a> `id` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:255](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L255) |
| <a id="recipientemail-1"></a> `recipientEmail` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:256](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L256) |
| <a id="purchaseruserid"></a> `purchaserUserId` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:257](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L257) |
| <a id="purchaseremail"></a> `purchaserEmail?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:258](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L258) |
| <a id="purchasername"></a> `purchaserName?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:259](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L259) |
| <a id="productids-2"></a> `productIds` | `string`[] | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:260](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L260) |
| <a id="message-1"></a> `message?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:261](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L261) |
| <a id="status"></a> `status` | `string` | `'pending'` (awaiting payment) → `'paid'` (claimable) → `'claimed'`. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:263](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L263) |
| <a id="createdat"></a> `createdAt` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:264](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L264) |
| <a id="paidat"></a> `paidAt?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:265](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L265) |
| <a id="claimedat"></a> `claimedAt?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:266](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L266) |

***

### CheckoutOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:270](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L270)

Per-call checkout overrides for [UseBillingReturn.checkout](#checkout).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="subscriptionid-1"></a> `subscriptionId?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:271](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L271) |
| <a id="metadata-3"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:272](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L272) |
| <a id="trialinterval-1"></a> `trialInterval?` | `"day"` \| `"week"` \| `"month"` \| `"year"` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:273](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L273) |
| <a id="trialintervalcount-1"></a> `trialIntervalCount?` | `number` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:274](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L274) |
| <a id="locale-1"></a> `locale?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:275](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L275) |
| <a id="successurl-2"></a> `successUrl?` | `string` | Where checkout returns the customer afterwards. Defaults to the current URL. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:277](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L277) |
| <a id="redirect"></a> `redirect?` | `boolean` | Open in the same tab instead of a new one (redirect checkout). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:279](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L279) |
| <a id="prefill-1"></a> `prefill?` | [`CheckoutPrefill`](#checkoutprefill) | Pre-filled customer details — defaults the customer can still change. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:281](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L281) |
| <a id="customfields-1"></a> `customFields?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Values for the organization's custom checkout fields, keyed by field slug. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:283](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L283) |
| <a id="requirebillingaddress-1"></a> `requireBillingAddress?` | `boolean` | Require the full billing address, not just the country. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:285](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L285) |
| <a id="allowdiscountcodes-1"></a> `allowDiscountCodes?` | `boolean` | Let the customer type a discount code (default `true`). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:287](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L287) |
| <a id="discountid-1"></a> `discountId?` | `string` | Pre-apply a discount by id. Ids only — the provider's checkout payload takes no codes, and its API has no code→id lookup, so a campaign resolves its code once (`billing.discounts.list()`) and stores the id. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:293](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L293) |

***

### UseBillingOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:296](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L296)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](#billingapi) | Override the injected `api.billing` namespace (or individual references). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:298](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L298) |

***

### SubscriptionTargetOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:307](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L307)

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
| <a id="subscriptionid-2"></a> `subscriptionId?` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:308](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L308) |

***

### ChangePlanOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:312](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L312)

Per-call options for [UseBillingReturn.changePlan](#changeplan).

#### Extends

- [`SubscriptionTargetOptions`](#subscriptiontargetoptions)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-3"></a> `subscriptionId?` | `string` | - | [`SubscriptionTargetOptions`](#subscriptiontargetoptions).[`subscriptionId`](#subscriptionid-2) | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:308](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L308) |
| <a id="proration"></a> `proration?` | [`ClientProrationBehavior`](#clientprorationbehavior) | How to settle the mid-period difference. Defaults to the provider setting. Client-selectable behaviours only — see [ClientProrationBehavior](#clientprorationbehavior). | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:317](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L317) |

***

### CancelOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:321](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L321)

Per-call options for [UseBillingReturn.cancel](#cancel).

#### Extends

- [`SubscriptionTargetOptions`](#subscriptiontargetoptions)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-4"></a> `subscriptionId?` | `string` | - | [`SubscriptionTargetOptions`](#subscriptiontargetoptions).[`subscriptionId`](#subscriptionid-2) | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:308](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L308) |
| <a id="atperiodend"></a> `atPeriodEnd?` | `boolean` | Keep access until the period the customer paid for ends (default `true`). `false` revokes immediately — no refund is implied either way. | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:326](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L326) |
| <a id="revokeimmediately"></a> ~~`revokeImmediately?`~~ | `boolean` | **Deprecated** Use `atPeriodEnd` (its inverse). Still honoured — a money-affecting option is never silently ignored — and removed in a later minor. `atPeriodEnd` wins when both are given. | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:332](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L332) |
| <a id="reason"></a> `reason?` | [`CancellationReason`](#cancellationreason) | Churn reason, recorded on the subscription for the provider's analytics. | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:334](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L334) |
| <a id="comment"></a> `comment?` | `string` | The customer's own words. Visible to them in the provider's portal. | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:336](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L336) |

***

### PauseOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:340](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L340)

Per-call options for [UseBillingReturn.pause](#pause).

#### Extends

- [`SubscriptionTargetOptions`](#subscriptiontargetoptions)

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="subscriptionid-5"></a> `subscriptionId?` | `string` | - | [`SubscriptionTargetOptions`](#subscriptiontargetoptions).[`subscriptionId`](#subscriptionid-2) | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:308](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L308) |
| <a id="resumesat"></a> `resumesAt?` | `number` \| `Date` | When the subscription should resume by itself (epoch ms or `Date`). Must be after the current period end; omit to keep it paused until `resume()`. | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:345](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L345) |

***

### UseBillingReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:348](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L348)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="products"></a> `products` | `ComputedRef`\< \| `Record`\<`string`, [`BillingProduct`](#billingproduct) \| `undefined`\> \| `undefined`\> | Configured products keyed by your product map, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:350](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L350) |
| <a id="subscription"></a> `subscription` | `ComputedRef`\<[`BillingSubscription`](#billingsubscription) \| `null` \| `undefined`\> | The current active subscription, `null` when on the free plan, `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:352](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L352) |
| <a id="subscriptions"></a> `subscriptions` | `ComputedRef`\<[`BillingSubscription`](#billingsubscription)[] \| `undefined`\> | Every subscription for the user (incl. ended/expired trials), or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:354](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L354) |
| <a id="issubscribed"></a> `isSubscribed` | `ComputedRef`\<`boolean`\> | `true` once an active subscription is known. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:356](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L356) |
| <a id="isfree"></a> `isFree` | `ComputedRef`\<`boolean`\> | `true` once it's known the user has no active subscription. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:358](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L358) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until the subscription state has loaded. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:360](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L360) |
| <a id="status-1"></a> `status` | `ComputedRef`\<`string` \| `null` \| `undefined`\> | Provider subscription status (`active`, `trialing`, `past_due`, `paused`, `canceled`, …), `null` on the free plan, `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:365](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L365) |
| <a id="cancelatperiodend"></a> `cancelAtPeriodEnd` | `ComputedRef`\<`boolean`\> | `true` when the subscription is set to end when the paid period does. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:367](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L367) |
| <a id="pausedat"></a> `pausedAt` | `ComputedRef`\<`Date` \| `null`\> | When the subscription was paused, `null` while it is running. Read off the webhook-synced subscription row, whose columns are the provider component's — and that table carries no `paused_at` today, so this reads `null` until it does. Use [UseBillingReturn.isPaused](#ispaused), which also derives from `status`, to drive a paused-state UI. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:376](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L376) |
| <a id="resumesat-1"></a> `resumesAt` | `ComputedRef`\<`Date` \| `null`\> | When a paused subscription resumes by itself, `null` when nothing is scheduled. Same caveat as [UseBillingReturn.pausedAt](#pausedat): the synced subscription row has no `resumes_at` column yet, so this is `null` until the provider component adds one. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:383](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L383) |
| <a id="trialend"></a> `trialEnd` | `ComputedRef`\<`Date` \| `null`\> | End of the trial period, `null` when the plan has no trial. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:385](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L385) |
| <a id="istrialing"></a> `isTrialing` | `ComputedRef`\<`boolean`\> | `true` while the subscription is in its trial period. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:387](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L387) |
| <a id="ispaused"></a> `isPaused` | `ComputedRef`\<`boolean`\> | `true` while the subscription is paused. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:389](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L389) |
| <a id="pendingupdate"></a> `pendingUpdate` | `ComputedRef`\<[`PendingPlanUpdate`](#pendingplanupdate) \| `null`\> | A plan change already scheduled for the next period, `null` when none. Like [UseBillingReturn.pausedAt](#pausedat), this reads off the synced subscription row, which has no `pending_update` column yet — so it is `null` until the provider component syncs one. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:396](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L396) |
| <a id="checkout"></a> `checkout` | (`productIds`, `options?`) => `Promise`\<`string`\> | Generate a checkout for the given product(s) and open it (returns the URL). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:398](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L398) |
| <a id="gift"></a> `gift` | (`productIds`, `options`) => `Promise`\<`string`\> | Buy the given product(s) as a gift for someone else (by email). Opens checkout. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:400](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L400) |
| <a id="portal"></a> `portal` | (`options?`) => `Promise`\<`string`\> | Open the billing customer portal (returns the URL). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:402](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L402) |
| <a id="changeplan"></a> `changePlan` | (`productId`, `options?`) => `Promise`\<`void`\> | Switch the active subscription to another product (upgrade/downgrade). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:404](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L404) |
| <a id="cancel"></a> `cancel` | (`options?`) => `Promise`\<`void`\> | Cancel the active subscription — at period end by default. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:406](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L406) |
| <a id="uncancel"></a> `uncancel` | (`options?`) => `Promise`\<`void`\> | Undo a pending cancellation, putting the subscription back on renewal. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:408](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L408) |
| <a id="pause"></a> `pause` | (`options?`) => `Promise`\<`void`\> | Pause the subscription at the end of the current period. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:410](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L410) |
| <a id="resume"></a> `resume` | (`options?`) => `Promise`\<`void`\> | Resume a paused subscription immediately (starts a new billing period). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:412](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L412) |

***

### ProviderPager

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:511](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L511)

Reactive paging over a provider history endpoint (see [createProviderPager](#createproviderpager)).

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="items-1"></a> `items` | `Ref`\<`Item`[] \| `undefined`\> | The current page's records — `undefined` until the first load resolves. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:513](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L513) |
| <a id="page-2"></a> `page` | `Ref`\<`number`\> | The page being shown; provider page numbers start at 1. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:515](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L515) |
| <a id="total"></a> `total` | `ComputedRef`\<`number` \| `undefined`\> | Total records across all pages, when the provider reported it. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:517](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L517) |
| <a id="pagecount"></a> `pageCount` | `ComputedRef`\<`number` \| `undefined`\> | Number of pages, when the provider reported it. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:519](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L519) |
| <a id="hasmore"></a> `hasMore` | `ComputedRef`\<`boolean`\> | Whether a further page exists. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:521](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L521) |
| <a id="hasprevious"></a> `hasPrevious` | `ComputedRef`\<`boolean`\> | Whether an earlier page exists. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:523](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L523) |
| <a id="isloading-1"></a> `isLoading` | `ComputedRef`\<`boolean`\> | Whether a load is in flight. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:525](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L525) |
| <a id="error"></a> `error` | `Ref`\<`string` \| `null`\> | Message of the last failed load, `null` otherwise. Loads never reject. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:527](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L527) |
| <a id="refresh"></a> `refresh` | () => `Promise`\<`void`\> | Reload the current page. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:529](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L529) |
| <a id="next"></a> `next` | () => `Promise`\<`void`\> | Load the next page (no-op at the end). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:531](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L531) |
| <a id="previous"></a> `previous` | () => `Promise`\<`void`\> | Load the previous page (no-op on page 1). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:533](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L533) |
| <a id="goto"></a> `goTo` | (`page`) => `Promise`\<`void`\> | Jump to a page number. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:535](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L535) |

***

### ProviderPagerOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:539](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L539)

Options for [createProviderPager](#createproviderpager).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="limit-2"></a> `limit?` | `MaybeRefOrGetter`\<`number` \| `undefined`\> | Records per page. Reactive — changing it reloads from page 1. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:541](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L541) |
| <a id="immediate"></a> `immediate?` | `boolean` | Load the first page on mount. Default `true`. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:543](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L543) |
| <a id="enabled"></a> `enabled?` | () => `boolean` | While this is `false` the pager stays empty and never calls out. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:545](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L545) |
| <a id="watchsources"></a> `watchSources?` | () => `unknown` | Extra reactive inputs that should reload from page 1 when they change. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:547](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L547) |

***

### GiftOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:645](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L645)

Per-call options for [UseBillingReturn.gift](#gift).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="message-2"></a> `message?` | `string` | A note shown to the recipient in the gift email. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:647](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L647) |
| <a id="metadata-4"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:648](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L648) |
| <a id="successurl-3"></a> `successUrl?` | `string` | Where the purchaser returns after paying. Defaults to the current URL. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:650](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L650) |
| <a id="redirect-1"></a> `redirect?` | `boolean` | Open in the same tab instead of a new one (redirect checkout). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:652](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L652) |

## Type Aliases

### BillingProduct

```ts
type BillingProduct = {
  id: string;
  name: string;
} & Record<string, unknown>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:7](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L7)

A billing-provider product (loose — the provider owns the full shape; cast as needed).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:7](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L7) |
| `name` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:7](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L7) |

***

### BillingSubscription

```ts
type BillingSubscription = {
  id: string;
  status: string;
  productId: string;
} & Record<string, unknown>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L9)

A billing-provider subscription (loose — the provider owns the full shape; cast as needed).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L9) |
| `status` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L9) |
| `productId` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L9) |

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:16](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L16)

A past charge, as the provider's orders API returns it. Field names mirror
the provider `Order` shape so nothing is lost in translation; the index
signature keeps the rest reachable without a cast.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `id` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L17) |
| `createdAt` | `string` | ISO timestamp of the charge. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L19) |
| `status` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:20](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L20) |
| `totalAmount` | `number` | Amount in the currency's minor unit (cents), after discounts and taxes. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:22](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L22) |
| `currency` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L23) |
| `paid?` | `boolean` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:24](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L24) |
| `invoiceNumber?` | `string` \| `null` | Assigned when the invoice is finalized; `null` on draft orders. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:26](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L26) |
| `isInvoiceGenerated?` | `boolean` | Whether an invoice PDF exists yet — `getInvoiceUrl` needs one. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:28](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L28) |
| `billingReason?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:29](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L29) |
| `productId?` | `string` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L30) |
| `subscriptionId?` | `string` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:31](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L31) |
| `product?` | \| \{ `id`: `string`; `name`: `string`; \} \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L32) |

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:41](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L41)

One ingested usage event, as the provider's events API returns it — the
source of truth for consumption history (this package keeps no local
usage ledger). `units` is resolved server-side from the meter's value
property and is absent when the meter is unknown.

#### Type Declaration

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `id` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L42) |
| `timestamp` | `string` | ISO timestamp of the event. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:44](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L44) |
| `name` | `string` | The ingested event name (the one the meter filters on). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:46](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L46) |
| `units?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L47) |
| `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L48) |

***

### ProrationBehavior

```ts
type ProrationBehavior = "invoice" | "prorate" | "next_period" | "reset";
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:65](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L65)

How the provider settles the money difference when a subscription switches
product mid-period (provider `proration_behavior`). Omit to use the
organization's configured default.

***

### ClientProrationBehavior

```ts
type ClientProrationBehavior = "invoice" | "prorate";
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:74](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L74)

The subset a **client** may choose. `invoice` and `prorate` settle the
difference now; `next_period` and `reset` hand over the new plan immediately
while deferring or waiving the charge, so they stay server-side — pass them
from your own Convex action via `billing.updateSubscription(ctx, …)`, or make
one the organization's default.

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:77](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L77)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:174](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L174)

Args of the generated `generateCheckoutLink` action.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="productids"></a> `productIds` | `string`[] | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:175](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L175) |
| <a id="origin"></a> `origin` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:176](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L176) |
| <a id="successurl"></a> `successUrl` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:177](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L177) |
| <a id="subscriptionid"></a> `subscriptionId?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:178](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L178) |
| <a id="metadata-1"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:179](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L179) |
| <a id="trialinterval"></a> `trialInterval?` | `"day"` \| `"week"` \| `"month"` \| `"year"` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:180](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L180) |
| <a id="trialintervalcount"></a> `trialIntervalCount?` | `number` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:181](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L181) |
| <a id="locale"></a> `locale?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:182](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L182) |
| <a id="prefill"></a> `prefill?` | [`CheckoutPrefill`](#checkoutprefill) | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:183](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L183) |
| <a id="customfields"></a> `customFields?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Values for the organization's custom checkout fields, keyed by field slug. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:185](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L185) |
| <a id="requirebillingaddress"></a> `requireBillingAddress?` | `boolean` | Require the full billing address, not just the country. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:187](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L187) |
| <a id="allowdiscountcodes"></a> `allowDiscountCodes?` | `boolean` | Let the customer type a discount code (default `true`). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:189](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L189) |
| <a id="discountid"></a> `discountId?` | `string` | Pre-apply a discount by id — the only form the provider's checkout takes. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:191](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L191) |

***

### OrdersArgs

```ts
type OrdersArgs = {
  page?: number;
  limit?: number;
};
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:229](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L229)

Args of the `getOrders` action — provider page numbers start at 1.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="page"></a> `page?` | `number` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:229](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L229) |
| <a id="limit"></a> `limit?` | `number` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:229](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L229) |

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:232](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L232)

Args of the `getUsageHistory` action (provider event history for one meter).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="meter"></a> `meter?` | `string` | A configured credit-meter name, or a raw meter id. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:234](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L234) |
| <a id="page-1"></a> `page?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:235](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L235) |
| <a id="limit-1"></a> `limit?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:236](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L236) |
| <a id="starttimestamp"></a> `startTimestamp?` | `number` | Epoch milliseconds — only events at or after this moment. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:238](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L238) |
| <a id="endtimestamp"></a> `endTimestamp?` | `number` | Epoch milliseconds — only events at or before this moment. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:240](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L240) |

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:244](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L244)

Args of the `giftCheckout` action (a checkout whose recipient is someone else).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="productids-1"></a> `productIds` | `string`[] | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:245](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L245) |
| <a id="recipientemail"></a> `recipientEmail` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:246](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L246) |
| <a id="message"></a> `message?` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:247](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L247) |
| <a id="origin-1"></a> `origin` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:248](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L248) |
| <a id="successurl-1"></a> `successUrl` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:249](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L249) |
| <a id="metadata-2"></a> `metadata?` | `Record`\<`string`, `string`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:250](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L250) |

***

### PageFetcher

```ts
type PageFetcher<Item> = (args) => Promise<BillingPage<Item> | Item[] | null>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:508](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L508)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:428](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L428)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:441](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L441)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:470](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L470)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:561](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L561)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:663](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L663)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:709](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-billing.ts#L709)

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
