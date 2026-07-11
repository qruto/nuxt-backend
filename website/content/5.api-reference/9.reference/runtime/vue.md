---
navigation: true
---

# runtime/vue

Tools to integrate Convex into Vue applications.

This module contains:
1. [ConvexVueClient](#convexvueclient), a client for using Convex in Vue.
2. [ConvexClientKey](#convexclientkey), a Vue injection key for providing the client.
3. [Authenticated](#authenticated), [Unauthenticated](#unauthenticated) and [AuthLoading](#authloading) helper auth components.
4. Composables [useQuery](#usequery), [useMutation](#usemutation), [useAction](#useaction) and more.

## Classes

### ConvexVueClient

Defined in: [src/runtime/vue/client.ts:149](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L149)

The primary Convex client for Vue and Nuxt applications.

Manages a WebSocket connection to the Convex backend and exposes methods
for subscribing to queries, running mutations, and executing actions.
The underlying WebSocket is created lazily so that no connection is opened
during server-side rendering.

In a Nuxt app the client is automatically provided by the plugin and
available via the [useConvex](#useconvex) composable or `useNuxtApp().$convex`.

#### Constructors

##### Constructor

```ts
new ConvexVueClient(address, options?): ConvexVueClient;
```

Defined in: [src/runtime/vue/client.ts:161](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L161)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `address` | `string` |
| `options?` | [`ConvexVueClientOptions`](#convexvueclientoptions) |

###### Returns

[`ConvexVueClient`](#convexvueclient)

#### Accessors

##### url

###### Get Signature

```ts
get url(): string;
```

Defined in: [src/runtime/vue/client.ts:196](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L196)

The deployment URL this client is connected to.

###### Returns

`string`

##### logger

###### Get Signature

```ts
get logger(): Logger;
```

Defined in: [src/runtime/vue/client.ts:473](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L473)

Get the logger configured for this client.

This is the same logger instance handed to the underlying
BaseConvexClient, so client-level and SDK-level logging stay
consistent.

###### Returns

`Logger`

#### Methods

##### setAuth()

```ts
setAuth(fetchToken, onChange?): void;
```

Defined in: [src/runtime/vue/client.ts:241](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L241)

Register a callback that returns the current auth token.

Called by auth integrations (e.g. Better Auth) to pass tokens to the
Convex backend. Supply an optional `onChange` to be notified when the
server confirms the authenticated state.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fetchToken` | [`AuthTokenFetcher`](#authtokenfetcher) |
| `onChange?` | (`isAuthenticated`) => `void` |

###### Returns

`void`

##### clearAuth()

```ts
clearAuth(): void;
```

Defined in: [src/runtime/vue/client.ts:264](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L264)

Clear the current auth token and sign out from Convex.

The underlying sync client is only contacted if it has already been
instantiated; calling this before the first WebSocket connection is a
safe no-op.

###### Returns

`void`

##### watchQuery()

```ts
watchQuery<Query>(query, ...argsAndOptions): Watch<FunctionReturnType<Query>>;
```

Defined in: [src/runtime/vue/client.ts:288](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L288)

Create a low-level [Watch](#watch) subscription to a Convex query.

Prefer the [useQuery](#usequery) composable for component code. Use
`watchQuery` directly when you need fine-grained control over subscription
lifecycle — e.g. in tests or outside a component setup context.

###### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| ...`argsAndOptions` | [`ArgsAndOptions`](#argsandoptions)\<`Query`, [`WatchQueryOptions`](#watchqueryoptions)\> |

###### Returns

[`Watch`](#watch)\<[`FunctionReturnType`](#functionreturntype)\<`Query`\>\>

##### mutation()

```ts
mutation<Mutation>(mutation, ...argsAndOptions): Promise<FunctionReturnType<Mutation>>;
```

Defined in: [src/runtime/vue/client.ts:388](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L388)

Run a Convex mutation function.

Returns a Promise that resolves to the mutation's return value once the
write has been committed on the server. Accepts an optional
`optimisticUpdate` to apply locally before the round-trip completes.

###### Type Parameters

| Type Parameter |
| ------ |
| `Mutation` *extends* [`FunctionReference`](#functionreference)\<`"mutation"`\> |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mutation` | `Mutation` |
| ...`argsAndOptions` | [`ArgsAndOptions`](#argsandoptions)\<`Mutation`, [`VueMutationOptions`](#vuemutationoptions)\<[`FunctionArgs`](#functionargs)\<`Mutation`\>\>\> |

###### Returns

`Promise`\<[`FunctionReturnType`](#functionreturntype)\<`Mutation`\>\>

##### action()

```ts
action<Action>(action, ...args): Promise<FunctionReturnType<Action>>;
```

Defined in: [src/runtime/vue/client.ts:407](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L407)

Run a Convex action function.

Actions run on the Convex backend and can call third-party services or
perform work that goes beyond what mutations allow. Returns a Promise of
the action's return value.

###### Type Parameters

| Type Parameter |
| ------ |
| `Action` *extends* [`FunctionReference`](#functionreference)\<`"action"`\> |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `action` | `Action` |
| ...`args` | [`OptionalRestArgs`](#optionalrestargs)\<`Action`\> |

###### Returns

`Promise`\<[`FunctionReturnType`](#functionreturntype)\<`Action`\>\>

##### query()

```ts
query<Query>(query, ...args): Promise<FunctionReturnType<Query>>;
```

Defined in: [src/runtime/vue/client.ts:422](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L422)

Fetch a query result once as a Promise.

Resolves immediately if a local result is already cached, otherwise waits
for the next update. Prefer [useQuery](#usequery) in component code where
live reactivity is needed.

###### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| ...`args` | [`OptionalRestArgs`](#optionalrestargs)\<`Query`\> |

###### Returns

`Promise`\<[`FunctionReturnType`](#functionreturntype)\<`Query`\>\>

##### connectionState()

```ts
connectionState(): ConnectionState;
```

Defined in: [src/runtime/vue/client.ts:450](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L450)

Return the current WebSocket connection state.

For a reactive version inside components, use
[useConvexConnectionState](#useconvexconnectionstate).

###### Returns

[`ConnectionState`](#connectionstate)

##### subscribeToConnectionState()

```ts
subscribeToConnectionState(cb): () => void;
```

Defined in: [src/runtime/vue/client.ts:460](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L460)

Register a callback invoked whenever the WebSocket connection state changes.

Returns an unsubscribe function. In components, prefer
[useConvexConnectionState](#useconvexconnectionstate) which handles cleanup automatically.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `cb` | (`connectionState`) => `void` |

###### Returns

() => `void`

##### prewarmQuery()

```ts
prewarmQuery<Query>(queryOptions): void;
```

Defined in: [src/runtime/vue/client.ts:490](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L490)

Subscribe to a query briefly to warm the local cache.

Useful for prefetching data before navigating to a new route. The
subscription is automatically cancelled after `extendSubscriptionFor`
milliseconds (default 5 000 ms).

###### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `queryOptions` | [`QueryOptions`](#queryoptions)\<`Query`\> & \{ `extendSubscriptionFor?`: `number`; \} |

###### Returns

`void`

###### Example

```ts
// Prefetch on hover before the user navigates
convex.prewarmQuery({ query: api.tasks.list, args: {} })
```

##### close()

```ts
close(): Promise<void>;
```

Defined in: [src/runtime/vue/client.ts:505](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L505)

Close the WebSocket and cancel all active subscriptions.

Should be called when the client is no longer needed (e.g. during plugin
teardown). The client cannot be reused after this call.

###### Returns

`Promise`\<`void`\>

## Interfaces

### ConvexAuthState

Defined in: [src/runtime/vue/auth/index.ts:10](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L10)

Reactive auth state provided by [provideConvexAuth](#provideconvexauth).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="isloading"></a> `isLoading` | `boolean` | [src/runtime/vue/auth/index.ts:11](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L11) |
| <a id="isauthenticated"></a> `isAuthenticated` | `boolean` | [src/runtime/vue/auth/index.ts:12](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L12) |

***

### ConvexAuthProviderOptions

Defined in: [src/runtime/vue/auth/index.ts:42](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L42)

Options for [provideConvexAuth](#provideconvexauth).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="client"></a> `client` | [`ConvexVueClient`](#convexvueclient) | [src/runtime/vue/auth/index.ts:43](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L43) |
| <a id="useauth"></a> `useAuth` | () => \{ `isLoading`: `MaybeRefOrGetter`\<`boolean`\>; `isAuthenticated`: `MaybeRefOrGetter`\<`boolean`\>; `fetchAccessToken`: [`AuthTokenFetcher`](#authtokenfetcher); `authVersion?`: `unknown`; \} | [src/runtime/vue/auth/index.ts:44](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L44) |

***

### UseAuthService

Defined in: [src/runtime/vue/auth/use-auth.ts:35](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L35)

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="client-1"></a> `client` | [`AuthClient`](#authclient) | - | [src/runtime/vue/auth/use-auth.ts:36](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L36) |
| <a id="session"></a> `session` | [`AuthSession`](#authsession) | - | [src/runtime/vue/auth/use-auth.ts:37](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L37) |
| <a id="user"></a> `user` | `ComputedRef`\<`AuthUser` \| `null`\> | The current user, or `null` when signed out / still loading. | [src/runtime/vue/auth/use-auth.ts:39](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L39) |
| <a id="isauthenticated-1"></a> `isAuthenticated` | `ComputedRef`\<`boolean`\> | - | [src/runtime/vue/auth/use-auth.ts:40](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L40) |
| <a id="isloading-1"></a> `isLoading` | `ComputedRef`\<`boolean`\> | - | [src/runtime/vue/auth/use-auth.ts:41](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L41) |
| <a id="fetchaccesstoken"></a> `fetchAccessToken` | [`AuthTokenFetcher`](#authtokenfetcher) | - | [src/runtime/vue/auth/use-auth.ts:42](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L42) |
| <a id="authversion"></a> `authVersion` | `ComputedRef`\<`string` \| `null`\> | - | [src/runtime/vue/auth/use-auth.ts:43](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L43) |
| <a id="signout"></a> `signOut` | () => `Promise`\<`unknown`\> | Sign the current user out. | [src/runtime/vue/auth/use-auth.ts:45](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L45) |
| <a id="sendotp"></a> `sendOtp` | (`email`, `type?`) => `Promise`\<`unknown`\> | Send a sign-in / verification OTP code to an email. | [src/runtime/vue/auth/use-auth.ts:47](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L47) |
| <a id="signinwithotp"></a> `signInWithOtp` | (`args`) => `Promise`\<`unknown`\> | Complete sign-in (or passwordless sign-up) with an emailed OTP code. | [src/runtime/vue/auth/use-auth.ts:49](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L49) |
| <a id="signinwithpasskey"></a> `signInWithPasskey` | () => `Promise`\<`unknown`\> | Sign in with a passkey (WebAuthn). | [src/runtime/vue/auth/use-auth.ts:51](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L51) |
| <a id="registerpasskey"></a> `registerPasskey` | (`context?`) => `Promise`\<`unknown`\> | Register a passkey — pass `{ email, name }` (JSON) for pre-auth registration. | [src/runtime/vue/auth/use-auth.ts:53](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L53) |
| <a id="changeemail"></a> `changeEmail` | (`newEmail`, `callbackURL?`) => `Promise`\<`unknown`\> | Change the account email (confirmed via email). | [src/runtime/vue/auth/use-auth.ts:55](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L55) |
| <a id="deleteaccount"></a> `deleteAccount` | () => `Promise`\<`unknown`\> | Delete the account (confirmed via email). | [src/runtime/vue/auth/use-auth.ts:57](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L57) |

***

### Watch

Defined in: [src/runtime/vue/client.ts:41](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L41)

A live subscription to the output of a Convex query function.

Returned by [ConvexVueClient.watchQuery](#watchquery). Most component code should
use the [useQuery](#usequery) composable instead.

Shape is derived from `convex/react` for API parity (see React client.ts).
We extend to include internal `localQueryLogs` (present at runtime and in
Convex source, omitted from some public .d.ts builds).

#### Extends

- `Watch`\<`T`\>

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Methods

##### onUpdate()

```ts
onUpdate(callback): () => void;
```

Defined in: node\_modules/convex/dist/esm-types/react/client.d.ts:83

Initiate a watch on the output of a query.

This will subscribe to this query and call
the callback whenever the query result changes.

**Important: If the client is already subscribed to this query with the
same arguments this callback will not be invoked until the query result is
updated.** To get the current, local result call
react.Watch.localQueryResult.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `callback` | () => `void` | Function that is called whenever the query result changes. |

###### Returns

- A function that disposes of the subscription.

() => `void`

###### Inherited from

```ts
ConvexWatch.onUpdate
```

##### localQueryResult()

```ts
localQueryResult(): T | undefined;
```

Defined in: node\_modules/convex/dist/esm-types/react/client.d.ts:94

Get the current result of a query.

This will only return a result if we're already subscribed to the query
and have received a result from the server or the query value has been set
optimistically.

###### Returns

`T` \| `undefined`

The result of the query or `undefined` if it isn't known.

###### Throws

An error if the query encountered an error on the server.

###### Inherited from

```ts
ConvexWatch.localQueryResult
```

##### journal()

```ts
journal(): QueryJournal | undefined;
```

Defined in: node\_modules/convex/dist/esm-types/react/client.d.ts:100

Get the current browser.QueryJournal for this query.

If we have not yet received a result for this query, this will be `undefined`.

###### Returns

[`QueryJournal`](#queryjournal) \| `undefined`

###### Inherited from

```ts
ConvexWatch.journal
```

***

### PaginatedWatch

Defined in: [src/runtime/vue/client.ts:51](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L51)

A watch on the output of a paginated Convex query function.

#### Type Parameters

| Type Parameter |
| ------ |
| `T` |

#### Methods

##### onUpdate()

```ts
onUpdate(callback): () => void;
```

Defined in: [src/runtime/vue/client.ts:52](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L52)

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `callback` | () => `void` |

###### Returns

() => `void`

##### localQueryResult()

```ts
localQueryResult(): 
  | {
  results: T[];
  status: PaginationStatus;
  loadMore: (numItems) => boolean;
}
  | undefined;
```

Defined in: [src/runtime/vue/client.ts:53](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L53)

###### Returns

  \| \{
  `results`: `T`[];
  `status`: `PaginationStatus`;
  `loadMore`: (`numItems`) => `boolean`;
\}
  \| `undefined`

***

### WatchQueryOptions

Defined in: [src/runtime/vue/client.ts:70](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L70)

Options for [ConvexVueClient.watchQuery](#watchquery).

Pass a `journal` to resume a previously-saved query journal for faster
initial hydration.

#### Extends

- `SubscribeOptions`

#### Properties

| Property | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ |
| <a id="journal-1"></a> `journal?` | [`QueryJournal`](#queryjournal) | An (optional) journal produced from a previous execution of this query function. If there is an existing subscription to a query function with the same name and arguments, this journal will have no effect. | `SubscribeOptions.journal` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:142 |

***

### ConvexVueClientOptions

Defined in: [src/runtime/vue/client.ts:99](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L99)

Construction options for [ConvexVueClient](#convexvueclient).

All options from `BaseConvexClientOptions` are accepted, such as
`webSocketConstructor` (needed for testing in Node.js environments).

#### Extends

- `BaseConvexClientOptions`

#### Properties

| Property | Modifier | Type | Description | Inherited from | Defined in |
| ------ | ------ | ------ | ------ | ------ | ------ |
| <a id="unsavedchangeswarning"></a> `unsavedChangesWarning?` | `public` | `boolean` | Whether to prompt the user if they have unsaved changes pending when navigating away or closing a web page. This is only possible when the `window` object exists, i.e. in a browser. The default value is `true` in browsers. | `BaseConvexClientOptions.unsavedChangesWarning` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:23 |
| <a id="websocketconstructor"></a> `webSocketConstructor?` | `public` | \{ (`url`, `protocols?`): `WebSocket`; `prototype`: `WebSocket`; `CONNECTING`: `0`; `OPEN`: `1`; `CLOSING`: `2`; `CLOSED`: `3`; \} | Specifies an alternate [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) constructor to use for client communication with the Convex cloud. The default behavior is to use `WebSocket` from the global environment. | `BaseConvexClientOptions.webSocketConstructor` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:30 |
| `webSocketConstructor.prototype` | `public` | `WebSocket` | - | - | node\_modules/typescript/lib/lib.dom.d.ts:40936 |
| `webSocketConstructor.CONNECTING` | `readonly` | `0` | - | - | node\_modules/typescript/lib/lib.dom.d.ts:40938 |
| `webSocketConstructor.OPEN` | `readonly` | `1` | - | - | node\_modules/typescript/lib/lib.dom.d.ts:40939 |
| `webSocketConstructor.CLOSING` | `readonly` | `2` | - | - | node\_modules/typescript/lib/lib.dom.d.ts:40940 |
| `webSocketConstructor.CLOSED` | `readonly` | `3` | - | - | node\_modules/typescript/lib/lib.dom.d.ts:40941 |
| <a id="verbose"></a> `verbose?` | `public` | `boolean` | Adds additional logging for debugging purposes. The default value is `false`. | `BaseConvexClientOptions.verbose` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:36 |
| <a id="logger"></a> `logger?` | `public` | `boolean` \| `Logger` | A logger, `true`, or `false`. If not provided or `true`, logs to the console. If `false`, logs are not printed anywhere. You can construct your own logger to customize logging to log elsewhere. A logger is an object with 4 methods: log(), warn(), error(), and logVerbose(). These methods can receive multiple arguments of any types, like console.log(). | `BaseConvexClientOptions.logger` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:45 |
| <a id="reportdebuginfotoconvex"></a> `reportDebugInfoToConvex?` | `public` | `boolean` | Sends additional metrics to Convex for debugging purposes. The default value is `false`. | `BaseConvexClientOptions.reportDebugInfoToConvex` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:51 |
| <a id="onserverdisconnecterror"></a> `onServerDisconnectError?` | `public` | (`message`) => `void` | This API is experimental: it may change or disappear. A function to call on receiving abnormal WebSocket close messages from the connected Convex deployment. The content of these messages is not stable, it is an implementation detail that may change. Consider this API an observability stopgap until higher level codes with recommendations on what to do are available, which could be a more stable interface instead of `string`. Check `connectionState` for more quantitative metrics about connection status. | `BaseConvexClientOptions.onServerDisconnectError` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:65 |
| <a id="skipconvexdeploymenturlcheck"></a> `skipConvexDeploymentUrlCheck?` | `public` | `boolean` | Skip validating that the Convex deployment URL looks like `https://happy-animal-123.convex.cloud` or localhost. This can be useful if running a self-hosted Convex backend that uses a different URL. The default value is `false` | `BaseConvexClientOptions.skipConvexDeploymentUrlCheck` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:75 |
| <a id="authrefreshtokenleewayseconds"></a> `authRefreshTokenLeewaySeconds?` | `public` | `number` | If using auth, the number of seconds before a token expires that we should refresh it. The default value is `10`. | `BaseConvexClientOptions.authRefreshTokenLeewaySeconds` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:81 |
| <a id="expectauth"></a> `expectAuth?` | `public` | `boolean` | This API is experimental: it may change or disappear. Whether query, mutation, and action requests should be held back until the first auth token can be sent. Opting into this behavior works well for pages that should only be viewed by authenticated clients. Defaults to false, not waiting for an auth token. | `BaseConvexClientOptions.expectAuth` | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:93 |

***

### VueAction()

Defined in: [src/runtime/vue/composables/use-action.ts:10](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-action.ts#L10)

An interface to execute a Convex action on the server.

#### Type Parameters

| Type Parameter |
| ------ |
| `Action` *extends* [`FunctionReference`](#functionreference)\<`"action"`\> |

```ts
VueAction(...args): Promise<FunctionReturnType<Action>>;
```

Defined in: [src/runtime/vue/composables/use-action.ts:12](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-action.ts#L12)

Execute the action, returning a Promise of its return value.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | [`OptionalRestArgs`](#optionalrestargs)\<`Action`\> |

#### Returns

`Promise`\<[`FunctionReturnType`](#functionreturntype)\<`Action`\>\>

***

### VueMutation()

Defined in: [src/runtime/vue/composables/use-mutation.ts:51](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-mutation.ts#L51)

A callable object that runs a Convex mutation and optionally applies an
optimistic update before the server response arrives.

Returned by [useMutation](#usemutation) and createMutation.

#### Type Parameters

| Type Parameter |
| ------ |
| `Mutation` *extends* [`FunctionReference`](#functionreference)\<`"mutation"`\> |

```ts
VueMutation(...args): Promise<FunctionReturnType<Mutation>>;
```

Defined in: [src/runtime/vue/composables/use-mutation.ts:53](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-mutation.ts#L53)

Execute the mutation, returning a Promise of its return value.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | [`OptionalRestArgs`](#optionalrestargs)\<`Mutation`\> |

#### Returns

`Promise`\<[`FunctionReturnType`](#functionreturntype)\<`Mutation`\>\>

#### Methods

##### withOptimisticUpdate()

```ts
withOptimisticUpdate(optimisticUpdate): VueMutation<Mutation>;
```

Defined in: [src/runtime/vue/composables/use-mutation.ts:59](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-mutation.ts#L59)

Define an optimistic update to apply as part of this mutation.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `optimisticUpdate` | [`OptimisticUpdate`](#optimisticupdate)\<[`FunctionArgs`](#functionargs)\<`Mutation`\>\> |

###### Returns

[`VueMutation`](#vuemutation)\<`Mutation`\>

A new `VueMutation` with the update configured.

***

### UploadQueueItem

Defined in: [src/runtime/vue/composables/use-upload-queue.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L17)

A single entry in the queue managed by [useUploadQueue](#useuploadqueue).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | Stable id for this queue entry (not the storage id). | [src/runtime/vue/composables/use-upload-queue.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L19) |
| <a id="file"></a> `file` | `Blob` | The file or blob being uploaded. | [src/runtime/vue/composables/use-upload-queue.ts:21](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L21) |
| <a id="status"></a> `status` | [`UploadItemStatus`](#uploaditemstatus) | Current upload status. | [src/runtime/vue/composables/use-upload-queue.ts:23](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L23) |
| <a id="progress"></a> `progress` | `number` | Upload progress for this item, from `0` to `1`. | [src/runtime/vue/composables/use-upload-queue.ts:25](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L25) |
| <a id="storageid"></a> `storageId` | [`StorageId`](#storageid-1) \| `null` | The storage id once the upload succeeds, or `null`. | [src/runtime/vue/composables/use-upload-queue.ts:27](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L27) |
| <a id="error"></a> `error` | `Error` \| `null` | The error if this item failed, or `null`. | [src/runtime/vue/composables/use-upload-queue.ts:29](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L29) |

***

### UseUploadQueueOptions

Defined in: [src/runtime/vue/composables/use-upload-queue.ts:37](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L37)

Options for [useUploadQueue](#useuploadqueue).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="concurrency"></a> `concurrency?` | `number` | Maximum number of uploads to run at once. Defaults to `3`. | [src/runtime/vue/composables/use-upload-queue.ts:39](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L39) |
| <a id="onitemsuccess"></a> `onItemSuccess?` | (`storageId`, `item`) => `void` \| `Promise`\<`void`\> | Called when an individual item finishes uploading. | [src/runtime/vue/composables/use-upload-queue.ts:41](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L41) |
| <a id="onitemerror"></a> `onItemError?` | (`error`, `item`) => `void` | Called when an individual item fails. | [src/runtime/vue/composables/use-upload-queue.ts:43](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L43) |
| <a id="oncomplete"></a> `onComplete?` | (`items`) => `void` | Called once every queued item has settled (succeeded or failed). | [src/runtime/vue/composables/use-upload-queue.ts:45](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L45) |

***

### VueUploadQueue

Defined in: [src/runtime/vue/composables/use-upload-queue.ts:56](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L56)

The reactive queue returned by [useUploadQueue](#useuploadqueue).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="items"></a> `items` | `Readonly`\<`Ref`\<[`UploadQueueItem`](#uploadqueueitem)[]\>\> | Reactive list of queued items, in insertion order. | [src/runtime/vue/composables/use-upload-queue.ts:58](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L58) |
| <a id="enqueue"></a> `enqueue` | (`files`) => `void` | Add one or more files to the queue; uploading starts automatically. | [src/runtime/vue/composables/use-upload-queue.ts:60](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L60) |
| <a id="isuploading"></a> `isUploading` | `Readonly`\<`Ref`\<`boolean`\>\> | `true` while any item is pending or uploading. | [src/runtime/vue/composables/use-upload-queue.ts:62](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L62) |
| <a id="progress-1"></a> `progress` | `Readonly`\<`Ref`\<`number`\>\> | Aggregate progress across all items, from `0` to `1`. | [src/runtime/vue/composables/use-upload-queue.ts:64](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L64) |
| <a id="pendingcount"></a> `pendingCount` | `Readonly`\<`Ref`\<`number`\>\> | Number of items waiting to start. | [src/runtime/vue/composables/use-upload-queue.ts:66](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L66) |
| <a id="activecount"></a> `activeCount` | `Readonly`\<`Ref`\<`number`\>\> | Number of items currently uploading. | [src/runtime/vue/composables/use-upload-queue.ts:68](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L68) |
| <a id="cancel"></a> `cancel` | () => `void` | Abort all in-flight uploads (queued items stay `pending`). | [src/runtime/vue/composables/use-upload-queue.ts:70](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L70) |
| <a id="remove"></a> `remove` | (`id`) => `void` | Remove an item by id, aborting it first if it is uploading. | [src/runtime/vue/composables/use-upload-queue.ts:72](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L72) |
| <a id="clear"></a> `clear` | () => `void` | Abort everything and empty the queue. | [src/runtime/vue/composables/use-upload-queue.ts:74](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L74) |

***

### UploadFileOptions

Defined in: [src/runtime/vue/composables/use-upload.ts:32](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L32)

Options for the low-level [uploadFile](#uploadfile) helper.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="url-1"></a> `url` | `string` | The one-time Convex upload URL from a `generateUploadUrl` mutation. | [src/runtime/vue/composables/use-upload.ts:34](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L34) |
| <a id="file-1"></a> `file` | `Blob` | The file or blob to upload. | [src/runtime/vue/composables/use-upload.ts:36](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L36) |
| <a id="onprogress"></a> `onProgress?` | (`progress`) => `void` | Receives upload progress as a fraction from `0` to `1`. | [src/runtime/vue/composables/use-upload.ts:38](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L38) |
| <a id="signal"></a> `signal?` | `AbortSignal` | Abort signal to cancel the in-flight upload. | [src/runtime/vue/composables/use-upload.ts:40](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L40) |

***

### UseUploadOptions

Defined in: [src/runtime/vue/composables/use-upload.ts:125](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L125)

Options for [useUpload](#useupload).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="onprogress-1"></a> `onProgress?` | (`progress`) => `void` | Called with upload progress as a fraction from `0` to `1`. | [src/runtime/vue/composables/use-upload.ts:127](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L127) |
| <a id="onsuccess"></a> `onSuccess?` | (`storageId`, `file`) => `void` \| `Promise`\<`void`\> | Called once the file is stored, with the new storage id and the file. | [src/runtime/vue/composables/use-upload.ts:129](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L129) |
| <a id="onerror"></a> `onError?` | (`error`, `file`) => `void` | Called if generating the upload URL or the upload itself fails. | [src/runtime/vue/composables/use-upload.ts:131](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L131) |

***

### VueUpload

Defined in: [src/runtime/vue/composables/use-upload.ts:139](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L139)

The reactive uploader returned by [useUpload](#useupload).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="upload"></a> `upload` | (`file`) => `Promise`\<[`StorageId`](#storageid-1) \| `null`\> | Upload a file or blob, resolving to its [StorageId](#storageid-1). Resolves to `null` (instead of throwing) if the upload fails or is called outside the browser — inspect [VueUpload.error](#error-1) for the reason. | [src/runtime/vue/composables/use-upload.ts:146](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L146) |
| <a id="isuploading-1"></a> `isUploading` | `Readonly`\<`Ref`\<`boolean`\>\> | `true` while an upload is in flight. | [src/runtime/vue/composables/use-upload.ts:148](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L148) |
| <a id="progress-2"></a> `progress` | `Readonly`\<`Ref`\<`number`\>\> | Upload progress of the current/last upload, from `0` to `1`. | [src/runtime/vue/composables/use-upload.ts:150](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L150) |
| <a id="error-1"></a> `error` | `Readonly`\<`Ref`\<`Error` \| `null`\>\> | The error from the most recent failed upload, or `null`. | [src/runtime/vue/composables/use-upload.ts:152](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L152) |
| <a id="storageid-2"></a> `storageId` | `Readonly`\<`Ref`\<[`StorageId`](#storageid-1) \| `null`\>\> | The storage id from the most recent successful upload, or `null`. | [src/runtime/vue/composables/use-upload.ts:154](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L154) |
| <a id="cancel-1"></a> `cancel` | () => `void` | Abort the in-flight upload, if any. | [src/runtime/vue/composables/use-upload.ts:156](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L156) |
| <a id="reset"></a> `reset` | () => `void` | Reset `progress`, `error`, and `storageId` back to their initial values. | [src/runtime/vue/composables/use-upload.ts:158](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L158) |

## Type Aliases

### QueryOptions

```ts
type QueryOptions<Query> = {
  query: Query;
  args: FunctionArgs<Query>;
};
```

Defined in: node\_modules/convex/dist/esm-types/browser/query\_options.d.ts:9

Options for a Convex query: the query function reference and its arguments.

Used with the object-form overload of [useQuery](#usequery).

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="query-1"></a> `query` | `Query` | The query function to run. | node\_modules/convex/dist/esm-types/browser/query\_options.d.ts:13 |
| <a id="args"></a> `args` | [`FunctionArgs`](#functionargs)\<`Query`\> | The arguments to the query function. | node\_modules/convex/dist/esm-types/browser/query\_options.d.ts:17 |

***

### AuthTokenFetcher

```ts
type AuthTokenFetcher = (args) => Promise<string | null | undefined>;
```

Defined in: node\_modules/convex/dist/esm-types/browser/sync/authentication\_manager.d.ts:17

An async function returning a JWT. Depending on the auth providers
configured in convex/auth.config.ts, this may be a JWT-encoded OpenID
Connect Identity Token or a traditional JWT.

`forceRefreshToken` is `true` if the server rejected a previously
returned token or the token is anticipated to expiring soon
based on its `exp` time.

See ConvexReactClient.setAuth.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | \{ `forceRefreshToken`: `boolean`; \} |
| `args.forceRefreshToken` | `boolean` |

#### Returns

`Promise`\<`string` \| `null` \| `undefined`\>

***

### ConnectionState

```ts
type ConnectionState = {
  hasInflightRequests: boolean;
  isWebSocketConnected: boolean;
  timeOfOldestInflightRequest: Date | null;
  hasEverConnected: boolean;
  connectionCount: number;
  connectionRetries: number;
  inflightMutations: number;
  inflightActions: number;
};
```

Defined in: node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:100

State describing the client's connection with the Convex backend.

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="hasinflightrequests"></a> `hasInflightRequests` | `boolean` | - | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:101 |
| <a id="iswebsocketconnected"></a> `isWebSocketConnected` | `boolean` | - | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:102 |
| <a id="timeofoldestinflightrequest"></a> `timeOfOldestInflightRequest` | `Date` \| `null` | - | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:103 |
| <a id="haseverconnected"></a> `hasEverConnected` | `boolean` | True if the client has ever opened a WebSocket to the "ready" state. | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:107 |
| <a id="connectioncount"></a> `connectionCount` | `number` | The number of times this client has connected to the Convex backend. A number of things can cause the client to reconnect -- server errors, bad internet, auth expiring. But this number being high is an indication that the client is having trouble keeping a stable connection. | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:115 |
| <a id="connectionretries"></a> `connectionRetries` | `number` | The number of times this client has tried (and failed) to connect to the Convex backend. | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:119 |
| <a id="inflightmutations"></a> `inflightMutations` | `number` | The number of mutations currently in flight. | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:123 |
| <a id="inflightactions"></a> `inflightActions` | `number` | The number of actions currently in flight. | node\_modules/convex/dist/esm-types/browser/sync/client.d.ts:127 |

***

### OptimisticUpdate

```ts
type OptimisticUpdate<Args> = (localQueryStore, args) => void;
```

Defined in: node\_modules/convex/dist/esm-types/browser/sync/optimistic\_updates.d.ts:73

A temporary, local update to query results within this client.

This update will always be executed when a mutation is synced to the Convex
server and rolled back when the mutation completes.

Note that optimistic updates can be called multiple times! If the client
loads new data while the mutation is in progress, the update will be replayed
again.

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `Record`\<`string`, [`Value`](#value)\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `localQueryStore` | `OptimisticLocalStore` | An interface to read and edit local query results. |
| `args` | `Args` | The arguments to the mutation. |

#### Returns

`void`

***

### QueryJournal

```ts
type QueryJournal = string | null;
```

Defined in: node\_modules/convex/dist/esm-types/browser/sync/protocol.d.ts:34

A serialized representation of decisions made during a query's execution.

A journal is produced when a query function first executes and is re-used
when a query is re-executed.

Currently this is used to store pagination end cursors to ensure
that pages of paginated queries will always end at the same cursor. This
enables gapless, reactive pagination.

`null` is used to represent empty journals.

***

### PaginatedQueryReference

```ts
type PaginatedQueryReference = FunctionReference<"query", "public", {
  paginationOpts: PaginationOptions;
}, PaginationResult<any>>;
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:16

A server.FunctionReference that is usable with [usePaginatedQuery](#usepaginatedquery).

This function reference must:
- Refer to a public query
- Have an argument named "paginationOpts" of type server.PaginationOptions
- Have a return type of server.PaginationResult.

***

### UsePaginatedQueryResult

```ts
type UsePaginatedQueryResult<Item> = {
  results: Item[];
  loadMore: (numItems) => void;
} & 
  | {
  status: "LoadingFirstPage";
  isLoading: true;
}
  | {
  status: "CanLoadMore";
  isLoading: false;
}
  | {
  status: "LoadingMore";
  isLoading: true;
}
  | {
  status: "Exhausted";
  isLoading: false;
};
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:80

The result of calling the [usePaginatedQuery](#usepaginatedquery) hook.

This includes:
- `results` - An array of the currently loaded results.
- `isLoading` - Whether the hook is currently loading results.
- `status` - The status of the pagination. The possible statuses are:
  - "LoadingFirstPage": The hook is loading the first page of results.
  - "CanLoadMore": This query may have more items to fetch. Call `loadMore` to
  fetch another page.
  - "LoadingMore": We're currently loading another page of results.
  - "Exhausted": We've paginated to the end of the list.
- `loadMore(n)` A callback to fetch more results. This will only fetch more
results if the status is "CanLoadMore".

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `results` | `Item`[] | node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:81 |
| `loadMore()` | (`numItems`) => `void` | node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:82 |

#### Type Parameters

| Type Parameter |
| ------ |
| `Item` |

***

### PaginationStatus

```ts
type PaginationStatus = UsePaginatedQueryResult<any>["status"];
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:102

The possible pagination statuses in [UsePaginatedQueryResult](#usepaginatedqueryresult).

This is a union of string literal types.

***

### PaginatedQueryArgs

```ts
type PaginatedQueryArgs<Query> = Expand<BetterOmit<FunctionArgs<Query>, "paginationOpts">>;
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:109

Given a [PaginatedQueryReference](#paginatedqueryreference), get the type of the arguments
object for the query, excluding the `paginationOpts` argument.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

***

### PaginatedQueryItem

```ts
type PaginatedQueryItem<Query> = FunctionReturnType<Query>["page"][number];
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:115

Given a [PaginatedQueryReference](#paginatedqueryreference), get the type of the item being
paginated over.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

***

### UsePaginatedQueryReturnType

```ts
type UsePaginatedQueryReturnType<Query> = UsePaginatedQueryResult<PaginatedQueryItem<Query>>;
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query.d.ts:121

The return type of [usePaginatedQuery](#usepaginatedquery).

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

***

### UsePaginatedQueryOptions

```ts
type UsePaginatedQueryOptions<Query, ThrowOnError> = {
  query: Query;
  args: PaginatedQueryArgs<Query> | "skip";
  initialNumItems: number;
  throwOnError?: ThrowOnError;
};
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query2.d.ts:7

Options for object-form [usePaginatedQuery\_experimental](#usepaginatedquery_experimental).

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) | - |
| `ThrowOnError` *extends* `boolean` | `false` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="query-6"></a> `query` | `Query` | - | node\_modules/convex/dist/esm-types/react/use\_paginated\_query2.d.ts:8 |
| <a id="args-2"></a> `args` | [`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\> \| `"skip"` | - | node\_modules/convex/dist/esm-types/react/use\_paginated\_query2.d.ts:9 |
| <a id="initialnumitems"></a> `initialNumItems` | `number` | - | node\_modules/convex/dist/esm-types/react/use\_paginated\_query2.d.ts:10 |
| <a id="throwonerror-1"></a> `throwOnError?` | `ThrowOnError` | When `true` (default for positional form), errors are thrown and caught by an error boundary. When `false` (default for object form), errors are returned as `{ status: "Error", error: Error }` instead of being thrown. | node\_modules/convex/dist/esm-types/react/use\_paginated\_query2.d.ts:16 |

***

### UsePaginatedQueryObjectReturnType

```ts
type UsePaginatedQueryObjectReturnType<Query, ThrowOnError> = 
  | {
  data: PaginatedQueryItem<Query>[] | undefined;
  status: "pending";
  canLoadMore: false;
  isLoading: true;
  error: undefined;
  loadMore: (numItems) => void;
}
  | {
  data: PaginatedQueryItem<Query>[];
  status: "success";
  canLoadMore: boolean;
  isLoading: false;
  error: undefined;
  loadMore: (numItems) => void;
}
  | ThrowOnError extends true ? never : {
  data: PaginatedQueryItem<Query>[];
  status: "error";
  canLoadMore: false;
  isLoading: false;
  error: Error;
  loadMore: (numItems) => void;
};
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_paginated\_query2.d.ts:27

Return type of the object-form [usePaginatedQuery\_experimental](#usepaginatedquery_experimental) overload.

Uses lowercase query status (`"pending" | "success" | "error"`) and a
`canLoadMore` boolean instead of the TitleCase pagination status strings
used by the positional form.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) | - |
| `ThrowOnError` *extends* `boolean` | `false` |

***

### RequestForQueries

```ts
type RequestForQueries = Record<string, {
  query: FunctionReference<"query">;
  args: Record<string, Value>;
}>;
```

Defined in: node\_modules/convex/dist/esm-types/react/use\_queries.d.ts:69

An object representing a request to load multiple queries.

The keys of this object are identifiers and the values are objects containing
the query function and the arguments to pass to it.

This is used as an argument to [useQueries](#usequeries).

***

### FunctionReference

```ts
type FunctionReference<Type, Visibility, Args, ReturnType, ComponentPath> = {
  _type: Type;
  _visibility: Visibility;
  _args: Args;
  _returnType: ReturnType;
  _componentPath: ComponentPath;
};
```

Defined in: node\_modules/convex/dist/esm-types/server/api.d.ts:41

A reference to a registered Convex function.

You can create a [FunctionReference](#functionreference) using the generated `api` utility:
```js
import { api } from "../convex/_generated/api";

const reference = api.myModule.myFunction;
```

If you aren't using code generation, you can create references using
anyApi:
```js
import { anyApi } from "convex/server";

const reference = anyApi.myModule.myFunction;
```

Function references can be used to invoke functions from the client. For
example, in React you can pass references to the react.useQuery hook:
```js
const result = useQuery(api.myModule.myFunction);
```

#### Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| `Type` *extends* `FunctionType` | - | The type of the function ("query", "mutation", or "action"). |
| `Visibility` *extends* `FunctionVisibility` | `"public"` | The visibility of the function ("public" or "internal"). |
| `Args` *extends* `DefaultFunctionArgs` | `any` | The arguments to this function. This is an object mapping argument names to their types. |
| `ReturnType` | `any` | The return type of this function. |
| `ComponentPath` | `string` \| `undefined` | - |

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="_type"></a> `_type` | `Type` | node\_modules/convex/dist/esm-types/server/api.d.ts:42 |
| <a id="_visibility"></a> `_visibility` | `Visibility` | node\_modules/convex/dist/esm-types/server/api.d.ts:43 |
| <a id="_args"></a> `_args` | `Args` | node\_modules/convex/dist/esm-types/server/api.d.ts:44 |
| <a id="_returntype"></a> `_returnType` | `ReturnType` | node\_modules/convex/dist/esm-types/server/api.d.ts:45 |
| <a id="_componentpath"></a> `_componentPath` | `ComponentPath` | node\_modules/convex/dist/esm-types/server/api.d.ts:46 |

***

### FunctionArgs

```ts
type FunctionArgs<FuncRef> = FuncRef["_args"];
```

Defined in: node\_modules/convex/dist/esm-types/server/api.d.ts:213

Given a [FunctionReference](#functionreference), get the return type of the function.

This is represented as an object mapping argument names to values.

#### Type Parameters

| Type Parameter |
| ------ |
| `FuncRef` *extends* `AnyFunctionReference` |

***

### OptionalRestArgs

```ts
type OptionalRestArgs<FuncRef> = FuncRef["_args"] extends EmptyObject ? [EmptyObject] : [FuncRef["_args"]];
```

Defined in: node\_modules/convex/dist/esm-types/server/api.d.ts:222

A tuple type of the (maybe optional) arguments to `FuncRef`.

This type is used to make methods involving arguments type safe while allowing
skipping the arguments for functions that don't require arguments.

#### Type Parameters

| Type Parameter |
| ------ |
| `FuncRef` *extends* `AnyFunctionReference` |

***

### ArgsAndOptions

```ts
type ArgsAndOptions<FuncRef, Options> = FuncRef["_args"] extends EmptyObject ? [EmptyObject, Options] : [FuncRef["_args"], Options];
```

Defined in: node\_modules/convex/dist/esm-types/server/api.d.ts:232

A tuple type of the (maybe optional) arguments to `FuncRef`, followed by an options
object of type `Options`.

This type is used to make methods like `useQuery` type-safe while allowing
1. Skipping arguments for functions that don't require arguments.
2. Skipping the options object.

#### Type Parameters

| Type Parameter |
| ------ |
| `FuncRef` *extends* `AnyFunctionReference` |
| `Options` |

***

### FunctionReturnType

```ts
type FunctionReturnType<FuncRef> = FuncRef["_returnType"];
```

Defined in: node\_modules/convex/dist/esm-types/server/api.d.ts:238

Given a [FunctionReference](#functionreference), get the return type of the function.

#### Type Parameters

| Type Parameter |
| ------ |
| `FuncRef` *extends* `AnyFunctionReference` |

***

### Value

```ts
type Value = 
  | null
  | bigint
  | number
  | boolean
  | string
  | ArrayBuffer
  | Value[]
  | {
[key: string]: Value | undefined;
};
```

Defined in: node\_modules/convex/dist/esm-types/values/value.d.ts:44

A value supported by Convex.

Values can be:
- stored inside of documents.
- used as arguments and return types to queries and mutation functions.

You can see the full set of supported types at
[Types](https://docs.convex.dev/using/types).

***

### AuthClient

```ts
type AuthClient = AuthClientWithPlugins<[ConvexPlugin, EmailOTPPlugin, PasskeyPlugin]>;
```

Defined in: [src/runtime/vue/auth/client.ts:13](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/client.ts#L13)

***

### AuthSession

```ts
type AuthSession = ReturnType<typeof useClientSession>;
```

Defined in: [src/runtime/vue/auth/use-auth.ts:30](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L30)

***

### VueMutationOptions

```ts
type VueMutationOptions<Args> = Omit<BaseMutationOptions, "optimisticUpdate"> & {
  optimisticUpdate?: OptimisticUpdate<Args>;
};
```

Defined in: [src/runtime/vue/client.ts:80](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L80)

Options passed to [ConvexVueClient.mutation](#mutation).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `optimisticUpdate?` | [`OptimisticUpdate`](#optimisticupdate)\<`Args`\> | [src/runtime/vue/client.ts:84](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L84) |

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `Record`\<`string`, [`Value`](#value)\> |

***

### OptionalRestArgsOrSkip

```ts
type OptionalRestArgsOrSkip<FuncRef> = FuncRef["_args"] extends Record<string, never> ? [MaybeRefOrGetter<Record<string, never> | "skip">] : [MaybeRefOrGetter<FuncRef["_args"] | "skip">];
```

Defined in: [src/runtime/vue/composables/use-query.ts:12](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-query.ts#L12)

#### Type Parameters

| Type Parameter |
| ------ |
| `FuncRef` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

***

### UseQueryResult

```ts
type UseQueryResult<QueryResult, ThrowOnError> = ConvexUseQueryResult<QueryResult, ThrowOnError>;
```

Defined in: [src/runtime/vue/composables/use-query.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-query.ts#L17)

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `QueryResult` | - |
| `ThrowOnError` *extends* `boolean` | `false` |

***

### GetStorageUrl

```ts
type GetStorageUrl = FunctionReference<"query", "public", {
  storageId: StorageId;
}, string | null>;
```

Defined in: [src/runtime/vue/composables/use-storage-url.ts:12](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-storage-url.ts#L12)

A `getUrl` query: takes `{ storageId }` and returns the file's served URL,
or `null` if the file no longer exists (`await ctx.storage.getUrl(id)`).

***

### UploadItemStatus

```ts
type UploadItemStatus = "pending" | "uploading" | "success" | "error";
```

Defined in: [src/runtime/vue/composables/use-upload-queue.ts:10](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L10)

Lifecycle status of a single item in an upload queue.

***

### GenerateUploadUrl

```ts
type GenerateUploadUrl = FunctionReference<"mutation", "public", Record<string, never>, string>;
```

Defined in: [src/runtime/vue/composables/use-upload.ts:12](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L12)

A `generateUploadUrl` mutation: takes no arguments and returns a one-time
Convex upload URL string (`await ctx.storage.generateUploadUrl()`).

***

### StorageId

```ts
type StorageId = GenericId<"_storage">;
```

Defined in: [src/runtime/vue/composables/use-upload.ts:25](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L25)

A Convex file storage id (`Id<'_storage'>`), branded so it is directly
assignable to mutation/query args validated with `v.id('_storage')`.

***

### Preloaded

```ts
type Preloaded<Query> = {
  __type: Query;
  _name: string;
  _argsJSON: string;
  _valueJSON: string;
};
```

Defined in: [src/runtime/vue/hydration.ts:13](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/hydration.ts#L13)

The preloaded query payload, which should be passed to a client component
and used with [usePreloadedQuery](#usepreloadedquery).

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="__type-10"></a> `__type` | `Query` | [src/runtime/vue/hydration.ts:14](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/hydration.ts#L14) |
| <a id="_name"></a> `_name` | `string` | [src/runtime/vue/hydration.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/hydration.ts#L15) |
| <a id="_argsjson"></a> `_argsJSON` | `string` | [src/runtime/vue/hydration.ts:16](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/hydration.ts#L16) |
| <a id="_valuejson"></a> `_valueJSON` | `string` | [src/runtime/vue/hydration.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/hydration.ts#L17) |

## Variables

### Authenticated

```ts
const Authenticated: DefineComponent<{
}, () => 
  | VNode<RendererNode, RendererElement, {
[key: string]: any;
}>[]
  | null, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
}, {
}>, {
}, SlotsType<{
  default: () => VNode<RendererNode, RendererElement, {
   [key: string]: any;
  }>[];
}>, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Defined in: [src/runtime/vue/auth/helpers.ts:16](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/helpers.ts#L16)

Renders slot content only if the client is authenticated.

#### Example

```vue
<Authenticated>
  <p>You are logged in!</p>
</Authenticated>
```

***

### Unauthenticated

```ts
const Unauthenticated: DefineComponent<{
}, () => 
  | VNode<RendererNode, RendererElement, {
[key: string]: any;
}>[]
  | null, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
}, {
}>, {
}, SlotsType<{
  default: () => VNode<RendererNode, RendererElement, {
   [key: string]: any;
  }>[];
}>, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Defined in: [src/runtime/vue/auth/helpers.ts:40](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/helpers.ts#L40)

Renders slot content only if the client is unauthenticated (and not loading).

#### Example

```vue
<Unauthenticated>
  <p>Please log in.</p>
</Unauthenticated>
```

***

### AuthLoading

```ts
const AuthLoading: DefineComponent<{
}, () => 
  | VNode<RendererNode, RendererElement, {
[key: string]: any;
}>[]
  | null, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
}, {
}>, {
}, SlotsType<{
  default: () => VNode<RendererNode, RendererElement, {
   [key: string]: any;
  }>[];
}>, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Defined in: [src/runtime/vue/auth/helpers.ts:64](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/helpers.ts#L64)

Renders slot content only while the auth state is loading.

#### Example

```vue
<AuthLoading>
  <p>Checking authentication...</p>
</AuthLoading>
```

***

### ConvexAuthStateKey

```ts
const ConvexAuthStateKey: InjectionKey<ConvexAuthState>;
```

Defined in: [src/runtime/vue/auth/index.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L15)

***

### ConvexClientKey

```ts
const ConvexClientKey: InjectionKey<ConvexVueClient>;
```

Defined in: [src/runtime/vue/client.ts:536](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L536)

Vue injection key for the [ConvexVueClient](#convexvueclient).

Used with `provide` / `inject` to pass the client down the component tree.
The Nuxt plugin registers the client automatically; you only need this key
when writing manual tests or custom providers.

***

### useConvexAction

```ts
const useConvexAction: <Action>(action) => VueAction<Action> = useAction;
```

Defined in: [src/runtime/vue/composables/use-action.ts:62](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-action.ts#L62)

Construct a new [VueAction](#vueaction).

Returns a function that you can call to execute a Convex action.
The returned function is stable (same reference) for the lifetime of the composable.

Actions can call third-party APIs and perform side effects.

#### Type Parameters

| Type Parameter |
| ------ |
| `Action` *extends* [`FunctionReference`](#functionreference)\<`"action"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `action` | `Action` | A FunctionReference for the public action to run. |

#### Returns

[`VueAction`](#vueaction)\<`Action`\>

The [VueAction](#vueaction) object.

#### Example

```vue
<script setup lang="ts">
import { useAction } from '#imports'
import { api } from '#backend/api'

const generate = useAction(api.ai.generateSummary)

async function handleClick() {
  try {
    const summary = await generate({ text: 'Some long text...' })
    console.log(summary)
  } catch (error) {
    console.error('Action failed:', error)
  }
}
</script>
```

***

### useConvexMutation

```ts
const useConvexMutation: <Mutation>(mutation) => VueMutation<Mutation> = useMutation;
```

Defined in: [src/runtime/vue/composables/use-mutation.ts:143](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-mutation.ts#L143)

Construct a new [VueMutation](#vuemutation).

Returns a function that you can call to execute a Convex mutation.
The returned function is stable (same reference) for the lifetime of the composable.

Mutations can optionally be configured with optimistic updates.

#### Type Parameters

| Type Parameter |
| ------ |
| `Mutation` *extends* [`FunctionReference`](#functionreference)\<`"mutation"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mutation` | `Mutation` | A FunctionReference for the public mutation to run. |

#### Returns

[`VueMutation`](#vuemutation)\<`Mutation`\>

The [VueMutation](#vuemutation) object.

#### Example

```vue
<script setup lang="ts">
import { useMutation } from '#imports'
import { api } from '#backend/api'

const createTask = useMutation(api.tasks.create)

async function handleClick() {
  await createTask({ text: 'New task' })
}
</script>
```

***

### useConvexPaginatedQuery

```ts
const useConvexPaginatedQuery: <Query>(query, args, options) => ComputedRef<UsePaginatedQueryReturnType<Query>> = usePaginatedQuery;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:547](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L547)

Load data reactively from a paginated query to create a growing list.

This can be used to power "infinite scroll" UIs.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| `args` | `MaybeRefOrGetter`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\> \| `"skip"`\> |
| `options` | \{ `initialNumItems`: `number`; \} |
| `options.initialNumItems` | `number` |

#### Returns

`ComputedRef`\<[`UsePaginatedQueryReturnType`](#usepaginatedqueryreturntype)\<`Query`\>\>

#### Example

```vue
<script setup lang="ts">
import { usePaginatedQuery } from '#imports'
import { api } from '#backend/api'

const { results, status, loadMore, isLoading } = usePaginatedQuery(
  api.messages.list,
  { channel: '#general' },
  { initialNumItems: 5 },
)
</script>
```

***

### useQueries

```ts
const useQueries: (queries) => ShallowRef<QueriesResults> = useConvexQueries;
```

Defined in: [src/runtime/vue/composables/use-queries.ts:108](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-queries.ts#L108)

Load multiple reactive Convex queries at once.

Unlike calling [useQuery](#usequery) multiple times, `useConvexQueries`
accepts a reactive map of query descriptors so you can add or remove queries
at runtime without breaking the rules of composables.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `queries` | `MaybeRefOrGetter`\<[`RequestForQueries`](#requestforqueries)\> | A reactive (ref/computed/getter) or plain object mapping identifiers to `{ query, args }` descriptors. |

#### Returns

`ShallowRef`\<`QueriesResults`\>

A shallow ref whose value maps each identifier to its query result,
  `undefined` while loading, or an `Error` if the query threw.

#### Example

```vue
<script setup lang="ts">
import { useConvexQueries } from '#imports'
import { api } from '#backend/api'

const results = useConvexQueries({
  tasks: { query: api.tasks.list, args: { completed: false } },
  user:  { query: api.users.me, args: {} },
})
// results.value.tasks — Task[] | undefined
// results.value.user  — User  | undefined
</script>
```

***

### useConvexQuery

```ts
const useConvexQuery: <Query>(query, ...args) => ComputedRef<FunctionReturnType<Query> | undefined> = useQuery;
```

Defined in: [src/runtime/vue/composables/use-query.ts:188](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-query.ts#L188)

Load a reactive query within a Vue component.

Subscribes to a Convex query and returns a shallow ref that updates
automatically whenever the server sends a new result. The subscription is
started when the component mounts and cleaned up on unmount.

Pass `'skip'` (or a reactive getter that returns `'skip'`) to conditionally
disable the subscription without breaking the rules of composables.

Returns `undefined` while the first result is loading. Query errors are
thrown and propagate to the nearest `errorCaptured` boundary — use
[useQuery\_experimental](#usequery_experimental) if you want errors returned in the result.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `Query` | A `FunctionReference` for the public query to run. |
| ...`args` | [`OptionalRestArgsOrSkip`](#optionalrestargsorskip)\<`Query`\> | Arguments for the query, or `'skip'` to pause the subscription. Accepts a ref, computed, or getter for reactive args. |

#### Returns

`ComputedRef`\<[`FunctionReturnType`](#functionreturntype)\<`Query`\> \| `undefined`\>

A computed ref containing the latest query result, or `undefined`
  while the first result is loading.

#### Example

```vue
<script setup lang="ts">
import { useQuery } from '#imports'
import { api } from '#backend/api'

const tasks = useQuery(api.tasks.list, { completed: false })
// tasks.value is Task[] | undefined while the first result is loading

// Conditionally disable with 'skip'
const profile = useQuery(
  api.users.get,
  computed(() => userId.value ? { userId: userId.value } : 'skip'),
)
</script>
```

***

### useConvexStorageUrl

```ts
const useConvexStorageUrl: (getUrl, storageId) => ComputedRef<string | null | undefined> = useStorageUrl;
```

Defined in: [src/runtime/vue/composables/use-storage-url.ts:61](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-storage-url.ts#L61)

Reactively resolve the served URL for a Convex stored file.

Thin wrapper over [useQuery](#usequery) that handles the common ergonomics of
serving stored files: it accepts a reactive storage id and automatically
skips the query (returning `undefined`) while the id is `null`/`undefined`,
so you can bind it straight to an id ref without juggling `'skip'`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `getUrl` | [`GetStorageUrl`](#getstorageurl) | A `FunctionReference` for the public `getUrl` query. |
| `storageId` | `MaybeRefOrGetter`\<`string` \| [`StorageId`](#storageid-1) \| `null` \| `undefined`\> | The storage id to resolve. Accepts a ref, computed, or getter; `null`/`undefined` skips the query. |

#### Returns

`ComputedRef`\<`string` \| `null` \| `undefined`\>

A computed ref of the served URL: `string | null` once loaded
  (`null` if the file is gone), or `undefined` while loading or skipped.

#### Example

```vue
<script setup lang="ts">
import { useStorageUrl } from '#imports'
import { api } from '#backend/api'

const { storageId } = useUpload(api.images.generateUploadUrl)
const url = useStorageUrl(api.images.getUrl, storageId)
</script>

<template>
  <img v-if="url" :src="url">
</template>
```

***

### useConvexUploadQueue

```ts
const useConvexUploadQueue: (generateUploadUrl, options) => VueUploadQueue = useUploadQueue;
```

Defined in: [src/runtime/vue/composables/use-upload-queue.ts:253](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L253)

Upload many files to Convex file storage with bounded concurrency and
per-item reactive progress.

Built on the same flow as [useUpload](#useupload), but manages a queue: call
[VueUploadQueue.enqueue](#enqueue) with one or more files (or a `FileList` from
a multi-file `<input>`) and the queue uploads up to `concurrency` at a time,
exposing per-item and aggregate progress.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `generateUploadUrl` | [`GenerateUploadUrl`](#generateuploadurl) | A `FunctionReference` for the public `generateUploadUrl` mutation. |
| `options` | [`UseUploadQueueOptions`](#useuploadqueueoptions) | Optional [UseUploadQueueOptions](#useuploadqueueoptions). |

#### Returns

[`VueUploadQueue`](#vueuploadqueue)

A [VueUploadQueue](#vueuploadqueue).

#### Example

```vue
<script setup lang="ts">
import { useUploadQueue, useMutation } from '#imports'
import { api } from '#backend/api'

const saveImage = useMutation(api.images.save)
const { items, enqueue, progress, isUploading } = useUploadQueue(
  api.images.generateUploadUrl,
  { concurrency: 4, onItemSuccess: storageId => saveImage({ storageId }) },
)

function onPick(event: Event) {
  enqueue((event.target as HTMLInputElement).files)
}
</script>

<template>
  <input type="file" multiple @change="onPick">
  <progress v-if="isUploading" :value="progress" />
  <ul>
    <li v-for="item in items" :key="item.id">
      {{ item.status }} — {{ Math.round(item.progress * 100) }}%
    </li>
  </ul>
</template>
```

***

### useConvexUpload

```ts
const useConvexUpload: (generateUploadUrl, options) => VueUpload = useUpload;
```

Defined in: [src/runtime/vue/composables/use-upload.ts:281](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L281)

Upload files to Convex file storage from a component, with reactive
progress, error, and cancellation state.

Wraps the standard Convex flow — call a `generateUploadUrl` mutation, `POST`
the file to the returned URL, and read back the storage id — and exposes it
as reactive refs. Pass the resulting [StorageId](#storageid-1) to your own mutation
to persist it in your data model.

Uploads are client-only: calling `upload()` during SSR resolves to `null`
and sets [VueUpload.error](#error-1).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `generateUploadUrl` | [`GenerateUploadUrl`](#generateuploadurl) | A `FunctionReference` for the public `generateUploadUrl` mutation. |
| `options` | [`UseUploadOptions`](#useuploadoptions) | Optional [UseUploadOptions](#useuploadoptions) callbacks. |

#### Returns

[`VueUpload`](#vueupload)

A [VueUpload](#vueupload).

#### Example

```vue
<script setup lang="ts">
import { useUpload, useMutation } from '#imports'
import { api } from '#backend/api'

const saveImage = useMutation(api.images.save)
const { upload, isUploading, progress, error } = useUpload(
  api.images.generateUploadUrl,
  { onSuccess: storageId => saveImage({ storageId }) },
)

async function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await upload(file)
}
</script>

<template>
  <input type="file" :disabled="isUploading" @change="onPick">
  <progress v-if="isUploading" :value="progress" />
  <p v-if="error">{{ error.message }}</p>
</template>
```

## Functions

### usePreloadedAuthQuery()

```ts
function usePreloadedAuthQuery<Query>(preloadedQuery): ComputedRef<FunctionReturnType<Query> | null>;
```

Defined in: [src/runtime/vue/auth/hydration.ts:19](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/hydration.ts#L19)

Auth-aware version of [usePreloadedQuery](#usepreloadedquery) for payloads returned by
`backendAuth(event).preloadAuthQuery(...)`.

Keeps the server-rendered result visible while client auth is still
loading, skips the live query while unauthenticated, and switches to live
data once Convex confirms the authenticated state.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `preloadedQuery` | [`Preloaded`](#preloaded)\<`Query`\> |

#### Returns

`ComputedRef`\<[`FunctionReturnType`](#functionreturntype)\<`Query`\> \| `null`\>

***

### useConvexAuth()

```ts
function useConvexAuth(): ConvexAuthState;
```

Defined in: [src/runtime/vue/auth/index.ts:27](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L27)

Access the Convex auth state injected by [provideConvexAuth](#provideconvexauth).

Reads the current `isLoading` and `isAuthenticated` values. Throws if
`provideConvexAuth` has not been called in an ancestor component.

#### Returns

[`ConvexAuthState`](#convexauthstate)

The current [ConvexAuthState](#convexauthstate).

***

### provideConvexAuth()

```ts
function provideConvexAuth(options): ConvexAuthState;
```

Defined in: [src/runtime/vue/auth/index.ts:75](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L75)

Wire an external auth provider into the Convex client and make auth state
available to all descendant components via [useConvexAuth](#useconvexauth).

Call this in a top-level layout component's `setup` function, passing the
auth provider's loading/authenticated flags and its token fetcher.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`ConvexAuthProviderOptions`](#convexauthprovideroptions) | Auth integration options including the Convex client and an `useAuth` factory that returns loading state and a token fetcher. |

#### Returns

[`ConvexAuthState`](#convexauthstate)

The reactive auth state.

#### Example

```vue
<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'  // your auth provider

const { client } = useNuxtApp().$convex
const authState = provideConvexAuth({ client, useAuth })
</script>
```

***

### createConvexAuthState()

```ts
function createConvexAuthState(options, scope?): ConvexAuthState;
```

Defined in: [src/runtime/vue/auth/index.ts:91](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L91)

Build reactive [ConvexAuthState](#convexauthstate) and wire watchers between the
external auth provider and the Convex client, without calling `provide()`.

Use this when you need to install the state at the Nuxt app level
(`nuxtApp.vueApp.provide`) rather than from a component's setup function.

When `scope` is provided, all watchers are created inside that
EffectScope so callers can dispose them later.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`ConvexAuthProviderOptions`](#convexauthprovideroptions) |
| `scope?` | `EffectScope` |

#### Returns

[`ConvexAuthState`](#convexauthstate)

***

### createScopedConvexAuthState()

```ts
function createScopedConvexAuthState(options): {
  state: ConvexAuthState;
  scope: EffectScope;
};
```

Defined in: [src/runtime/vue/auth/index.ts:191](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L191)

Create a fresh EffectScope and build a Convex auth state inside it.
The scope is returned so the caller can `.stop()` it on teardown.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`ConvexAuthProviderOptions`](#convexauthprovideroptions) |

#### Returns

```ts
{
  state: ConvexAuthState;
  scope: EffectScope;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `state` | [`ConvexAuthState`](#convexauthstate) | [src/runtime/vue/auth/index.ts:193](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L193) |
| `scope` | `EffectScope` | [src/runtime/vue/auth/index.ts:193](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/index.ts#L193) |

***

### useAuth()

```ts
function useAuth(initialToken?): UseAuthService;
```

Defined in: [src/runtime/vue/auth/use-auth.ts:69](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/auth/use-auth.ts#L69)

Unified Better Auth service for the Vue/Nuxt runtime.

Returns the full Better Auth client, the reactive session wrapper, and the
Convex-compatible auth state used by the packaged auth plugin.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `initialToken?` | `string` \| `null` | Optional preloaded token, used once per app lifetime to avoid a round-trip on initial load (e.g. from SSR). |

#### Returns

[`UseAuthService`](#useauthservice)

***

### useConvex()

```ts
function useConvex(): ConvexVueClient;
```

Defined in: [src/runtime/vue/client.ts:550](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/client.ts#L550)

Access the [ConvexVueClient](#convexvueclient) from any Vue composable or component.

Reads the client that was registered by the Nuxt plugin (or a manual
`provide` call). Throws if called outside a component tree that has a
client provided.

#### Returns

[`ConvexVueClient`](#convexvueclient)

The active [ConvexVueClient](#convexvueclient) instance.

#### Throws

If no client has been provided in the component tree.

***

### useAction()

```ts
function useAction<Action>(action): VueAction<Action>;
```

Defined in: [src/runtime/vue/composables/use-action.ts:47](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-action.ts#L47)

Construct a new [VueAction](#vueaction).

Returns a function that you can call to execute a Convex action.
The returned function is stable (same reference) for the lifetime of the composable.

Actions can call third-party APIs and perform side effects.

#### Type Parameters

| Type Parameter |
| ------ |
| `Action` *extends* [`FunctionReference`](#functionreference)\<`"action"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `action` | `Action` | A FunctionReference for the public action to run. |

#### Returns

[`VueAction`](#vueaction)\<`Action`\>

The [VueAction](#vueaction) object.

#### Example

```vue
<script setup lang="ts">
import { useAction } from '#imports'
import { api } from '#backend/api'

const generate = useAction(api.ai.generateSummary)

async function handleClick() {
  try {
    const summary = await generate({ text: 'Some long text...' })
    console.log(summary)
  } catch (error) {
    console.error('Action failed:', error)
  }
}
</script>
```

***

### useConvexConnectionState()

```ts
function useConvexConnectionState(): ShallowRef<ConnectionState>;
```

Defined in: [src/runtime/vue/composables/use-connection-state.ts:28](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-connection-state.ts#L28)

Subscribe reactively to the Convex WebSocket connection state.

Returns a shallow ref that updates automatically whenever the connection
state changes. Useful for displaying online/offline indicators or request
spinners.

#### Returns

`ShallowRef`\<[`ConnectionState`](#connectionstate)\>

A shallow ref containing the current [ConnectionState](#connectionstate).

#### Example

```vue
<script setup lang="ts">
const conn = useConvexConnectionState()
</script>

<template>
  <span v-if="!conn.isWebSocketConnected">Offline</span>
</template>
```

***

### useMutation()

```ts
function useMutation<Mutation>(mutation): VueMutation<Mutation>;
```

Defined in: [src/runtime/vue/composables/use-mutation.ts:130](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-mutation.ts#L130)

Construct a new [VueMutation](#vuemutation).

Returns a function that you can call to execute a Convex mutation.
The returned function is stable (same reference) for the lifetime of the composable.

Mutations can optionally be configured with optimistic updates.

#### Type Parameters

| Type Parameter |
| ------ |
| `Mutation` *extends* [`FunctionReference`](#functionreference)\<`"mutation"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mutation` | `Mutation` | A FunctionReference for the public mutation to run. |

#### Returns

[`VueMutation`](#vuemutation)\<`Mutation`\>

The [VueMutation](#vuemutation) object.

#### Example

```vue
<script setup lang="ts">
import { useMutation } from '#imports'
import { api } from '#backend/api'

const createTask = useMutation(api.tasks.create)

async function handleClick() {
  await createTask({ text: 'New task' })
}
</script>
```

***

### usePaginatedQuery()

```ts
function usePaginatedQuery<Query>(
   query, 
   args, 
options): ComputedRef<UsePaginatedQueryReturnType<Query>>;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:138](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L138)

Load data reactively from a paginated query to create a growing list.

This can be used to power "infinite scroll" UIs.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| `args` | `MaybeRefOrGetter`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\> \| `"skip"`\> |
| `options` | \{ `initialNumItems`: `number`; \} |
| `options.initialNumItems` | `number` |

#### Returns

`ComputedRef`\<[`UsePaginatedQueryReturnType`](#usepaginatedqueryreturntype)\<`Query`\>\>

#### Example

```vue
<script setup lang="ts">
import { usePaginatedQuery } from '#imports'
import { api } from '#backend/api'

const { results, status, loadMore, isLoading } = usePaginatedQuery(
  api.messages.list,
  { channel: '#general' },
  { initialNumItems: 5 },
)
</script>
```

***

### usePaginatedQuery\_experimental()

#### Call Signature

```ts
function usePaginatedQuery_experimental<Query>(
   query, 
   args, 
options): ComputedRef<UsePaginatedQueryReturnType<Query>>;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:567](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L567)

Experimental paginated query that adds an object-form overload on top of the
positional [usePaginatedQuery](#usepaginatedquery), mirroring the public name React's
Convex integration exposes (`usePaginatedQuery_experimental`).

The positional overload behaves exactly like [usePaginatedQuery](#usepaginatedquery): it
returns the TitleCase [UsePaginatedQueryReturnType](#usepaginatedqueryreturntype) and throws on error.
The object overload returns the lowercase-status
[UsePaginatedQueryObjectReturnType](#usepaginatedqueryobjectreturntype) and surfaces errors via
`status: 'error'` (unless `throwOnError: true`).

Note: React backs its experimental hook with the Convex client's native
`PaginatedQueryClient`, which the published `convex` package does not export.
This port reuses our manual page-management implementation, which produces
identical observable results (`results`/`data`, `status`, `loadMore`).

##### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| `args` | `MaybeRefOrGetter`\<`"skip"` \| [`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\>\> |
| `options` | \{ `initialNumItems`: `number`; \} |
| `options.initialNumItems` | `number` |

##### Returns

`ComputedRef`\<[`UsePaginatedQueryReturnType`](#usepaginatedqueryreturntype)\<`Query`\>\>

#### Call Signature

```ts
function usePaginatedQuery_experimental<Query, ThrowOnError>(options): ComputedRef<UsePaginatedQueryObjectReturnType<Query, ThrowOnError>>;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:573](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L573)

Experimental paginated query that adds an object-form overload on top of the
positional [usePaginatedQuery](#usepaginatedquery), mirroring the public name React's
Convex integration exposes (`usePaginatedQuery_experimental`).

The positional overload behaves exactly like [usePaginatedQuery](#usepaginatedquery): it
returns the TitleCase [UsePaginatedQueryReturnType](#usepaginatedqueryreturntype) and throws on error.
The object overload returns the lowercase-status
[UsePaginatedQueryObjectReturnType](#usepaginatedqueryobjectreturntype) and surfaces errors via
`status: 'error'` (unless `throwOnError: true`).

Note: React backs its experimental hook with the Convex client's native
`PaginatedQueryClient`, which the published `convex` package does not export.
This port reuses our manual page-management implementation, which produces
identical observable results (`results`/`data`, `status`, `loadMore`).

##### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) | - |
| `ThrowOnError` *extends* `boolean` | `false` |

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `MaybeRefOrGetter`\<[`UsePaginatedQueryOptions`](#usepaginatedqueryoptions)\<`Query`, `ThrowOnError`\>\> |

##### Returns

`ComputedRef`\<[`UsePaginatedQueryObjectReturnType`](#usepaginatedqueryobjectreturntype)\<`Query`, `ThrowOnError`\>\>

***

### optimisticallyUpdateValueInPaginatedQuery()

```ts
function optimisticallyUpdateValueInPaginatedQuery<Query>(
   localStore, 
   query, 
   args, 
   updateValue): void;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:634](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L634)

Optimistically update values in a paginated list.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `localStore` | `OptimisticLocalStore` |
| `query` | `Query` |
| `args` | [`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\> |
| `updateValue` | (`currentValue`) => [`PaginatedQueryItem`](#paginatedqueryitem)\<`Query`\> |

#### Returns

`void`

***

### insertAtTop()

```ts
function insertAtTop<Query>(options): void;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:676](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L676)

Insert an item at the top of a paginated list, regardless of sort order.

Only updates if the first page is already loaded — otherwise the insertion
would flash in/out once the real first page arrives.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `paginatedQuery`: `Query`; `argsToMatch?`: `Partial`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\>\>; `localQueryStore`: `OptimisticLocalStore`; `item`: [`PaginatedQueryItem`](#paginatedqueryitem)\<`Query`\>; \} |
| `options.paginatedQuery` | `Query` |
| `options.argsToMatch?` | `Partial`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\>\> |
| `options.localQueryStore` | `OptimisticLocalStore` |
| `options.item` | [`PaginatedQueryItem`](#paginatedqueryitem)\<`Query`\> |

#### Returns

`void`

***

### insertAtBottomIfLoaded()

```ts
function insertAtBottomIfLoaded<Query>(options): void;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:704](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L704)

Insert an item at the bottom of a paginated list, but only if the final
page has loaded (otherwise it would pop out when the server responds).

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `paginatedQuery`: `Query`; `argsToMatch?`: `Partial`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\>\>; `localQueryStore`: `OptimisticLocalStore`; `item`: [`PaginatedQueryItem`](#paginatedqueryitem)\<`Query`\>; \} |
| `options.paginatedQuery` | `Query` |
| `options.argsToMatch?` | `Partial`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\>\> |
| `options.localQueryStore` | `OptimisticLocalStore` |
| `options.item` | [`PaginatedQueryItem`](#paginatedqueryitem)\<`Query`\> |

#### Returns

`void`

***

### insertAtPosition()

```ts
function insertAtPosition<Query>(options): void;
```

Defined in: [src/runtime/vue/composables/use-paginated-query.ts:743](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-paginated-query.ts#L743)

Insert an item at its sorted position across loaded pages of a paginated
query, given a sort order and a function deriving the sort key.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`PaginatedQueryReference`](#paginatedqueryreference) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | \{ `paginatedQuery`: `Query`; `argsToMatch?`: `Partial`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\>\>; `sortOrder`: `"asc"` \| `"desc"`; `sortKeyFromItem`: (`item`) => [`Value`](#value) \| [`Value`](#value)[]; `localQueryStore`: `OptimisticLocalStore`; `item`: [`PaginatedQueryItem`](#paginatedqueryitem)\<`Query`\>; \} |
| `options.paginatedQuery` | `Query` |
| `options.argsToMatch?` | `Partial`\<[`PaginatedQueryArgs`](#paginatedqueryargs)\<`Query`\>\> |
| `options.sortOrder` | `"asc"` \| `"desc"` |
| `options.sortKeyFromItem` | (`item`) => [`Value`](#value) \| [`Value`](#value)[] |
| `options.localQueryStore` | `OptimisticLocalStore` |
| `options.item` | [`PaginatedQueryItem`](#paginatedqueryitem)\<`Query`\> |

#### Returns

`void`

***

### useConvexQueries()

```ts
function useConvexQueries(queries): ShallowRef<QueriesResults>;
```

Defined in: [src/runtime/vue/composables/use-queries.ts:44](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-queries.ts#L44)

Load multiple reactive Convex queries at once.

Unlike calling [useQuery](#usequery) multiple times, `useConvexQueries`
accepts a reactive map of query descriptors so you can add or remove queries
at runtime without breaking the rules of composables.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `queries` | `MaybeRefOrGetter`\<[`RequestForQueries`](#requestforqueries)\> | A reactive (ref/computed/getter) or plain object mapping identifiers to `{ query, args }` descriptors. |

#### Returns

`ShallowRef`\<`QueriesResults`\>

A shallow ref whose value maps each identifier to its query result,
  `undefined` while loading, or an `Error` if the query threw.

#### Example

```vue
<script setup lang="ts">
import { useConvexQueries } from '#imports'
import { api } from '#backend/api'

const results = useConvexQueries({
  tasks: { query: api.tasks.list, args: { completed: false } },
  user:  { query: api.users.me, args: {} },
})
// results.value.tasks — Task[] | undefined
// results.value.user  — User  | undefined
</script>
```

***

### useQuery()

```ts
function useQuery<Query>(query, ...args): ComputedRef<FunctionReturnType<Query> | undefined>;
```

Defined in: [src/runtime/vue/composables/use-query.ts:68](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-query.ts#L68)

Load a reactive query within a Vue component.

Subscribes to a Convex query and returns a shallow ref that updates
automatically whenever the server sends a new result. The subscription is
started when the component mounts and cleaned up on unmount.

Pass `'skip'` (or a reactive getter that returns `'skip'`) to conditionally
disable the subscription without breaking the rules of composables.

Returns `undefined` while the first result is loading. Query errors are
thrown and propagate to the nearest `errorCaptured` boundary — use
[useQuery\_experimental](#usequery_experimental) if you want errors returned in the result.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `Query` | A `FunctionReference` for the public query to run. |
| ...`args` | [`OptionalRestArgsOrSkip`](#optionalrestargsorskip)\<`Query`\> | Arguments for the query, or `'skip'` to pause the subscription. Accepts a ref, computed, or getter for reactive args. |

#### Returns

`ComputedRef`\<[`FunctionReturnType`](#functionreturntype)\<`Query`\> \| `undefined`\>

A computed ref containing the latest query result, or `undefined`
  while the first result is loading.

#### Example

```vue
<script setup lang="ts">
import { useQuery } from '#imports'
import { api } from '#backend/api'

const tasks = useQuery(api.tasks.list, { completed: false })
// tasks.value is Task[] | undefined while the first result is loading

// Conditionally disable with 'skip'
const profile = useQuery(
  api.users.get,
  computed(() => userId.value ? { userId: userId.value } : 'skip'),
)
</script>
```

***

### useQuery\_experimental()

```ts
function useQuery_experimental<Query, ThrowOnError>(options): ComputedRef<UseQueryResult<FunctionReturnType<Query>, ThrowOnError>>;
```

Defined in: [src/runtime/vue/composables/use-query.ts:134](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-query.ts#L134)

Load a reactive query within a Vue component using an options object.

This is an experimental form of [useQuery](#usequery) that accepts a single
UseQueryOptions object instead of positional arguments and returns a
discriminated-union [UseQueryResult](#usequeryresult) as a computed ref.

Inspect the returned `status` field to use the result. If an error occurs it
is present in the result object unless `throwOnError` is `true`, in which case
the error is thrown instead.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> | - |
| `ThrowOnError` *extends* `boolean` | `false` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `UseQueryOptions`\<`Query`, `ThrowOnError`\> | Query options. Pass `args: 'skip'` to disable the query. |

#### Returns

`ComputedRef`\<[`UseQueryResult`](#usequeryresult)\<[`FunctionReturnType`](#functionreturntype)\<`Query`\>, `ThrowOnError`\>\>

A computed ref containing the current query state as a
  [UseQueryResult](#usequeryresult) object.

#### Example

```vue
<script setup lang="ts">
import { useQuery_experimental as useQuery } from '#imports'
import { api } from '#backend/api'

const state = useQuery({ query: api.tasks.list, args: { completed: false } })
// state.value.status: 'pending' | 'success' | 'error'
</script>
```

***

### useStorageUrl()

```ts
function useStorageUrl(getUrl, storageId): ComputedRef<string | null | undefined>;
```

Defined in: [src/runtime/vue/composables/use-storage-url.ts:50](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-storage-url.ts#L50)

Reactively resolve the served URL for a Convex stored file.

Thin wrapper over [useQuery](#usequery) that handles the common ergonomics of
serving stored files: it accepts a reactive storage id and automatically
skips the query (returning `undefined`) while the id is `null`/`undefined`,
so you can bind it straight to an id ref without juggling `'skip'`.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `getUrl` | [`GetStorageUrl`](#getstorageurl) | A `FunctionReference` for the public `getUrl` query. |
| `storageId` | `MaybeRefOrGetter`\<`string` \| [`StorageId`](#storageid-1) \| `null` \| `undefined`\> | The storage id to resolve. Accepts a ref, computed, or getter; `null`/`undefined` skips the query. |

#### Returns

`ComputedRef`\<`string` \| `null` \| `undefined`\>

A computed ref of the served URL: `string | null` once loaded
  (`null` if the file is gone), or `undefined` while loading or skipped.

#### Example

```vue
<script setup lang="ts">
import { useStorageUrl } from '#imports'
import { api } from '#backend/api'

const { storageId } = useUpload(api.images.generateUploadUrl)
const url = useStorageUrl(api.images.getUrl, storageId)
</script>

<template>
  <img v-if="url" :src="url">
</template>
```

***

### useUploadQueue()

```ts
function useUploadQueue(generateUploadUrl, options?): VueUploadQueue;
```

Defined in: [src/runtime/vue/composables/use-upload-queue.ts:133](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload-queue.ts#L133)

Upload many files to Convex file storage with bounded concurrency and
per-item reactive progress.

Built on the same flow as [useUpload](#useupload), but manages a queue: call
[VueUploadQueue.enqueue](#enqueue) with one or more files (or a `FileList` from
a multi-file `<input>`) and the queue uploads up to `concurrency` at a time,
exposing per-item and aggregate progress.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `generateUploadUrl` | [`GenerateUploadUrl`](#generateuploadurl) | A `FunctionReference` for the public `generateUploadUrl` mutation. |
| `options` | [`UseUploadQueueOptions`](#useuploadqueueoptions) | Optional [UseUploadQueueOptions](#useuploadqueueoptions). |

#### Returns

[`VueUploadQueue`](#vueuploadqueue)

A [VueUploadQueue](#vueuploadqueue).

#### Example

```vue
<script setup lang="ts">
import { useUploadQueue, useMutation } from '#imports'
import { api } from '#backend/api'

const saveImage = useMutation(api.images.save)
const { items, enqueue, progress, isUploading } = useUploadQueue(
  api.images.generateUploadUrl,
  { concurrency: 4, onItemSuccess: storageId => saveImage({ storageId }) },
)

function onPick(event: Event) {
  enqueue((event.target as HTMLInputElement).files)
}
</script>

<template>
  <input type="file" multiple @change="onPick">
  <progress v-if="isUploading" :value="progress" />
  <ul>
    <li v-for="item in items" :key="item.id">
      {{ item.status }} — {{ Math.round(item.progress * 100) }}%
    </li>
  </ul>
</template>
```

***

### uploadFile()

```ts
function uploadFile(options): Promise<StorageId>;
```

Defined in: [src/runtime/vue/composables/use-upload.ts:58](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L58)

Upload a single file to a Convex upload URL, resolving to its storage id.

Low-level building block used by [useUpload](#useupload) and
[useUploadQueue](#useuploadqueue). Uses `XMLHttpRequest` so real upload progress and
cancellation are available — `fetch` cannot report request-body progress.

Browser-only: throws if no `XMLHttpRequest` global is available (e.g. during
SSR).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`UploadFileOptions`](#uploadfileoptions) | [UploadFileOptions](#uploadfileoptions). |

#### Returns

`Promise`\<[`StorageId`](#storageid-1)\>

A promise of the new [StorageId](#storageid-1).

***

### useUpload()

```ts
function useUpload(generateUploadUrl, options?): VueUpload;
```

Defined in: [src/runtime/vue/composables/use-upload.ts:205](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/composables/use-upload.ts#L205)

Upload files to Convex file storage from a component, with reactive
progress, error, and cancellation state.

Wraps the standard Convex flow — call a `generateUploadUrl` mutation, `POST`
the file to the returned URL, and read back the storage id — and exposes it
as reactive refs. Pass the resulting [StorageId](#storageid-1) to your own mutation
to persist it in your data model.

Uploads are client-only: calling `upload()` during SSR resolves to `null`
and sets [VueUpload.error](#error-1).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `generateUploadUrl` | [`GenerateUploadUrl`](#generateuploadurl) | A `FunctionReference` for the public `generateUploadUrl` mutation. |
| `options` | [`UseUploadOptions`](#useuploadoptions) | Optional [UseUploadOptions](#useuploadoptions) callbacks. |

#### Returns

[`VueUpload`](#vueupload)

A [VueUpload](#vueupload).

#### Example

```vue
<script setup lang="ts">
import { useUpload, useMutation } from '#imports'
import { api } from '#backend/api'

const saveImage = useMutation(api.images.save)
const { upload, isUploading, progress, error } = useUpload(
  api.images.generateUploadUrl,
  { onSuccess: storageId => saveImage({ storageId }) },
)

async function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) await upload(file)
}
</script>

<template>
  <input type="file" :disabled="isUploading" @change="onPick">
  <progress v-if="isUploading" :value="progress" />
  <p v-if="error">{{ error.message }}</p>
</template>
```

***

### usePreloadedQuery()

```ts
function usePreloadedQuery<Query>(preloadedQuery): ComputedRef<FunctionReturnType<Query>>;
```

Defined in: [src/runtime/vue/hydration.ts:47](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/vue/hydration.ts#L47)

Load a reactive query within a Vue component using a `Preloaded` payload
from a server-side preload.

This composable subscribes to the same query and reactively updates
when the result changes. Initially returns the preloaded server result
for instant display.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](#functionreference)\<`"query"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `preloadedQuery` | [`Preloaded`](#preloaded)\<`Query`\> | The `Preloaded` payload from server-side preloading. |

#### Returns

`ComputedRef`\<[`FunctionReturnType`](#functionreturntype)\<`Query`\>\>

A computed ref that initially contains the preloaded data and
subsequently updates with live query results.

#### Example

```vue
<script setup lang="ts">
import { usePreloadedQuery } from '#imports'

const props = defineProps<{
  preloaded: Preloaded<typeof api.tasks.list>
}>()

const tasks = usePreloadedQuery(props.preloaded)
</script>
```

## References

### MutationOptions

Renames and re-exports [VueMutationOptions](#vuemutationoptions)
