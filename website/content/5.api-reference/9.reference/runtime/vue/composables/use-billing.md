---
navigation: true
---

# runtime/vue/composables/use-billing

## Interfaces

### EntitlementBenefit

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:14](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L14)

A granted benefit — the unit of feature-gating (`useFeatures().has()`).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:15](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L15) |
| <a id="benefitid"></a> `benefitId` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:16](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L16) |
| <a id="type"></a> `type` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:17](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L17) |
| <a id="metadata"></a> `metadata?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | The benefit's Polar metadata (live, not the grant-time snapshot). Set a stable key here (e.g. `{ key: 'premium' }`) to feature-gate by a friendly name — `useFeatures().has('premium')` matches any metadata value. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:23](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L23) |

***

### EntitlementMeter

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:27](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L27)

A prepaid credit-meter balance (`useCredits()`).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meterid"></a> `meterId` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:28](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L28) |
| <a id="consumedunits"></a> `consumedUnits` | `number` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:29](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L29) |
| <a id="creditedunits"></a> `creditedUnits` | `number` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:30](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L30) |
| <a id="balance"></a> `balance` | `number` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:31](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L31) |

***

### Features

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:35](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L35)

Feature-gating state for the current user, as returned by `getFeatures`.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="plans"></a> `plans` | `string`[] | Active product ids the user is subscribed to. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:37](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L37) |
| <a id="benefits"></a> `benefits` | [`EntitlementBenefit`](#entitlementbenefit)[] | Granted benefits. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:39](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L39) |

***

### Credits

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:43](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L43)

Prepaid credit balances for the current user, as returned by `getCredits`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="meters"></a> `meters` | [`EntitlementMeter`](#entitlementmeter)[] | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:44](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L44) |

***

### BillingApi

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:65](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L65)

The billing function references — the result of `setupBilling().api` re-exported
from your `backend/billing.ts` (plus the optional `getCurrentSubscription`
query). Supplied automatically from the injected `api.billing` namespace;
pass `options.api` to override.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="getconfiguredproducts"></a> `getConfiguredProducts?` | `Query`\<`Record`\<`string`, [`BillingProduct`](#billingproduct) \| `undefined`\>\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:66](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L66) |
| <a id="listallproducts"></a> `listAllProducts?` | `Query`\<[`BillingProduct`](#billingproduct)[]\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:67](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L67) |
| <a id="listallsubscriptions"></a> `listAllSubscriptions?` | `Query`\<[`BillingSubscription`](#billingsubscription)[] \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:68](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L68) |
| <a id="getcurrentsubscription"></a> `getCurrentSubscription?` | `Query`\<[`BillingSubscription`](#billingsubscription) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:69](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L69) |
| <a id="generatecheckoutlink"></a> `generateCheckoutLink?` | `FunctionReference`\<`"action"`, `"public"`, [`CheckoutArgs`](#checkoutargs), \{ `url`: `string`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:70](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L70) |
| <a id="generatecustomerportalurl"></a> `generateCustomerPortalUrl?` | `FunctionReference`\<`"action"`, `"public"`, \{ `returnUrl?`: `string`; \}, \{ `url`: `string`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:71](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L71) |
| <a id="changecurrentsubscription"></a> `changeCurrentSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `productId`: `string`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:72](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L72) |
| <a id="cancelcurrentsubscription"></a> `cancelCurrentSubscription?` | `FunctionReference`\<`"action"`, `"public"`, \{ `revokeImmediately?`: `boolean`; \}, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:73](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L73) |
| <a id="getfeatures"></a> `getFeatures?` | `Query`\<[`Features`](#features) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:74](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L74) |
| <a id="getcredits"></a> `getCredits?` | `Query`\<[`Credits`](#credits) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:75](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L75) |
| <a id="syncentitlements"></a> `syncEntitlements?` | `FunctionReference`\<`"action"`, `"public"`, `EmptyArgs`, `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:76](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L76) |
| <a id="giftcheckout"></a> `giftCheckout?` | `FunctionReference`\<`"action"`, `"public"`, [`GiftCheckoutArgs`](#giftcheckoutargs), \{ `url`: `string`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:77](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L77) |
| <a id="getreceivedgifts"></a> `getReceivedGifts?` | `Query`\<[`ReceivedGift`](#receivedgift)[] \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:78](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L78) |
| <a id="claimgift"></a> `claimGift?` | `FunctionReference`\<`"action"`, `"public"`, \{ `giftId?`: `string`; \}, \{ `claimed`: `number`; \}\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:79](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L79) |

***

### ReceivedGift

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:93](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L93)

A gift addressed to the current user (`getReceivedGifts` shape).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id-1"></a> `id` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:94](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L94) |
| <a id="recipientemail-1"></a> `recipientEmail` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:95](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L95) |
| <a id="purchaseruserid"></a> `purchaserUserId` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:96](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L96) |
| <a id="purchaseremail"></a> `purchaserEmail?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:97](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L97) |
| <a id="purchasername"></a> `purchaserName?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:98](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L98) |
| <a id="productids-2"></a> `productIds` | `string`[] | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:99](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L99) |
| <a id="message-1"></a> `message?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:100](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L100) |
| <a id="status"></a> `status` | `string` | `'pending'` (awaiting payment) → `'paid'` (claimable) → `'claimed'`. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:102](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L102) |
| <a id="createdat"></a> `createdAt` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:103](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L103) |
| <a id="paidat"></a> `paidAt?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:104](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L104) |
| <a id="claimedat"></a> `claimedAt?` | `number` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:105](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L105) |

***

### CheckoutOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:109](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L109)

Per-call checkout overrides for [UseBillingReturn.checkout](#checkout).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="subscriptionid-1"></a> `subscriptionId?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:110](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L110) |
| <a id="metadata-3"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:111](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L111) |
| <a id="trialinterval-1"></a> `trialInterval?` | `"day"` \| `"week"` \| `"month"` \| `"year"` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:112](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L112) |
| <a id="trialintervalcount-1"></a> `trialIntervalCount?` | `number` \| `null` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:113](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L113) |
| <a id="locale-1"></a> `locale?` | `string` | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:114](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L114) |
| <a id="successurl-2"></a> `successUrl?` | `string` | Where Polar returns the customer after checkout. Defaults to the current URL. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:116](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L116) |
| <a id="redirect"></a> `redirect?` | `boolean` | Open in the same tab instead of a new one (redirect checkout). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:118](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L118) |

***

### UseBillingOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:121](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L121)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](#billingapi) | Override the injected `api.billing` namespace (or individual references). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:123](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L123) |

***

### UseBillingReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:126](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L126)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="products"></a> `products` | `ComputedRef`\< \| `Record`\<`string`, [`BillingProduct`](#billingproduct) \| `undefined`\> \| `undefined`\> | Configured products keyed by your product map, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:128](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L128) |
| <a id="subscription"></a> `subscription` | `ComputedRef`\<[`BillingSubscription`](#billingsubscription) \| `null` \| `undefined`\> | The current active subscription, `null` when on the free plan, `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:130](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L130) |
| <a id="subscriptions"></a> `subscriptions` | `ComputedRef`\<[`BillingSubscription`](#billingsubscription)[] \| `undefined`\> | Every subscription for the user (incl. ended/expired trials), or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:132](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L132) |
| <a id="issubscribed"></a> `isSubscribed` | `ComputedRef`\<`boolean`\> | `true` once an active subscription is known. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:134](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L134) |
| <a id="isfree"></a> `isFree` | `ComputedRef`\<`boolean`\> | `true` once it's known the user has no active subscription. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:136](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L136) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until the subscription state has loaded. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:138](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L138) |
| <a id="checkout"></a> `checkout` | (`productIds`, `options?`) => `Promise`\<`string`\> | Generate a checkout for the given product(s) and open it (returns the URL). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:140](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L140) |
| <a id="gift"></a> `gift` | (`productIds`, `options`) => `Promise`\<`string`\> | Buy the given product(s) as a gift for someone else (by email). Opens checkout. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:142](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L142) |
| <a id="portal"></a> `portal` | (`options?`) => `Promise`\<`string`\> | Open the billing customer portal (returns the URL). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:144](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L144) |
| <a id="changeplan"></a> `changePlan` | (`productId`) => `Promise`\<`void`\> | Switch the active subscription to another product (upgrade/downgrade). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:146](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L146) |
| <a id="cancel"></a> `cancel` | (`options?`) => `Promise`\<`void`\> | Cancel the active subscription (at period end, or immediately with `revokeImmediately`). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:148](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L148) |

***

### GiftOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:192](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L192)

Per-call options for [UseBillingReturn.gift](#gift).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="message-2"></a> `message?` | `string` | A note shown to the recipient in the gift email. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:194](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L194) |
| <a id="metadata-4"></a> `metadata?` | `Record`\<`string`, `string`\> | - | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:195](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L195) |
| <a id="successurl-3"></a> `successUrl?` | `string` | Where the purchaser returns after paying. Defaults to the current URL. | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:197](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L197) |
| <a id="redirect-1"></a> `redirect?` | `boolean` | Open in the same tab instead of a new one (redirect checkout). | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:199](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L199) |

## Type Aliases

### BillingProduct

```ts
type BillingProduct = {
  id: string;
  name: string;
} & Record<string, unknown>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:6](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L6)

A Polar product (loose — the full shape is Polar's; cast as needed).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:6](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L6) |
| `name` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:6](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L6) |

***

### BillingSubscription

```ts
type BillingSubscription = {
  id: string;
  status: string;
  productId: string;
} & Record<string, unknown>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:8](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L8)

A Polar subscription (loose — the full shape is Polar's; cast as needed).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:8](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L8) |
| `status` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:8](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L8) |
| `productId` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:8](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L8) |

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
};
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:48](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L48)

Args of the Polar-generated `generateCheckoutLink` action.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="productids"></a> `productIds` | `string`[] | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:49](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L49) |
| <a id="origin"></a> `origin` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:50](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L50) |
| <a id="successurl"></a> `successUrl` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:51](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L51) |
| <a id="subscriptionid"></a> `subscriptionId?` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:52](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L52) |
| <a id="metadata-1"></a> `metadata?` | `Record`\<`string`, `string`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:53](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L53) |
| <a id="trialinterval"></a> `trialInterval?` | `"day"` \| `"week"` \| `"month"` \| `"year"` \| `null` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:54](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L54) |
| <a id="trialintervalcount"></a> `trialIntervalCount?` | `number` \| `null` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:55](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L55) |
| <a id="locale"></a> `locale?` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:56](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L56) |

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:83](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L83)

Args of the `giftCheckout` action (a checkout whose recipient is someone else).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="productids-1"></a> `productIds` | `string`[] | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:84](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L84) |
| <a id="recipientemail"></a> `recipientEmail` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:85](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L85) |
| <a id="message"></a> `message?` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:86](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L86) |
| <a id="origin-1"></a> `origin` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:87](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L87) |
| <a id="successurl-1"></a> `successUrl` | `string` | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:88](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L88) |
| <a id="metadata-2"></a> `metadata?` | `Record`\<`string`, `string`\> | [nuxt-backend/src/runtime/vue/composables/use-billing.ts:89](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L89) |

## Functions

### createCheckout()

```ts
function createCheckout(billing): (productIds, opts) => Promise<string>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:170](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L170)

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

### createGiftCheckout()

```ts
function createGiftCheckout(billing): (productIds, opts) => Promise<string>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:210](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L210)

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

Defined in: [nuxt-backend/src/runtime/vue/composables/use-billing.ts:250](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-billing.ts#L250)

Reactive billing state plus checkout/gift/portal/plan actions, linked to
your auth user. Works with no arguments via the auto-provided `api.billing`
namespace; pass `{ api }` to override.

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
