---
navigation: true
---

# convex/integrations/email

## Interfaces

### EmailComponents

Defined in: [nuxt-backend/src/convex/integrations/email.ts:17](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L17)

The component handle `setupEmail` reads from your generated `components`
object: the package's all-in-one `backend` component, whose email functions
the app reaches as `components.backend.email.*` (see
`src/convex/components/backend/email.ts`). Pass the whole `components`
object — the key is picked structurally.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="backend"></a> `backend` | \{ `email`: \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\>; `status`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\>; `cancel`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\>; `handleWebhook`: `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; \}\>; \}; \} | [nuxt-backend/src/convex/integrations/email.ts:18](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L18) |
| `backend.email` | \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\>; `status`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\>; `cancel`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\>; `handleWebhook`: `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; \}\>; \} | [nuxt-backend/src/convex/integrations/email.ts:19](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L19) |
| `backend.email.send` | `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\> | [nuxt-backend/src/convex/integrations/email.ts:23](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L23) |
| `backend.email.status` | `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\> | [nuxt-backend/src/convex/integrations/email.ts:24](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L24) |
| `backend.email.get` | `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\> | [nuxt-backend/src/convex/integrations/email.ts:25](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L25) |
| `backend.email.cancel` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/email.ts:26](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L26) |
| `backend.email.handleWebhook` | `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; \}\> | [nuxt-backend/src/convex/integrations/email.ts:27](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L27) |

***

### EmailStatus

Defined in: [nuxt-backend/src/convex/integrations/email.ts:33](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L33)

Resend delivery status, as returned by the component `status` query.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="status"></a> `status` | `string` | [nuxt-backend/src/convex/integrations/email.ts:34](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L34) |
| <a id="errormessage"></a> `errorMessage` | `string` \| `null` | [nuxt-backend/src/convex/integrations/email.ts:35](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L35) |
| <a id="bounced"></a> `bounced` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:36](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L36) |
| <a id="complained"></a> `complained` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:37](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L37) |
| <a id="failed"></a> `failed` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:38](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L38) |
| <a id="deliverydelayed"></a> `deliveryDelayed` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:39](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L39) |
| <a id="opened"></a> `opened` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:40](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L40) |
| <a id="clicked"></a> `clicked` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:41](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L41) |

***

### EmailEvent

Defined in: [nuxt-backend/src/convex/integrations/email.ts:65](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L65)

A delivery event from the Resend webhook, passed to the email event hooks.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="type"></a> `type` | `string` | The Resend event type, e.g. `'email.bounced'`. | [nuxt-backend/src/convex/integrations/email.ts:67](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L67) |
| <a id="emailid"></a> `emailId` | `string` \| `null` | The Resend email id (matches `useEmailStatus(emailId)`). | [nuxt-backend/src/convex/integrations/email.ts:69](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L69) |
| <a id="to-1"></a> `to` | `string`[] | Recipient addresses. | [nuxt-backend/src/convex/integrations/email.ts:71](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L71) |
| <a id="data"></a> `data` | `Record`\<`string`, `unknown`\> | The raw event `data` payload for anything not surfaced above. | [nuxt-backend/src/convex/integrations/email.ts:73](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L73) |

***

### SetupEmailOptions

Defined in: [nuxt-backend/src/convex/integrations/email.ts:79](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L79)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="events"></a> `events?` | \{ `onDelivered?`: [`EmailEventHandler`](#emaileventhandler); `onBounced?`: [`EmailEventHandler`](#emaileventhandler); `onComplained?`: [`EmailEventHandler`](#emaileventhandler); \} | React to delivery events. Handlers run **after** the component has verified (svix, `EMAIL_WEBHOOK_SECRET`) and processed the event — `useEmailStatus` already reflects it. E.g. flag a user's address on `onBounced`, or alert an admin on `onComplained`. | [nuxt-backend/src/convex/integrations/email.ts:86](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L86) |
| `events.onDelivered?` | [`EmailEventHandler`](#emaileventhandler) | - | [nuxt-backend/src/convex/integrations/email.ts:87](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L87) |
| `events.onBounced?` | [`EmailEventHandler`](#emaileventhandler) | - | [nuxt-backend/src/convex/integrations/email.ts:88](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L88) |
| `events.onComplained?` | [`EmailEventHandler`](#emaileventhandler) | - | [nuxt-backend/src/convex/integrations/email.ts:89](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L89) |

***

### Email

Defined in: [nuxt-backend/src/convex/integrations/email.ts:127](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L127)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api` | \{ `getEmailStatus`: `RegisteredQuery`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `backend/email.ts`. Currently `getEmailStatus` (the reactive query behind `useEmailStatus`). | [nuxt-backend/src/convex/integrations/email.ts:132](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L132) |
| `api.getEmailStatus` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/email.ts:133](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L133) |
| <a id="send"></a> `send` | (`ctx`, `options`) => `Promise`\<`string` \| `null`\> | Send a transactional email (call from your own gated action/mutation). | [nuxt-backend/src/convex/integrations/email.ts:136](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L136) |
| <a id="status-1"></a> `status` | (`ctx`, `emailId`) => `Promise`\<[`EmailStatus`](#emailstatus) \| `null`\> | Read an email's delivery status. | [nuxt-backend/src/convex/integrations/email.ts:138](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L138) |
| <a id="cancel"></a> `cancel` | (`ctx`, `emailId`) => `Promise`\<`void`\> | Cancel a not-yet-sent email. | [nuxt-backend/src/convex/integrations/email.ts:140](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L140) |
| <a id="webhookhandler"></a> `webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | Handle an email-provider event webhook from your app's `/email/events` HTTP route (inside an `httpAction`); returns the Response to send back. | [nuxt-backend/src/convex/integrations/email.ts:145](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L145) |
| <a id="audiences"></a> `audiences` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `list`: () => `Promise`\<`unknown`\>; `remove`: (`id`) => `Promise`\<`unknown`\>; \} | Marketing audiences (Resend segments): create / list / remove. | [nuxt-backend/src/convex/integrations/email.ts:147](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L147) |
| `audiences.create` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:148](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L148) |
| `audiences.list` | () => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:149](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L149) |
| `audiences.remove` | (`id`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:150](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L150) |
| <a id="contacts"></a> `contacts` | \{ `add`: (`payload`) => `Promise`\<`unknown`\>; `list`: (`payload`) => `Promise`\<`unknown`\>; `update`: (`payload`) => `Promise`\<`unknown`\>; `remove`: (`payload`) => `Promise`\<`unknown`\>; \} | Marketing contacts: add (subscribe) / list / update / remove (unsubscribe). | [nuxt-backend/src/convex/integrations/email.ts:153](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L153) |
| `contacts.add` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:154](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L154) |
| `contacts.list` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:155](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L155) |
| `contacts.update` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:156](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L156) |
| `contacts.remove` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:157](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L157) |
| <a id="broadcasts"></a> `broadcasts` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `send`: (`id`, `payload?`) => `Promise`\<`unknown`\>; \} | Marketing broadcasts: create / send (optionally scheduled). | [nuxt-backend/src/convex/integrations/email.ts:160](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L160) |
| `broadcasts.create` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:161](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L161) |
| `broadcasts.send` | (`id`, `payload?`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:162](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L162) |

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

Defined in: [nuxt-backend/src/convex/integrations/email.ts:45](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L45)

Options for a transactional send (mirrors the component `send` mutation).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` \| `string`[] | [nuxt-backend/src/convex/integrations/email.ts:46](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L46) |
| <a id="subject"></a> `subject?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:47](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L47) |
| <a id="html"></a> `html?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:48](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L48) |
| <a id="text"></a> `text?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:49](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L49) |
| <a id="from"></a> `from?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:50](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L50) |
| <a id="cc"></a> `cc?` | `string` \| `string`[] | [nuxt-backend/src/convex/integrations/email.ts:51](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L51) |
| <a id="bcc"></a> `bcc?` | `string` \| `string`[] | [nuxt-backend/src/convex/integrations/email.ts:52](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L52) |
| <a id="replyto"></a> `replyTo?` | `string`[] | [nuxt-backend/src/convex/integrations/email.ts:53](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L53) |
| <a id="headers"></a> `headers?` | \{ `name`: `string`; `value`: `string`; \}[] | [nuxt-backend/src/convex/integrations/email.ts:54](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L54) |
| <a id="template"></a> `template?` | \{ `id`: `string`; `variables?`: `Record`\<`string`, `string` \| `number`\>; \} | [nuxt-backend/src/convex/integrations/email.ts:55](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L55) |
| `template.id` | `string` | [nuxt-backend/src/convex/integrations/email.ts:55](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L55) |
| `template.variables?` | `Record`\<`string`, `string` \| `number`\> | [nuxt-backend/src/convex/integrations/email.ts:55](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L55) |

***

### EmailEventHandler

```ts
type EmailEventHandler = (ctx, event) => Promise<void>;
```

Defined in: [nuxt-backend/src/convex/integrations/email.ts:77](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L77)

A hook invoked after the component has processed a verified webhook event.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `AnyActionCtx` |
| `event` | [`EmailEvent`](#emailevent) |

#### Returns

`Promise`\<`void`\>

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

Defined in: [nuxt-backend/src/convex/integrations/email.ts:100](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L100)

Re-export so consumers can keep the `send` argument validator aligned.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-to"></a> `to` | `VUnion`\<`string` \| `string`[], \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"required"`, `never`\> | [nuxt-backend/src/convex/integrations/email.ts:101](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L101) |
| <a id="property-subject"></a> `subject` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:102](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L102) |
| <a id="property-html"></a> `html` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:103](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L103) |
| <a id="property-text"></a> `text` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:104](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L104) |
| <a id="property-from"></a> `from` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:105](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L105) |
| <a id="property-cc"></a> `cc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [nuxt-backend/src/convex/integrations/email.ts:106](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L106) |
| <a id="property-bcc"></a> `bcc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [nuxt-backend/src/convex/integrations/email.ts:107](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L107) |
| <a id="property-replyto"></a> `replyTo` | `VArray`\<`string`[] \| `undefined`, `VString`\<`string`, `"required"`\>, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:108](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L108) |
| <a id="property-headers"></a> `headers` | `VArray`\< \| \{ `name`: `string`; `value`: `string`; \}[] \| `undefined`, `VObject`\<\{ `name`: `string`; `value`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; \}, `"required"`, `"name"` \| `"value"`\>, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:109](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L109) |
| <a id="property-template"></a> `template` | `VObject`\< \| \{ `variables?`: `Record`\<`string`, `string` \| `number`\>; `id`: `string`; \} \| `undefined`, \{ `id`: `VString`\<`string`, `"required"`\>; `variables`: `VRecord`\<`Record`\<`string`, `string` \| `number`\> \| `undefined`, `VString`\<`string`, `"required"`\>, `VUnion`\<`string` \| `number`, \[`VString`\<`string`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"required"`, `never`\>, `"optional"`, `string`\>; \}, `"optional"`, `"id"` \| `"variables"` \| `` `variables.${string}` ``\> | [nuxt-backend/src/convex/integrations/email.ts:110](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L110) |

## Functions

### setupEmail()

```ts
function setupEmail(components, options?): Email;
```

Defined in: [nuxt-backend/src/convex/integrations/email.ts:183](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/email.ts#L183)

App-facing email helper over the `backend` component's email module: both
**transactional** email (send / status / cancel + webhook) and **marketing**
email (audiences / contacts / broadcasts via the provider SDK).

Both use the required `EMAIL_API_KEY` env var. While it's missing (e.g. a
mid-configuration preview), transactional `send` logs instead of delivering.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`EmailComponents`](#emailcomponents) |
| `options` | [`SetupEmailOptions`](#setupemailoptions) |

#### Returns

[`Email`](#email)

#### Example

```ts
import { setupEmail } from 'nuxt-backend/email'
import { components } from './_generated/api'

export const email = setupEmail(components)
export const { getEmailStatus } = email.api
```
