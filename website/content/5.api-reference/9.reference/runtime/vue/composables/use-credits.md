---
navigation: true
---

# runtime/vue/composables/use-credits

## Interfaces

### UseCreditsOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:6](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L6)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](/api-reference/reference/runtime/vue/composables/use-billing#billingapi) | Override the injected `api.billing` namespace. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L8) |

***

### UseCreditsReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L11)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="balance"></a> `balance` | `ComputedRef`\<`number` \| `undefined`\> | Remaining prepaid credit balance for the meter, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:13](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L13) |
| <a id="credited"></a> `credited` | `ComputedRef`\<`number` \| `undefined`\> | Total credits granted for the meter (top-ups + plan grants), or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:15](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L15) |
| <a id="consumed"></a> `consumed` | `ComputedRef`\<`number` \| `undefined`\> | Credits consumed for the meter, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L17) |
| <a id="meterid"></a> `meterId` | `ComputedRef`\<`string` \| `undefined`\> | The resolved meter id (the one read above) — pass it to your server-side spend. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L19) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until credit balances have loaded. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L21) |
| <a id="topup"></a> `topUp` | (`productIds`, `options?`) => `Promise`\<`string`\> | Buy a credit pack (a one-time product) via checkout — returns the URL. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L23) |
| <a id="gift"></a> `gift` | (`productIds`, `options`) => `Promise`\<`string`\> | Buy a credit pack as a gift for someone else (by email). Opens checkout. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L25) |
| <a id="refresh"></a> `refresh` | () => `Promise`\<`void`\> | Refresh the cached balance from the provider (e.g. right after a top-up completes). | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:27](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L27) |

## Functions

### useCredits()

```ts
function useCredits(meterId?, options?): UseCreditsReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:52](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L52)

Reactive prepaid-credit balance for the current user, plus a `topUp()` checkout
and a `refresh()` re-sync. Credits are the provider's native model: a credit pack is a
one-time product whose Credits benefit tops up a meter balance, drawn down by
server-side consumption (`setupBilling().spendCredits`). Reads the component's
webhook-synced cache via `getCredits`. Zero-arg via the auto-provided
`api.billing` namespace; pass `{ api }` to override.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `meterId?` | `MaybeRefOrGetter`\<`string`\> | Optional meter to read (reactive): a configured meter name (`'credits'`) or a raw meter id; defaults to the user's first meter. |
| `options?` | [`UseCreditsOptions`](#usecreditsoptions) | - |

#### Returns

[`UseCreditsReturn`](#usecreditsreturn)

#### Example

```vue
<script setup lang="ts">
const credits = useCredits()
</script>
<template>
  <p>{{ credits.balance.value ?? '—' }} credits</p>
  <button @click="credits.topUp(creditPackId)">Buy 100 credits</button>
</template>
```
