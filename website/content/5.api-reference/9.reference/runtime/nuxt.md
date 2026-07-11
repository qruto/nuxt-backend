---
navigation: true
---

# runtime/nuxt

Helpers for integrating Convex into Nuxt applications using server rendering.

This module contains:
1. [preloadQuery](#preloadquery), for preloading data for reactive client components.
2. [fetchQuery](#fetchquery), [fetchMutation](#fetchmutation) and [fetchAction](#fetchaction) for loading
   and mutating Convex data from Nuxt server routes, API handlers, and middleware.

All exported functions assume that a Convex deployment URL is set in the
`NUXT_PUBLIC_CONVEX_URL` environment variable.

## Interfaces

### NuxtConvexOptions

Defined in: [src/runtime/nuxt/index.ts:32](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L32)

Options for [preloadQuery](#preloadquery), [fetchQuery](#fetchquery), [fetchMutation](#fetchmutation)
and [fetchAction](#fetchaction).

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="token"></a> `token?` | `string` | The JWT-encoded OpenID Connect authentication token to use for the function call. | [src/runtime/nuxt/index.ts:36](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L36) |
| <a id="url"></a> `url?` | `string` | The URL of the Convex deployment to use for the function call. Defaults to `process.env.NUXT_PUBLIC_CONVEX_URL` if not provided. Explicitly passing undefined here (such as from missing ENV variables) will throw an error in the future. | [src/runtime/nuxt/index.ts:43](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L43) |
| <a id="skipconvexdeploymenturlcheck"></a> `skipConvexDeploymentUrlCheck?` | `boolean` | Skip validating that the Convex deployment URL looks like `https://happy-animal-123.convex.cloud` or localhost. This can be useful if running a self-hosted Convex backend that uses a different URL. The default value is `false` | [src/runtime/nuxt/index.ts:58](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L58) |

## Functions

### preloadQuery()

```ts
function preloadQuery<Query>(query, ...args): Promise<Preloaded<Query>>;
```

Defined in: [src/runtime/nuxt/index.ts:133](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L133)

Execute a Convex query function and return a `Preloaded` payload
which can be passed to `usePreloadedQuery` in a client component.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `Query` | A FunctionReference for the public query to run. |
| ...`args` | [`ArgsAndOptions`](/api-reference/reference/runtime/vue#argsandoptions)\<`Query`, [`NuxtConvexOptions`](#nuxtconvexoptions)\> | The query arguments and optional [NuxtConvexOptions](#nuxtconvexoptions) passed as the final argument. |

#### Returns

`Promise`\<[`Preloaded`](/api-reference/reference/runtime/vue#preloaded)\<`Query`\>\>

A promise of the `Preloaded` payload.

***

### preloadedQueryResult()

```ts
function preloadedQueryResult<Query>(preloaded): FunctionReturnType<Query>;
```

Defined in: [src/runtime/nuxt/index.ts:154](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L154)

Returns the result of executing a query via `preloadQuery`.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `preloaded` | [`Preloaded`](/api-reference/reference/runtime/vue#preloaded)\<`Query`\> | The `Preloaded` payload returned by `preloadQuery`. |

#### Returns

[`FunctionReturnType`](/api-reference/reference/runtime/vue#functionreturntype)\<`Query`\>

The query result.

***

### fetchQuery()

```ts
function fetchQuery<Query>(query, ...args): Promise<FunctionReturnType<Query>>;
```

Defined in: [src/runtime/nuxt/index.ts:170](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L170)

Execute a Convex query function.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"query"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `Query` | A FunctionReference for the public query to run. |
| ...`args` | [`ArgsAndOptions`](/api-reference/reference/runtime/vue#argsandoptions)\<`Query`, [`NuxtConvexOptions`](#nuxtconvexoptions)\> | The query arguments and optional [NuxtConvexOptions](#nuxtconvexoptions) passed as the final argument. |

#### Returns

`Promise`\<[`FunctionReturnType`](/api-reference/reference/runtime/vue#functionreturntype)\<`Query`\>\>

A promise of the query's result.

***

### fetchMutation()

```ts
function fetchMutation<Mutation>(mutation, ...args): Promise<FunctionReturnType<Mutation>>;
```

Defined in: [src/runtime/nuxt/index.ts:189](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L189)

Execute a Convex mutation function.

#### Type Parameters

| Type Parameter |
| ------ |
| `Mutation` *extends* [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"mutation"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `mutation` | `Mutation` | A FunctionReference for the public mutation to run. |
| ...`args` | [`ArgsAndOptions`](/api-reference/reference/runtime/vue#argsandoptions)\<`Mutation`, [`NuxtConvexOptions`](#nuxtconvexoptions)\> | The mutation arguments and optional [NuxtConvexOptions](#nuxtconvexoptions) passed as the final argument. |

#### Returns

`Promise`\<[`FunctionReturnType`](/api-reference/reference/runtime/vue#functionreturntype)\<`Mutation`\>\>

A promise of the mutation's result.

***

### fetchAction()

```ts
function fetchAction<Action>(action, ...args): Promise<FunctionReturnType<Action>>;
```

Defined in: [src/runtime/nuxt/index.ts:208](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/runtime/nuxt/index.ts#L208)

Execute a Convex action function.

#### Type Parameters

| Type Parameter |
| ------ |
| `Action` *extends* [`FunctionReference`](/api-reference/reference/runtime/vue#functionreference)\<`"action"`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `action` | `Action` | A FunctionReference for the public action to run. |
| ...`args` | [`ArgsAndOptions`](/api-reference/reference/runtime/vue#argsandoptions)\<`Action`, [`NuxtConvexOptions`](#nuxtconvexoptions)\> | The action arguments and optional [NuxtConvexOptions](#nuxtconvexoptions) passed as the final argument. |

#### Returns

`Promise`\<[`FunctionReturnType`](/api-reference/reference/runtime/vue#functionreturntype)\<`Action`\>\>

A promise of the action's result.
