---
navigation: true
---

# runtime/vue/composables/use-gifts

## Interfaces

### UseGiftsOptions

Defined in: nuxt-backend/src/runtime/vue/composables/use-gifts.ts:5

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](use-billing.md#billingapi) | Override the injected `api.billing` namespace. | nuxt-backend/src/runtime/vue/composables/use-gifts.ts:7 |
| <a id="autoclaim"></a> `autoClaim?` | `boolean` | Claim paid gifts automatically once the user is signed in (default `true`). This is what makes "gift to an email without an account" complete: the recipient signs up, and their waiting gifts attach on first load. | nuxt-backend/src/runtime/vue/composables/use-gifts.ts:13 |

***

### UseGiftsReturn

Defined in: nuxt-backend/src/runtime/vue/composables/use-gifts.ts:16

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="received"></a> `received` | `ComputedRef`\<[`ReceivedGift`](use-billing.md#receivedgift)[] \| `undefined`\> | Every gift addressed to the signed-in user's email, or `undefined` while loading. | nuxt-backend/src/runtime/vue/composables/use-gifts.ts:18 |
| <a id="unclaimed"></a> `unclaimed` | `ComputedRef`\<[`ReceivedGift`](use-billing.md#receivedgift)[]\> | Gifts that are paid but not yet claimed (ready to receive). | nuxt-backend/src/runtime/vue/composables/use-gifts.ts:20 |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until the gift list has loaded (always `false` when signed out). | nuxt-backend/src/runtime/vue/composables/use-gifts.ts:22 |
| <a id="isclaiming"></a> `isClaiming` | `ComputedRef`\<`boolean`\> | `true` while an auto- or manual claim is in flight. | nuxt-backend/src/runtime/vue/composables/use-gifts.ts:24 |
| <a id="claim"></a> `claim` | (`giftId?`) => `Promise`\<`number`\> | Claim a specific gift (by id) or every claimable gift (no argument). Resolves with the number of gifts attached; entitlements/credits refresh reactively right after. | nuxt-backend/src/runtime/vue/composables/use-gifts.ts:30 |

## Functions

### useGifts()

```ts
function useGifts(options?): UseGiftsReturn;
```

Defined in: nuxt-backend/src/runtime/vue/composables/use-gifts.ts:54

Gifts addressed to the signed-in user, with automatic claiming. A gift is a
checkout someone else paid for this user's email; once paid it either
attached automatically (recipient already had an account) or waits here —
and `useGifts` claims it on first authenticated load (disable via
`autoClaim: false` to show an explicit "receive" button instead, e.g. with
the packaged `GiftClaimBanner` component).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`UseGiftsOptions`](#usegiftsoptions) |

#### Returns

[`UseGiftsReturn`](#usegiftsreturn)

#### Example

```vue
<script setup lang="ts">
const gifts = useGifts({ autoClaim: false })
</script>
<template>
  <div v-for="gift in gifts.unclaimed.value" :key="gift.id">
    🎁 from {{ gift.purchaserName ?? 'someone' }}
    <button @click="gifts.claim(gift.id)">Receive</button>
  </div>
</template>
```
