---
navigation: true
---

# convex/integrations/email

## Interfaces

### EmailComponents

Defined in: [src/convex/integrations/email.ts:18](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L18)

The component handle `setupEmail` reads from your generated `components`
object: the package's all-in-one `backend` component, whose email functions
the app reaches as `components.backend.email.*` (see
`src/convex/components/backend/email.ts`). Pass the whole `components`
object — the key is picked structurally.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="backend"></a> `backend` | \{ `email`: \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\>; `status`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\>; `cancel`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\>; `cleanup?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `olderThanMs?`: `number`; \}, `null`\>; `cleanupAbandoned?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `olderThanMs?`: `number`; \}, `null`\>; `handleWebhook`: `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; `type?`: `string`; \}\>; \}; `webhooks?`: `WebhookLogRefs`; \} | - | [src/convex/integrations/email.ts:19](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L19) |
| `backend.email` | \{ `send`: `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\>; `status`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\>; `get`: `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\>; `cancel`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\>; `cleanup?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `olderThanMs?`: `number`; \}, `null`\>; `cleanupAbandoned?`: `FunctionReference`\<`"mutation"`, `"internal"`, \{ `olderThanMs?`: `number`; \}, `null`\>; `handleWebhook`: `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; `type?`: `string`; \}\>; \} | - | [src/convex/integrations/email.ts:20](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L20) |
| `backend.email.send` | `FunctionReference`\<`"mutation"`, `"internal"`, [`SendEmailOptions`](#sendemailoptions), `string` \| `null`\> | - | [src/convex/integrations/email.ts:24](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L24) |
| `backend.email.status` | `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, [`EmailStatus`](#emailstatus) \| `null`\> | - | [src/convex/integrations/email.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L25) |
| `backend.email.get` | `FunctionReference`\<`"query"`, `"internal"`, \{ `emailId`: `string`; \}, `unknown`\> | - | [src/convex/integrations/email.ts:26](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L26) |
| `backend.email.cancel` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `emailId`: `string`; \}, `null`\> | - | [src/convex/integrations/email.ts:27](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L27) |
| `backend.email.cleanup?` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `olderThanMs?`: `number`; \}, `null`\> | Retention pruning of the provider component's email records. Optional so an app pinned to an older component build still type-checks — `email.cleanup` / `email.cleanupAbandoned` then throw, naming the missing function. | [src/convex/integrations/email.ts:34](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L34) |
| `backend.email.cleanupAbandoned?` | `FunctionReference`\<`"mutation"`, `"internal"`, \{ `olderThanMs?`: `number`; \}, `null`\> | - | [src/convex/integrations/email.ts:35](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L35) |
| `backend.email.handleWebhook` | `FunctionReference`\<`"action"`, `"internal"`, \{ `body`: `string`; `headers`: `Record`\<`string`, `string`\>; \}, \{ `status`: `number`; `body`: `string`; `type?`: `string`; \}\> | - | [src/convex/integrations/email.ts:36](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L36) |
| `backend.webhooks?` | `WebhookLogRefs` | - | [src/convex/integrations/email.ts:38](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L38) |

***

### EmailStatus

Defined in: [src/convex/integrations/email.ts:43](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L43)

Resend delivery status, as returned by the component `status` query.

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="status"></a> `status` | `string` | [src/convex/integrations/email.ts:44](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L44) |
| <a id="errormessage"></a> `errorMessage` | `string` \| `null` | [src/convex/integrations/email.ts:45](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L45) |
| <a id="bounced"></a> `bounced` | `boolean` | [src/convex/integrations/email.ts:46](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L46) |
| <a id="complained"></a> `complained` | `boolean` | [src/convex/integrations/email.ts:47](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L47) |
| <a id="failed"></a> `failed` | `boolean` | [src/convex/integrations/email.ts:48](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L48) |
| <a id="deliverydelayed"></a> `deliveryDelayed` | `boolean` | [src/convex/integrations/email.ts:49](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L49) |
| <a id="opened"></a> `opened` | `boolean` | [src/convex/integrations/email.ts:50](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L50) |
| <a id="clicked"></a> `clicked` | `boolean` | [src/convex/integrations/email.ts:51](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L51) |

***

### EmailEventData

Defined in: [src/convex/integrations/email.ts:103](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L103)

`email.*` payload data (documented fields + open for provider additions).

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="email_id"></a> `email_id?` | `string` | [src/convex/integrations/email.ts:104](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L104) |
| <a id="from-1"></a> `from?` | `string` | [src/convex/integrations/email.ts:105](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L105) |
| <a id="to-1"></a> `to?` | `string`[] | [src/convex/integrations/email.ts:106](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L106) |
| <a id="subject-1"></a> `subject?` | `string` | [src/convex/integrations/email.ts:107](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L107) |
| <a id="created_at"></a> `created_at?` | `string` | [src/convex/integrations/email.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L108) |
| <a id="broadcast_id"></a> `broadcast_id?` | `string` | [src/convex/integrations/email.ts:109](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L109) |
| <a id="bounce"></a> `bounce?` | \{ `type?`: `string`; `subType?`: `string`; `message?`: `string`; \} | [src/convex/integrations/email.ts:110](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L110) |
| `bounce.type?` | `string` | [src/convex/integrations/email.ts:110](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L110) |
| `bounce.subType?` | `string` | [src/convex/integrations/email.ts:110](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L110) |
| `bounce.message?` | `string` | [src/convex/integrations/email.ts:110](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L110) |

***

### ContactEventData

Defined in: [src/convex/integrations/email.ts:115](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L115)

`contact.*` payload data.

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id"></a> `id?` | `string` | [src/convex/integrations/email.ts:116](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L116) |
| <a id="audience_id"></a> `audience_id?` | `string` | [src/convex/integrations/email.ts:117](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L117) |
| <a id="email"></a> `email?` | `string` | [src/convex/integrations/email.ts:118](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L118) |
| <a id="first_name"></a> `first_name?` | `string` | [src/convex/integrations/email.ts:119](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L119) |
| <a id="last_name"></a> `last_name?` | `string` | [src/convex/integrations/email.ts:120](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L120) |
| <a id="unsubscribed"></a> `unsubscribed?` | `boolean` | [src/convex/integrations/email.ts:121](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L121) |

***

### DomainEventData

Defined in: [src/convex/integrations/email.ts:126](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L126)

`domain.*` payload data.

#### Indexable

```ts
[key: string]: unknown
```

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="id-1"></a> `id?` | `string` | [src/convex/integrations/email.ts:127](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L127) |
| <a id="name"></a> `name?` | `string` | [src/convex/integrations/email.ts:128](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L128) |
| <a id="status-1"></a> `status?` | `string` | [src/convex/integrations/email.ts:129](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L129) |

***

### EmailWebhookEvent

Defined in: [src/convex/integrations/email.ts:139](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L139)

A verified provider webhook event, as delivered to the typed handlers.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* [`EmailWebhookEventType`](#emailwebhookeventtype) | [`EmailWebhookEventType`](#emailwebhookeventtype) |

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="type"></a> `type` | `T` | [src/convex/integrations/email.ts:140](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L140) |
| <a id="created_at-1"></a> `created_at?` | `string` | [src/convex/integrations/email.ts:141](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L141) |
| <a id="data"></a> `data` | `EventDataFor`\<`T`\> | [src/convex/integrations/email.ts:142](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L142) |

***

### SetupEmailOptions

Defined in: [src/convex/integrations/email.ts:153](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L153)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="events"></a> `events?` | [`EmailWebhookEventHandlers`](#emailwebhookeventhandlers) | React to any verified provider event, keyed by its event name (`'email.bounced'`, `'contact.created'`, …). Handlers run **after** the component has verified the signature and updated delivery status — `useEmailStatus` already reflects the event. A handler throw answers 500, so the provider redelivers (deliveries are deduped once fully processed). | [src/convex/integrations/email.ts:161](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L161) |
| <a id="onunknownevent"></a> `onUnknownEvent?` | (`ctx`, `event`) => `Promise`\<`void`\> | Called for a **verified** event whose type is outside the known catalog (a provider newer than this package). Acknowledged 202 either way. | [src/convex/integrations/email.ts:166](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L166) |
| <a id="deliverylog"></a> `deliveryLog?` | `boolean` | Record inbound webhook deliveries in the component's capped ring buffer (dedupe + doctor + DevTools feed). `false` disables the log and dedupe. | [src/convex/integrations/email.ts:171](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L171) |

***

### Email

Defined in: [src/convex/integrations/email.ts:201](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L201)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="api"></a> `api` | \{ `getEmailStatus`: `RegisteredQuery`\<`"public"`\>; \} | Ready-made, client-callable functions to re-export from your `backend/email.ts`. Currently `getEmailStatus` (the reactive query behind `useEmailStatus`). | [src/convex/integrations/email.ts:206](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L206) |
| `api.getEmailStatus` | `RegisteredQuery`\<`"public"`\> | - | [src/convex/integrations/email.ts:207](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L207) |
| <a id="send"></a> `send` | (`ctx`, `options`) => `Promise`\<`string` \| `null`\> | Send a transactional email (call from your own gated action/mutation). | [src/convex/integrations/email.ts:210](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L210) |
| <a id="status-2"></a> `status` | (`ctx`, `emailId`) => `Promise`\<[`EmailStatus`](#emailstatus) \| `null`\> | Read an email's delivery status. | [src/convex/integrations/email.ts:212](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L212) |
| <a id="cancel"></a> `cancel` | (`ctx`, `emailId`) => `Promise`\<`void`\> | Cancel a not-yet-sent email. | [src/convex/integrations/email.ts:214](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L214) |
| <a id="cleanup"></a> `cleanup` | (`ctx`, `options?`) => `Promise`\<`void`\> | Prune finalized email records (delivered, bounced, cancelled, failed …) older than `olderThanMs` — default 7 days. Schedules the provider's batched cleanup and returns at once; call it from a cron. **Example** `[backend/crons.ts] crons.daily('prune emails', { hourUTC: 3, minuteUTC: 0 }, internal.email.pruneEmails) // internal.email.pruneEmails: internalMutation(ctx => email.cleanup(ctx, { olderThanMs: 7 * DAY }))` | [src/convex/integrations/email.ts:226](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L226) |
| <a id="cleanupabandoned"></a> `cleanupAbandoned` | (`ctx`, `options?`) => `Promise`\<`void`\> | Prune abandoned email records — created more than `olderThanMs` ago (default 30 days) and never finalized, e.g. because a delivery webhook never arrived. Scheduled like `cleanup`. | [src/convex/integrations/email.ts:232](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L232) |
| <a id="webhookhandler"></a> `webhookHandler` | (`ctx`, `request`) => `Promise`\<`Response`\> | Handle an email-provider event webhook from your app's `/email/events` HTTP route (inside an `httpAction`); returns the Response to send back. | [src/convex/integrations/email.ts:237](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L237) |
| <a id="audiences"></a> `audiences` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `list`: () => `Promise`\<`unknown`\>; `remove`: (`id`) => `Promise`\<`unknown`\>; \} | Marketing audiences (Resend segments): create / list / remove. | [src/convex/integrations/email.ts:239](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L239) |
| `audiences.create` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:240](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L240) |
| `audiences.list` | () => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:241](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L241) |
| `audiences.remove` | (`id`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:242](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L242) |
| <a id="contacts"></a> `contacts` | \{ `add`: (`payload`) => `Promise`\<`unknown`\>; `list`: (`payload`) => `Promise`\<`unknown`\>; `update`: (`payload`) => `Promise`\<`unknown`\>; `remove`: (`payload`) => `Promise`\<`unknown`\>; \} | Marketing contacts: add (subscribe) / list / update / remove (unsubscribe). | [src/convex/integrations/email.ts:245](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L245) |
| `contacts.add` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:246](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L246) |
| `contacts.list` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:247](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L247) |
| `contacts.update` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:248](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L248) |
| `contacts.remove` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:249](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L249) |
| <a id="broadcasts"></a> `broadcasts` | \{ `create`: (`payload`) => `Promise`\<`unknown`\>; `send`: (`id`, `payload?`) => `Promise`\<`unknown`\>; \} | Marketing broadcasts: create / send (optionally scheduled). | [src/convex/integrations/email.ts:252](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L252) |
| `broadcasts.create` | (`payload`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:253](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L253) |
| `broadcasts.send` | (`id`, `payload?`) => `Promise`\<`unknown`\> | - | [src/convex/integrations/email.ts:254](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L254) |

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

Defined in: [src/convex/integrations/email.ts:55](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L55)

Options for a transactional send (mirrors the component `send` mutation).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="to"></a> `to` | `string` \| `string`[] | [src/convex/integrations/email.ts:56](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L56) |
| <a id="subject"></a> `subject?` | `string` | [src/convex/integrations/email.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L57) |
| <a id="html"></a> `html?` | `string` | [src/convex/integrations/email.ts:58](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L58) |
| <a id="text"></a> `text?` | `string` | [src/convex/integrations/email.ts:59](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L59) |
| <a id="from"></a> `from?` | `string` | [src/convex/integrations/email.ts:60](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L60) |
| <a id="cc"></a> `cc?` | `string` \| `string`[] | [src/convex/integrations/email.ts:61](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L61) |
| <a id="bcc"></a> `bcc?` | `string` \| `string`[] | [src/convex/integrations/email.ts:62](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L62) |
| <a id="replyto"></a> `replyTo?` | `string`[] | [src/convex/integrations/email.ts:63](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L63) |
| <a id="headers"></a> `headers?` | \{ `name`: `string`; `value`: `string`; \}[] | [src/convex/integrations/email.ts:64](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L64) |
| <a id="template"></a> `template?` | \{ `id`: `string`; `variables?`: `Record`\<`string`, `string` \| `number`\>; \} | [src/convex/integrations/email.ts:65](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L65) |
| `template.id` | `string` | [src/convex/integrations/email.ts:65](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L65) |
| `template.variables?` | `Record`\<`string`, `string` \| `number`\> | [src/convex/integrations/email.ts:65](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L65) |

***

### EmailWebhookEventType

```ts
type EmailWebhookEventType = typeof ALL_EMAIL_EVENTS[number];
```

Defined in: [src/convex/integrations/email.ts:100](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L100)

***

### EmailWebhookEventHandlers

```ts
type EmailWebhookEventHandlers = { [K in EmailWebhookEventType]?: (ctx: AnyActionCtx, event: EmailWebhookEvent<K>) => Promise<void> };
```

Defined in: [src/convex/integrations/email.ts:149](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L149)

Per-event email webhook handlers, keyed by the provider's event names —
the complete catalog, uniform with `setupBilling({ events })`.

## Variables

### ALL\_EMAIL\_EVENTS

```ts
const ALL_EMAIL_EVENTS: readonly ["email.sent", "email.delivered", "email.delivery_delayed", "email.bounced", "email.complained", "email.opened", "email.clicked", "email.failed", "email.scheduled", "email.received", "email.suppressed", "contact.created", "contact.updated", "contact.deleted", "domain.created", "domain.updated", "domain.deleted"];
```

Defined in: [src/convex/integrations/email.ts:80](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L80)

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

Defined in: [src/convex/integrations/email.ts:174](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L174)

Re-export so consumers can keep the `send` argument validator aligned.

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| <a id="property-to"></a> `to` | `VUnion`\<`string` \| `string`[], \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"required"`, `never`\> | [src/convex/integrations/email.ts:175](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L175) |
| <a id="property-subject"></a> `subject` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:176](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L176) |
| <a id="property-html"></a> `html` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:177](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L177) |
| <a id="property-text"></a> `text` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:178](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L178) |
| <a id="property-from"></a> `from` | `VString`\<`string` \| `undefined`, `"optional"`\> | [src/convex/integrations/email.ts:179](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L179) |
| <a id="property-cc"></a> `cc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [src/convex/integrations/email.ts:180](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L180) |
| <a id="property-bcc"></a> `bcc` | `VUnion`\<`string` \| `string`[] \| `undefined`, \[`VString`\<`string`, `"required"`\>, `VArray`\<`string`[], `VString`\<`string`, `"required"`\>, `"required"`\>\], `"optional"`, `never`\> | [src/convex/integrations/email.ts:181](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L181) |
| <a id="property-replyto"></a> `replyTo` | `VArray`\<`string`[] \| `undefined`, `VString`\<`string`, `"required"`\>, `"optional"`\> | [src/convex/integrations/email.ts:182](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L182) |
| <a id="property-headers"></a> `headers` | `VArray`\< \| \{ `value`: `string`; `name`: `string`; \}[] \| `undefined`, `VObject`\<\{ `value`: `string`; `name`: `string`; \}, \{ `name`: `VString`\<`string`, `"required"`\>; `value`: `VString`\<`string`, `"required"`\>; \}, `"required"`, `"value"` \| `"name"`\>, `"optional"`\> | [src/convex/integrations/email.ts:183](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L183) |
| <a id="property-template"></a> `template` | `VObject`\< \| \{ `variables?`: `Record`\<`string`, `string` \| `number`\>; `id`: `string`; \} \| `undefined`, \{ `id`: `VString`\<`string`, `"required"`\>; `variables`: `VRecord`\<`Record`\<`string`, `string` \| `number`\> \| `undefined`, `VString`\<`string`, `"required"`\>, `VUnion`\<`string` \| `number`, \[`VString`\<`string`, `"required"`\>, `VFloat64`\<`number`, `"required"`\>\], `"required"`, `never`\>, `"optional"`, `string`\>; \}, `"optional"`, `"id"` \| `"variables"` \| `` `variables.${string}` ``\> | [src/convex/integrations/email.ts:184](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L184) |

## Functions

### setupEmail()

```ts
function setupEmail(components, options?): Email;
```

Defined in: [src/convex/integrations/email.ts:275](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/email.ts#L275)

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
