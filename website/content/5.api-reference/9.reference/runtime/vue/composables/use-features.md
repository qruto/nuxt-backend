---
navigation: true
---

# runtime/vue/composables/use-features

## Interfaces

### UseFeaturesOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-features.ts:5](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L5)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](use-billing.md#billingapi) | Override the injected `api.billing` namespace (or the `getFeatures` ref). | [nuxt-backend/src/runtime/vue/composables/use-features.ts:7](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L7) |

***

### UseFeaturesReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-features.ts:10](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L10)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="plans"></a> `plans` | `ComputedRef`\<`string`[] \| `undefined`\> | Active product ids the user is subscribed to, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:12](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L12) |
| <a id="benefits"></a> `benefits` | `ComputedRef`\<[`EntitlementBenefit`](use-billing.md#entitlementbenefit)[] \| `undefined`\> | Granted benefits (entitlements), or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:14](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L14) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until features have loaded. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:16](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L16) |
| <a id="has"></a> `has` | (`feature`) => `boolean` | Whether the user has the given benefit (matched by `benefitId`, grant `id`, `type`, or any metadata value). | [nuxt-backend/src/runtime/vue/composables/use-features.ts:18](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L18) |
| <a id="hasplan"></a> `hasPlan` | (`productId`) => `boolean` | Whether the user has an active subscription to the given product id. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:20](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L20) |

## Functions

### useFeatures()

```ts
function useFeatures(options?): UseFeaturesReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-features.ts:39](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-features.ts#L39)

Reactive feature-gating for the current user — the SaaS access primitive.
Backed by the `getFeatures` query (the component's webhook-synced cache), so it
updates live as subscriptions/benefits change. Zero-arg via the auto-provided
`api.billing` namespace; pass `{ api }` to override.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`UseFeaturesOptions`](#usefeaturesoptions) |

#### Returns

[`UseFeaturesReturn`](#usefeaturesreturn)

#### Example

```vue
<script setup lang="ts">
const { has, hasPlan } = useFeatures()
</script>
<template>
  <PremiumPanel v-if="has('priority_support')" />
</template>
```
