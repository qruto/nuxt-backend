---
navigation: true
---

# runtime/vue/composables/use-credits

## Interfaces

### UseCreditsOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:5](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L5)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](use-billing.md#billingapi) | Override the injected `api.billing` namespace. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:7](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L7) |

***

### UseCreditsReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:10](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L10)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="balance"></a> `balance` | `ComputedRef`\<`number` \| `undefined`\> | Remaining prepaid credit balance for the meter, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:12](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L12) |
| <a id="credited"></a> `credited` | `ComputedRef`\<`number` \| `undefined`\> | Total credits granted for the meter (top-ups + plan grants), or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:14](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L14) |
| <a id="consumed"></a> `consumed` | `ComputedRef`\<`number` \| `undefined`\> | Credits consumed for the meter, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:16](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L16) |
| <a id="meterid"></a> `meterId` | `ComputedRef`\<`string` \| `undefined`\> | The resolved meter id (the one read above) — pass it to your server-side spend. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:18](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L18) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until credit balances have loaded. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:20](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L20) |
| <a id="topup"></a> `topUp` | (`productIds`, `options?`) => `Promise`\<`string`\> | Buy a credit pack (a one-time product) via checkout — returns the URL. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:22](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L22) |
| <a id="gift"></a> `gift` | (`productIds`, `options`) => `Promise`\<`string`\> | Buy a credit pack as a gift for someone else (by email). Opens checkout. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:24](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L24) |
| <a id="refresh"></a> `refresh` | () => `Promise`\<`void`\> | Refresh the cached balance from the provider (e.g. right after a top-up completes). | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:26](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L26) |

## Functions

### useCredits()

```ts
function useCredits(meterId?, options?): UseCreditsReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:50](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-credits.ts#L50)

Reactive prepaid-credit balance for the current user, plus a `topUp()` checkout
and a `refresh()` re-sync. Credits are Polar's official model: a credit pack is a
one-time product whose Credits benefit tops up a meter balance, drawn down by
server-side consumption (`setupBilling().spendCredits`). Reads the component's
webhook-synced cache via `getCredits`. Zero-arg via the auto-provided
`api.billing` namespace; pass `{ api }` to override.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `meterId?` | `MaybeRefOrGetter`\<`string`\> | Optional meter id to read (reactive); defaults to the user's first meter. |
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
