---
navigation: true
---

# runtime/vue/composables/use-credits

## Interfaces

### CreditCycle

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:7](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L7)

The billing period a meter's credited units belong to.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="start"></a> `start?` | `Date` | Start of the current cycle, when the provider reports one. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L9) |
| <a id="end"></a> `end?` | `Date` | End of the current cycle — when unspent credits expire, if they do. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L11) |

***

### UseCreditsOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:14](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L14)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](/api-reference/reference/runtime/vue/composables/use-billing#billingapi) | Override the injected `api.billing` namespace. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:16](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L16) |

***

### UseCreditsReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L19)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="balance"></a> `balance` | `ComputedRef`\<`number` \| `undefined`\> | Remaining prepaid credit balance for the meter, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L21) |
| <a id="credited"></a> `credited` | `ComputedRef`\<`number` \| `undefined`\> | Total credits granted for the meter (top-ups + plan grants), or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L23) |
| <a id="consumed"></a> `consumed` | `ComputedRef`\<`number` \| `undefined`\> | Credits consumed for the meter, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L25) |
| <a id="overage"></a> `overage` | `ComputedRef`\<`number` \| `undefined`\> | Units consumed beyond what was credited — what a pay-as-you-go meter has run up this cycle and the provider will invoice. `0` for a meter that is still in prepaid credit; `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:31](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L31) |
| <a id="cycle"></a> `cycle` | `ComputedRef`\<[`CreditCycle`](#creditcycle) \| `null` \| `undefined`\> | The billing cycle these credits belong to: `undefined` while loading, `null` for a meter with no cycle at all (credits bought as a one-time pack), otherwise the current period. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:37](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L37) |
| <a id="expiresatcycleend"></a> `expiresAtCycleEnd` | `ComputedRef`\<`boolean` \| `undefined`\> | Whether the remaining balance expires at [CreditCycle.end](#end) — `true` only when the plan's credits are known not to roll over and a cycle end is known. `undefined` while loading; `false` when credits carry over (or the provider has not said). | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:44](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L44) |
| <a id="meterid"></a> `meterId` | `ComputedRef`\<`string` \| `undefined`\> | The resolved meter id (the one read above) — pass it to your server-side spend. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:46](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L46) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until credit balances have loaded. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L48) |
| <a id="topup"></a> `topUp` | (`productIds`, `options?`) => `Promise`\<`string`\> | Buy a credit pack (a one-time product) via checkout — returns the URL. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:50](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L50) |
| <a id="gift"></a> `gift` | (`productIds`, `options`) => `Promise`\<`string`\> | Buy a credit pack as a gift for someone else (by email). Opens checkout. | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:52](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L52) |
| <a id="refresh"></a> `refresh` | () => `Promise`\<`void`\> | Refresh the cached balance from the provider (e.g. right after a top-up completes). | [nuxt-backend/src/runtime/vue/composables/use-credits.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L54) |

## Functions

### useCredits()

```ts
function useCredits(meterId?, options?): UseCreditsReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-credits.ts:83](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-credits.ts#L83)

Reactive prepaid-credit balance for the current user, plus a `topUp()` checkout
and a `refresh()` re-sync. Credits are the provider's native model: a credit pack is a
one-time product whose Credits benefit tops up a meter balance, drawn down by
server-side consumption (`setupBilling().spendCredits`). Reads the component's
webhook-synced cache via `getCredits`. Zero-arg via the auto-provided
`api.billing` namespace; pass `{ api }` to override.

Alongside the balance it exposes what a credits UI actually needs to say:
the current `cycle`, whether the remainder `expiresAtCycleEnd`, and the
`overage` a pay-as-you-go meter has run up.

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
