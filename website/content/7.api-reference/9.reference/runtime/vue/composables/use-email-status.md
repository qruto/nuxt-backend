---
navigation: true
---

# runtime/vue/composables/use-email-status

## Interfaces

### EmailStatus

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:7](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L7)

Email delivery status (mirrors the component `status` query).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="status"></a> `status` | `string` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:8](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L8) |
| <a id="errormessage"></a> `errorMessage` | `string` \| `null` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:9](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L9) |
| <a id="bounced"></a> `bounced` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:10](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L10) |
| <a id="complained"></a> `complained` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:11](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L11) |
| <a id="failed"></a> `failed` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:12](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L12) |
| <a id="deliverydelayed"></a> `deliveryDelayed` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:13](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L13) |
| <a id="opened"></a> `opened` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:14](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L14) |
| <a id="clicked"></a> `clicked` | `boolean` | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:15](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L15) |

***

### EmailApi

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L19)

The `email` function group re-exported from your `backend/email.ts`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="getemailstatus"></a> `getEmailStatus?` | `FunctionReference`\<`"query"`, `"public"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\> | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:20](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L20) |

***

### UseEmailStatusOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:23](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L23)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api?` | [`EmailApi`](#emailapi) | Override the injected `api.email` namespace (or the `getEmailStatus` ref). | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L25) |

***

### UseEmailStatusReturn

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:28](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L28)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="data"></a> `data` | `ComputedRef`\<[`EmailStatus`](#emailstatus) \| `null` \| `undefined`\> | The full status record, `null` if unknown, `undefined` while loading. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L30) |
| <a id="status-1"></a> `status` | `ComputedRef`\<`string` \| `undefined`\> | The status string (`queued` | `sent` | `delivered` | `bounced` | …), or `undefined`. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:32](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L32) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | `true` until the first status loads. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:34](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L34) |
| <a id="isdelivered"></a> `isDelivered` | `ComputedRef`\<`boolean`\> | `true` once the email is delivered. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L36) |
| <a id="iserror"></a> `isError` | `ComputedRef`\<`boolean`\> | `true` if the email bounced, was complained about, or failed. | [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:38](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L38) |

## Functions

### useEmailStatus()

```ts
function useEmailStatus(emailId, options?): UseEmailStatusReturn;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-email-status.ts:60](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-email-status.ts#L60)

Reactive delivery status for a sent email. Updates live as delivery webhooks
advance the status (queued → sent → delivered/bounced). Zero-arg via the
auto-provided `api.email` namespace; pass `{ api }` to override.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `emailId` | `MaybeRefOrGetter`\<`string` \| `undefined`\> | The email id to track (reactive, from `send`). Tracking pauses while it is `undefined`/empty. |
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
