---
navigation: true
---

# runtime/vue/composables/use-features

## Interfaces

### UseFeaturesOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-features.ts:6](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L6)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`BillingApi`](/api-reference/reference/runtime/vue/composables/use-billing#billingapi) | Override the injected `api.billing` namespace (or the `getFeatures` ref). | [nuxt-backend/src/runtime/vue/composables/use-features.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L8) |

***

### UseFeaturesReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-features.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L11)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="plans"></a> `plans` | `ComputedRef`\<`string`[] \| `undefined`\> | Active product ids the user is subscribed to, or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:13](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L13) |
| <a id="benefits"></a> `benefits` | `ComputedRef`\<[`EntitlementBenefit`](/api-reference/reference/runtime/vue/composables/use-billing#entitlementbenefit)[] \| `undefined`\> | Granted benefits (entitlements), or `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:15](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L15) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until features have loaded. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L17) |
| <a id="has"></a> `has` | (`feature`) => `boolean` | Whether the user has the given benefit (matched by `benefitId`, grant `id`, `type`, or any metadata value). | [nuxt-backend/src/runtime/vue/composables/use-features.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L19) |
| <a id="hasplan"></a> `hasPlan` | (`productId`) => `boolean` | Whether the user has an active subscription to the given product id. | [nuxt-backend/src/runtime/vue/composables/use-features.ts:21](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L21) |

## Functions

### useFeatures()

```ts
function useFeatures(options?): UseFeaturesReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-features.ts:40](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-features.ts#L40)

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
