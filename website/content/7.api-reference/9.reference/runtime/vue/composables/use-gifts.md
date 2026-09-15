---
navigation: true
---

# runtime/vue/composables/use-gifts

## Interfaces

### UseGiftsOptions

Defined in: [src/runtime/vue/composables/use-gifts.ts:6](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L6)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](/api-reference/reference/runtime/vue/composables/use-billing#billingapi) | Override the injected `api.billing` namespace. | [src/runtime/vue/composables/use-gifts.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L8) |
| <a id="autoclaim"></a> `autoClaim?` | `boolean` | Claim paid gifts automatically once the user is signed in (default `true`). This is what makes "gift to an email without an account" complete: the recipient signs up, and their waiting gifts attach on first load. | [src/runtime/vue/composables/use-gifts.ts:14](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L14) |

***

### UseGiftsReturn

Defined in: [src/runtime/vue/composables/use-gifts.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L17)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="received"></a> `received` | `ComputedRef`\<[`ReceivedGift`](/api-reference/reference/runtime/vue/composables/use-billing#receivedgift)[] \| `undefined`\> | Every gift addressed to the signed-in user's email, or `undefined` while loading. | [src/runtime/vue/composables/use-gifts.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L19) |
| <a id="unclaimed"></a> `unclaimed` | `ComputedRef`\<[`ReceivedGift`](/api-reference/reference/runtime/vue/composables/use-billing#receivedgift)[]\> | Gifts that are paid but not yet claimed (ready to receive). | [src/runtime/vue/composables/use-gifts.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L21) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until the gift list has loaded (always `false` when signed out). | [src/runtime/vue/composables/use-gifts.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L23) |
| <a id="isclaiming"></a> `isClaiming` | `ComputedRef`\<`boolean`\> | `true` while an auto- or manual claim is in flight. | [src/runtime/vue/composables/use-gifts.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L25) |
| <a id="claim"></a> `claim` | (`giftId?`) => `Promise`\<`number`\> | Claim a specific gift (by id) or every claimable gift (no argument). Resolves with the number of gifts attached; entitlements/credits refresh reactively right after. | [src/runtime/vue/composables/use-gifts.ts:31](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L31) |

## Functions

### useGifts()

```ts
function useGifts(options?): UseGiftsReturn;
```

Defined in: [src/runtime/vue/composables/use-gifts.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-gifts.ts#L55)

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
