---
navigation: true
---

# runtime/vue/composables/use-email-status

## Interfaces

### EmailStatus

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:6](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L6)

Resend delivery status (mirrors the component `status` query).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="status"></a> `status` | `string` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:7](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L7) |
| <a id="errormessage"></a> `errorMessage` | `string` \| `null` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:8](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L8) |
| <a id="bounced"></a> `bounced` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:9](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L9) |
| <a id="complained"></a> `complained` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:10](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L10) |
| <a id="failed"></a> `failed` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:11](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L11) |
| <a id="deliverydelayed"></a> `deliveryDelayed` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:12](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L12) |
| <a id="opened"></a> `opened` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:13](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L13) |
| <a id="clicked"></a> `clicked` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:14](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L14) |

***

### EmailApi

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:18](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L18)

The `email` function group re-exported from your `backend/email.ts`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="getemailstatus"></a> `getEmailStatus?` | `FunctionReference`\<`"query"`, `"public"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:19](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L19) |

***

### UseEmailStatusOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:22](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L22)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`EmailApi`](#emailapi) | Override the injected `api.email` namespace (or the `getEmailStatus` ref). | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:24](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L24) |

***

### UseEmailStatusReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:27](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L27)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="data"></a> `data` | `ComputedRef`\<[`EmailStatus`](#emailstatus) \| `null` \| `undefined`\> | The full status record, `null` if unknown, `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:29](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L29) |
| <a id="status-1"></a> `status` | `ComputedRef`\<`string` \| `undefined`\> | The status string (`queued` | `sent` | `delivered` | `bounced` | …), or `undefined`. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:31](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L31) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until the first status loads. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:33](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L33) |
| <a id="isdelivered"></a> `isDelivered` | `ComputedRef`\<`boolean`\> | `true` once the email is delivered. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:35](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L35) |
| <a id="iserror"></a> `isError` | `ComputedRef`\<`boolean`\> | `true` if the email bounced, was complained about, or failed. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:37](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L37) |

## Functions

### useEmailStatus()

```ts
function useEmailStatus(emailId, options?): UseEmailStatusReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:59](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-email-status.ts#L59)

Reactive delivery status for a sent email. Updates live as Resend webhooks
advance the status (queued → sent → delivered/bounced). Zero-arg via the
auto-provided `api.email` namespace; pass `{ api }` to override.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `emailId` | `MaybeRefOrGetter`\<`string` \| `undefined`\> | The Resend email id to track (reactive). Tracking pauses while it is `undefined`/empty. |
| `options` | [`UseEmailStatusOptions`](#useemailstatusoptions) | - |

#### Returns

[`UseEmailStatusReturn`](#useemailstatusreturn)

#### Example

```vue
<script setup lang="ts">
const emailId = ref<string>()
const delivery = useEmailStatus(emailId)
</script>
<template>
  <p v-if="delivery.status.value">Status: {{ delivery.status.value }}</p>
</template>
```
