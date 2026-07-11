---
navigation: true
---

# convex/integrations/email

## Interfaces

### EmailComponentApi

Defined in: [src/convex/integrations/email.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L15)

The `email` function group exposed by the `backend` component (see
`src/convex/component/email.ts`), reachable from the app as
`components.backend.email`.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="email"></a> `email` | \{ `send`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"mutation"`, `"public"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\>; `status`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\>; `get`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `emailId`: `string`; \}, `unknown`\>; `cancel`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"mutation"`, `"public"`, \{ `emailId`: `string`; \}, `null`\>; `handleWebhook`: [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"action"`, `"public"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; \}\>; \} | [src/convex/integrations/email.ts:16](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L16) |
| `email.send` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"mutation"`, `"public"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\> | [src/convex/integrations/email.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L17) |
| `email.status` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\> | [src/convex/integrations/email.ts:18](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L18) |
| `email.get` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`, `"public"`, \{ `emailId`: `string`; \}, `unknown`\> | [src/convex/integrations/email.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L19) |
| `email.cancel` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"mutation"`, `"public"`, \{ `emailId`: `string`; \}, `null`\> | [src/convex/integrations/email.ts:20](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L20) |
| `email.handleWebhook` | [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"action"`, `"public"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; \}\> | [src/convex/integrations/email.ts:21](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L21) |

***

### EmailStatus

Defined in: [src/convex/integrations/email.ts:26](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L26)

Resend delivery status, as returned by the component `status` query.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="status"></a> `status` | `string` | [src/convex/integrations/email.ts:27](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L27) |
| <a id="errormessage"></a> `errorMessage` | `string` \| `null` | [src/convex/integrations/email.ts:28](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L28) |
| <a id="bounced"></a> `bounced` | `boolean` | [src/convex/integrations/email.ts:29](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L29) |
| <a id="complained"></a> `complained` | `boolean` | [src/convex/integrations/email.ts:30](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L30) |
| <a id="failed"></a> `failed` | `boolean` | [src/convex/integrations/email.ts:31](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L31) |
| <a id="deliverydelayed"></a> `deliveryDelayed` | `boolean` | [src/convex/integrations/email.ts:32](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L32) |
| <a id="opened"></a> `opened` | `boolean` | [src/convex/integrations/email.ts:33](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L33) |
| <a id="clicked"></a> `clicked` | `boolean` | [src/convex/integrations/email.ts:34](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L34) |

***

### Email

Defined in: [src/convex/integrations/email.ts:84](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L84)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api` | \{ `getEmailStatus`: `RegisteredQuery`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `backend/email.ts`. Currently `getEmailStatus` (the reactive query behind `useEmailStatus`). | [src/convex/integrations/email.ts:89](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L89) |
| `api.getEmailStatus` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/email.ts:90](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L90) |
| <a id="send"></a> `send` | (`ctx`, `options`) => `Promise`\<`string` \| `null`\> | Send a transactional email (call from your own gated action/mutation). | [src/convex/integrations/email.ts:93](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L93) |
| <a id="status-1"></a> `status` | (`ctx`, `emailId`) => `Promise`\<[`EmailStatus`](#emailstatus) \| `null`\> | Read an email's delivery status. | [src/convex/integrations/email.ts:95](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L95) |
| <a id="cancel"></a> `cancel` | (`ctx`, `emailId`) => `Promise`\<`void`\> | Cancel a not-yet-sent email. | [src/convex/integrations/email.ts:97](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L97) |
| <a id="webhookhandler"></a> `webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | Handle a Resend event webhook from your app's `/resend-webhook` HTTP route (inside an `httpAction`); returns the Response to send back. | [src/convex/integrations/email.ts:102](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L102) |
| <a id="audiences"></a> `audiences` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `list`: () => `Promise`\<`unknown`\>; `remove`: (`id`) => `Promise`\<`unknown`\>; \} | Marketing audiences (Resend segments): create / list / remove. | [src/convex/integrations/email.ts:104](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L104) |
| `audiences.create` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:105](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L105) |
| `audiences.list` | () => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:106](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L106) |
| `audiences.remove` | (`id`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:107](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L107) |
| <a id="contacts"></a> `contacts` | \{ `add`: (`payload`) => `Promise`\<`unknown`\>; `list`: (`payload`) => `Promise`\<`unknown`\>; `update`: (`payload`) => `Promise`\<`unknown`\>; `remove`: (`payload`) => `Promise`\<`unknown`\>; \} | Marketing contacts: add (subscribe) / list / update / remove (unsubscribe). | [src/convex/integrations/email.ts:110](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L110) |
| `contacts.add` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:111](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L111) |
| `contacts.list` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:112](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L112) |
| `contacts.update` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:113](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L113) |
| `contacts.remove` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:114](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L114) |
| <a id="broadcasts"></a> `broadcasts` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `send`: (`id`, `payload?`) => `Promise`\<`unknown`\>; \} | Marketing broadcasts: create / send (optionally scheduled). | [src/convex/integrations/email.ts:117](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L117) |
| `broadcasts.create` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:118](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L118) |
| `broadcasts.send` | (`id`, `payload?`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:119](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L119) |

## Type Aliases

### SendEmailOptions

```ts
type SendEmailOptions = {
  to: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string[];
  headers?: {
     name: string;
     value: string;
  }[];
  template?: {
     id: string;
     variables?: Record<string, string | number>;
  };
};
```

Defined in: [src/convex/integrations/email.ts:38](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L38)

Options for a transactional send (mirrors the component `send` mutation).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` \| `string`[] | [src/convex/integrations/email.ts:39](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L39) |
| <a id="subject"></a> `subject?` | `string` | [src/convex/integrations/email.ts:40](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L40) |
| <a id="html"></a> `html?` | `string` | [src/convex/integrations/email.ts:41](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L41) |
| <a id="text"></a> `text?` | `string` | [src/convex/integrations/email.ts:42](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L42) |
| <a id="from"></a> `from?` | `string` | [src/convex/integrations/email.ts:43](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L43) |
| <a id="cc"></a> `cc?` | `string` \| `string`[] | [src/convex/integrations/email.ts:44](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L44) |
| <a id="bcc"></a> `bcc?` | `string` \| `string`[] | [src/convex/integrations/email.ts:45](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L45) |
| <a id="replyto"></a> `replyTo?` | `string`[] | [src/convex/integrations/email.ts:46](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L46) |
| <a id="headers"></a> `headers?` | \{ `name`: `string`; `value`: `string`; \}[] | [src/convex/integrations/email.ts:47](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L47) |
| <a id="template"></a> `template?` | \{ `id`: `string`; `variables?`: `Record`\<`string`, `string` \| `number`\>; \} | [src/convex/integrations/email.ts:48](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L48) |
| `template.id` | `string` | [src/convex/integrations/email.ts:48](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L48) |
| `template.variables?` | `Record`\<`string`, `string` \| `number`\> | [src/convex/integrations/email.ts:48](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L48) |

## Variables

### sendArgs

```ts
const sendArgs: {
  to: VUnion<string | string[], [VString<string, "required">, VArray<string[], VString<string, "required">, "required">], "required", never>;
  subject: VString<string | undefined, "optional">;
  html: VString<string | undefined, "optional">;
  text: VString<string | undefined, "optional">;
  from: VString<string | undefined, "optional">;
  cc: VUnion<string | string[] | undefined, [VString<string, "required">, VArray<string[], VString<string, "required">, "required">], "optional", never>;
  bcc: VUnion<string | string[] | undefined, [VString<string, "required">, VArray<string[], VString<string, "required">, "required">], "optional", never>;
  replyTo: VArray<string[] | undefined, VString<string, "required">, "optional">;
  headers: VArray<
     | {
     name: string;
     value: string;
   }[]
     | undefined, VObject<{
     name: string;
     value: string;
   }, {
     name: VString<string, "required">;
     value: VString<string, "required">;
  }, "required", "name" | "value">, "optional">;
  template: VObject<
     | {
     variables?: Record<string, string | number>;
     id: string;
   }
     | undefined, {
     id: VString<string, "required">;
     variables: VRecord<Record<string, string | number> | undefined, VString<string, "required">, VUnion<string | number, [VString<string, "required">, VFloat64<number, "required">], "required", never>, "optional", string>;
  }, "optional", "id" | "variables" | `variables.${string}`>;
};
```

Defined in: [src/convex/integrations/email.ts:57](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L57)

Re-export so consumers can keep the `send` argument validator aligned.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-to"></a> `to` | `VUnion`\<`string` \| `string`[], \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"required"`, `never`\> | [src/convex/integrations/email.ts:58](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L58) |
| <a id="property-subject"></a> `subject` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:59](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L59) |
| <a id="property-html"></a> `html` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:60](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L60) |
| <a id="property-text"></a> `text` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:61](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L61) |
| <a id="property-from"></a> `from` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:62](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L62) |
| <a id="property-cc"></a> `cc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [src/convex/integrations/email.ts:63](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L63) |
| <a id="property-bcc"></a> `bcc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [src/convex/integrations/email.ts:64](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L64) |
| <a id="property-replyto"></a> `replyTo` | `VArray`\<`string`[] \| `undefined`, `VString`\<`string`, `"required"`\>, `"optional"`\> | [src/convex/integrations/email.ts:65](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L65) |
| <a id="property-headers"></a> `headers` | `VArray`\< \| \{ `name`: `string`; `value`: `string`; \}[] \| `undefined`, `VObject`\<\{ `name`: `string`; `value`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; \}, `"required"`, `"name"` \| `"value"`\>, `"optional"`\> | [src/convex/integrations/email.ts:66](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L66) |
| <a id="property-template"></a> `template` | `VObject`\< \| \{ `variables?`: `Record`\<`string`, `string` \| `number`\>; `id`: `string`; \} \| `undefined`, \{ `id`: `VString`\<`string`, `"required"`\>; `variables`: `VRecord`\<`Record`\<`string`, `string` \| `number`\> \| `undefined`, `VString`\<`string`, `"required"`\>, `VUnion`\<`string` \| `number`, \[`VString`\<`string`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"required"`, `never`\>, `"optional"`, `string`\>; \}, `"optional"`, `"id"` \| `"variables"` \| `` `variables.${string}` ``\> | [src/convex/integrations/email.ts:67](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L67) |

## Functions

### setupEmail()

```ts
function setupEmail(component): Email;
```

Defined in: [src/convex/integrations/email.ts:140](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/email.ts#L140)

App-facing email helper over the `backend` component's nested Resend: both
**transactional** email (send / status / cancel + webhook) and **marketing**
email (audiences / contacts / broadcasts via the Resend SDK).

Transactional email needs only `RESEND_API_KEY`; marketing also uses it
directly. Unconfigured, transactional `send` logs instead of delivering.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `component` | [`EmailComponentApi`](#emailcomponentapi) |

#### Returns

[`Email`](#email-1)

#### Example

```ts
import { setupEmail } from 'nuxt-backend/convex/email'
import { components } from './_generated/api'

export const email = setupEmail(components.backend)
export const { getEmailStatus } = email.api
```
