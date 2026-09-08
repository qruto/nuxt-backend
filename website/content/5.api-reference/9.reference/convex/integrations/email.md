---
navigation: true
---

# convex/integrations/email

## Interfaces

### EmailComponents

Defined in: [nuxt-backend/src/convex/integrations/email.ts:18](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L18)

The component handle `setupEmail` reads from your generated `components`
object: the package's all-in-one `backend` component, whose email functions
the app reaches as `components.backend.email.*` (see
`src/convex/components/backend/email.ts`). Pass the whole `components`
object — the key is picked structurally.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="backend"></a> `backend` | \{ `email`: \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\>; `status`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\>; `cancel`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\>; `handleWebhook`: `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; `type?`: `string`; \}\>; \}; `webhooks?`: `WebhookLogRefs`; \} | [nuxt-backend/src/convex/integrations/email.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L19) |
| `backend.email` | \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\>; `status`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\>; `cancel`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\>; `handleWebhook`: `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; `type?`: `string`; \}\>; \} | [nuxt-backend/src/convex/integrations/email.ts:20](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L20) |
| `backend.email.send` | `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\> | [nuxt-backend/src/convex/integrations/email.ts:24](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L24) |
| `backend.email.status` | `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\> | [nuxt-backend/src/convex/integrations/email.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L25) |
| `backend.email.get` | `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\> | [nuxt-backend/src/convex/integrations/email.ts:26](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L26) |
| `backend.email.cancel` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\> | [nuxt-backend/src/convex/integrations/email.ts:27](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L27) |
| `backend.email.handleWebhook` | `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; `type?`: `string`; \}\> | [nuxt-backend/src/convex/integrations/email.ts:28](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L28) |
| `backend.webhooks?` | `WebhookLogRefs` | [nuxt-backend/src/convex/integrations/email.ts:30](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L30) |

***

### EmailStatus

Defined in: [nuxt-backend/src/convex/integrations/email.ts:35](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L35)

Resend delivery status, as returned by the component `status` query.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="status"></a> `status` | `string` | [nuxt-backend/src/convex/integrations/email.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L36) |
| <a id="errormessage"></a> `errorMessage` | `string` \| `null` | [nuxt-backend/src/convex/integrations/email.ts:37](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L37) |
| <a id="bounced"></a> `bounced` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:38](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L38) |
| <a id="complained"></a> `complained` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L39) |
| <a id="failed"></a> `failed` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:40](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L40) |
| <a id="deliverydelayed"></a> `deliveryDelayed` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:41](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L41) |
| <a id="opened"></a> `opened` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:42](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L42) |
| <a id="clicked"></a> `clicked` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L43) |

***

### EmailEventData

Defined in: [nuxt-backend/src/convex/integrations/email.ts:95](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L95)

`email.*` payload data (documented fields + open for provider additions).

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="email_id"></a> `email_id?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:96](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L96) |
| <a id="from-1"></a> `from?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:97](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L97) |
| <a id="to-1"></a> `to?` | `string`[] | [nuxt-backend/src/convex/integrations/email.ts:98](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L98) |
| <a id="subject-1"></a> `subject?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:99](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L99) |
| <a id="created_at"></a> `created_at?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:100](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L100) |
| <a id="broadcast_id"></a> `broadcast_id?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:101](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L101) |
| <a id="bounce"></a> `bounce?` | \{ `type?`: `string`; `subType?`: `string`; `message?`: `string`; \} | [nuxt-backend/src/convex/integrations/email.ts:102](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L102) |
| `bounce.type?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:102](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L102) |
| `bounce.subType?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:102](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L102) |
| `bounce.message?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:102](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L102) |

***

### ContactEventData

Defined in: [nuxt-backend/src/convex/integrations/email.ts:107](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L107)

`contact.*` payload data.

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id"></a> `id?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L108) |
| <a id="audience_id"></a> `audience_id?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L109) |
| <a id="email"></a> `email?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:110](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L110) |
| <a id="first_name"></a> `first_name?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:111](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L111) |
| <a id="last_name"></a> `last_name?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:112](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L112) |
| <a id="unsubscribed"></a> `unsubscribed?` | `boolean` | [nuxt-backend/src/convex/integrations/email.ts:113](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L113) |

***

### DomainEventData

Defined in: [nuxt-backend/src/convex/integrations/email.ts:118](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L118)

`domain.*` payload data.

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id-1"></a> `id?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:119](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L119) |
| <a id="name"></a> `name?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L120) |
| <a id="status-1"></a> `status?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:121](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L121) |

***

### EmailWebhookEvent

Defined in: [nuxt-backend/src/convex/integrations/email.ts:131](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L131)

A verified provider webhook event, as delivered to the typed handlers.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* [`EmailWebhookEventType`](#emailwebhookeventtype) | [`EmailWebhookEventType`](#emailwebhookeventtype) |

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="type"></a> `type` | `T` | [nuxt-backend/src/convex/integrations/email.ts:132](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L132) |
| <a id="created_at-1"></a> `created_at?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:133](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L133) |
| <a id="data"></a> `data` | `EventDataFor`\<`T`\> | [nuxt-backend/src/convex/integrations/email.ts:134](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L134) |

***

### SetupEmailOptions

Defined in: [nuxt-backend/src/convex/integrations/email.ts:145](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L145)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="events"></a> `events?` | [`EmailWebhookEventHandlers`](#emailwebhookeventhandlers) | React to any verified provider event, keyed by its event name (`'email.bounced'`, `'contact.created'`, …). Handlers run **after** the component has verified the signature and updated delivery status — `useEmailStatus` already reflects the event. A handler throw answers 500, so the provider redelivers (deliveries are deduped once fully processed). | [nuxt-backend/src/convex/integrations/email.ts:153](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L153) |
| <a id="onunknownevent"></a> `onUnknownEvent?` | (`ctx`, `event`) => `Promise`\<`void`\> | Called for a **verified** event whose type is outside the known catalog (a provider newer than this package). Acknowledged 202 either way. | [nuxt-backend/src/convex/integrations/email.ts:158](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L158) |
| <a id="deliverylog"></a> `deliveryLog?` | `boolean` | Record inbound webhook deliveries in the component's capped ring buffer (dedupe + doctor + DevTools feed). `false` disables the log and dedupe. | [nuxt-backend/src/convex/integrations/email.ts:163](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L163) |

***

### Email

Defined in: [nuxt-backend/src/convex/integrations/email.ts:193](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L193)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api` | \{ `getEmailStatus`: `RegisteredQuery`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `backend/email.ts`. Currently `getEmailStatus` (the reactive query behind `useEmailStatus`). | [nuxt-backend/src/convex/integrations/email.ts:198](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L198) |
| `api.getEmailStatus` | `RegisteredQuery`\<`"public"`\> | - | [nuxt-backend/src/convex/integrations/email.ts:199](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L199) |
| <a id="send"></a> `send` | (`ctx`, `options`) => `Promise`\<`string` \| `null`\> | Send a transactional email (call from your own gated action/mutation). | [nuxt-backend/src/convex/integrations/email.ts:202](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L202) |
| <a id="status-2"></a> `status` | (`ctx`, `emailId`) => `Promise`\<[`EmailStatus`](#emailstatus) \| `null`\> | Read an email's delivery status. | [nuxt-backend/src/convex/integrations/email.ts:204](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L204) |
| <a id="cancel"></a> `cancel` | (`ctx`, `emailId`) => `Promise`\<`void`\> | Cancel a not-yet-sent email. | [nuxt-backend/src/convex/integrations/email.ts:206](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L206) |
| <a id="webhookhandler"></a> `webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | Handle an email-provider event webhook from your app's `/email/events` HTTP route (inside an `httpAction`); returns the Response to send back. | [nuxt-backend/src/convex/integrations/email.ts:211](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L211) |
| <a id="audiences"></a> `audiences` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `list`: () => `Promise`\<`unknown`\>; `remove`: (`id`) => `Promise`\<`unknown`\>; \} | Marketing audiences (Resend segments): create / list / remove. | [nuxt-backend/src/convex/integrations/email.ts:213](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L213) |
| `audiences.create` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:214](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L214) |
| `audiences.list` | () => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:215](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L215) |
| `audiences.remove` | (`id`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:216](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L216) |
| <a id="contacts"></a> `contacts` | \{ `add`: (`payload`) => `Promise`\<`unknown`\>; `list`: (`payload`) => `Promise`\<`unknown`\>; `update`: (`payload`) => `Promise`\<`unknown`\>; `remove`: (`payload`) => `Promise`\<`unknown`\>; \} | Marketing contacts: add (subscribe) / list / update / remove (unsubscribe). | [nuxt-backend/src/convex/integrations/email.ts:219](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L219) |
| `contacts.add` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:220](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L220) |
| `contacts.list` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:221](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L221) |
| `contacts.update` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:222](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L222) |
| `contacts.remove` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:223](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L223) |
| <a id="broadcasts"></a> `broadcasts` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `send`: (`id`, `payload?`) => `Promise`\<`unknown`\>; \} | Marketing broadcasts: create / send (optionally scheduled). | [nuxt-backend/src/convex/integrations/email.ts:226](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L226) |
| `broadcasts.create` | (`payload`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:227](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L227) |
| `broadcasts.send` | (`id`, `payload?`) => `Promise`\<`unknown`\> | - | [nuxt-backend/src/convex/integrations/email.ts:228](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L228) |

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

Defined in: [nuxt-backend/src/convex/integrations/email.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L47)

Options for a transactional send (mirrors the component `send` mutation).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` \| `string`[] | [nuxt-backend/src/convex/integrations/email.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L48) |
| <a id="subject"></a> `subject?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:49](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L49) |
| <a id="html"></a> `html?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:50](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L50) |
| <a id="text"></a> `text?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L51) |
| <a id="from"></a> `from?` | `string` | [nuxt-backend/src/convex/integrations/email.ts:52](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L52) |
| <a id="cc"></a> `cc?` | `string` \| `string`[] | [nuxt-backend/src/convex/integrations/email.ts:53](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L53) |
| <a id="bcc"></a> `bcc?` | `string` \| `string`[] | [nuxt-backend/src/convex/integrations/email.ts:54](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L54) |
| <a id="replyto"></a> `replyTo?` | `string`[] | [nuxt-backend/src/convex/integrations/email.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L55) |
| <a id="headers"></a> `headers?` | \{ `name`: `string`; `value`: `string`; \}[] | [nuxt-backend/src/convex/integrations/email.ts:56](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L56) |
| <a id="template"></a> `template?` | \{ `id`: `string`; `variables?`: `Record`\<`string`, `string` \| `number`\>; \} | [nuxt-backend/src/convex/integrations/email.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L57) |
| `template.id` | `string` | [nuxt-backend/src/convex/integrations/email.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L57) |
| `template.variables?` | `Record`\<`string`, `string` \| `number`\> | [nuxt-backend/src/convex/integrations/email.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L57) |

***

### EmailWebhookEventType

```ts
type EmailWebhookEventType = typeof ALL_EMAIL_EVENTS[number];
```

Defined in: [nuxt-backend/src/convex/integrations/email.ts:92](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L92)

***

### EmailWebhookEventHandlers

```ts
type EmailWebhookEventHandlers = { [K in EmailWebhookEventType]?: (ctx: AnyActionCtx, event: EmailWebhookEvent<K>) => Promise<void> };
```

Defined in: [nuxt-backend/src/convex/integrations/email.ts:141](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L141)

Per-event email webhook handlers, keyed by the provider's event names —
the complete catalog, uniform with `setupBilling({ events })`.

## Variables

### ALL\_EMAIL\_EVENTS

```ts
const ALL_EMAIL_EVENTS: readonly ["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.opened", "email.clicked", "email.failed", "email.scheduled", "email.received", "email.suppressed", "contact.created", "contact.updated", "contact.deleted", "domain.created", "domain.updated", "domain.deleted"];
```

Defined in: [nuxt-backend/src/convex/integrations/email.ts:72](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L72)

The provider's full webhook event catalog: every transactional delivery
state, plus the contact and domain events the marketing surface
(audiences/contacts/broadcasts) generates. Broadcast sends surface as
`email.*` events carrying a `broadcast_id`.

***

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
     value: string;
     name: string;
   }[]
     | undefined, VObject<{
     value: string;
     name: string;
   }, {
     name: VString<string, "required">;
     value: VString<string, "required">;
  }, "required", "value" | "name">, "optional">;
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

Defined in: [nuxt-backend/src/convex/integrations/email.ts:166](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L166)

Re-export so consumers can keep the `send` argument validator aligned.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-to"></a> `to` | `VUnion`\<`string` \| `string`[], \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"required"`, `never`\> | [nuxt-backend/src/convex/integrations/email.ts:167](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L167) |
| <a id="property-subject"></a> `subject` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:168](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L168) |
| <a id="property-html"></a> `html` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:169](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L169) |
| <a id="property-text"></a> `text` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:170](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L170) |
| <a id="property-from"></a> `from` | `VString`\<`string` \| `undefined`, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:171](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L171) |
| <a id="property-cc"></a> `cc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [nuxt-backend/src/convex/integrations/email.ts:172](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L172) |
| <a id="property-bcc"></a> `bcc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [nuxt-backend/src/convex/integrations/email.ts:173](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L173) |
| <a id="property-replyto"></a> `replyTo` | `VArray`\<`string`[] \| `undefined`, `VString`\<`string`, `"required"`\>, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:174](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L174) |
| <a id="property-headers"></a> `headers` | `VArray`\< \| \{ `value`: `string`; `name`: `string`; \}[] \| `undefined`, `VObject`\<\{ `value`: `string`; `name`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; \}, `"required"`, `"value"` \| `"name"`\>, `"optional"`\> | [nuxt-backend/src/convex/integrations/email.ts:175](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L175) |
| <a id="property-template"></a> `template` | `VObject`\< \| \{ `variables?`: `Record`\<`string`, `string` \| `number`\>; `id`: `string`; \} \| `undefined`, \{ `id`: `VString`\<`string`, `"required"`\>; `variables`: `VRecord`\<`Record`\<`string`, `string` \| `number`\> \| `undefined`, `VString`\<`string`, `"required"`\>, `VUnion`\<`string` \| `number`, \[`VString`\<`string`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"required"`, `never`\>, `"optional"`, `string`\>; \}, `"optional"`, `"id"` \| `"variables"` \| `` `variables.${string}` ``\> | [nuxt-backend/src/convex/integrations/email.ts:176](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L176) |

## Functions

### setupEmail()

```ts
function setupEmail(components, options?): Email;
```

Defined in: [nuxt-backend/src/convex/integrations/email.ts:249](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L249)

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

[`Email`](#email-1)

#### Example

```ts
import { setupEmail } from 'nuxt-backend/email'
import { components } from './_generated/api'

export const email = setupEmail(components)
export const { getEmailStatus } = email.api
```
