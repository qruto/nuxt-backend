---
navigation: true
---

# runtime/vue/composables/use-search

## Interfaces

### UseSearchOptions

Defined in: [nuxt-backend/src/runtime/vue/composables/use-search.ts:5](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L5)

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* `FunctionReference`\<`"query"`\> |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="debounce"></a> `debounce?` | `number` | Debounce, in milliseconds, before the term is sent to the server (default 200). | [nuxt-backend/src/runtime/vue/composables/use-search.ts:7](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L7) |
| <a id="args"></a> `args?` | `MaybeRefOrGetter`\<`Omit`\<`FunctionArgs`\<`Query`\>, `"query"`\>\> | Extra arguments merged with `{ query }` (e.g. `{ limit }` or filter fields). | [nuxt-backend/src/runtime/vue/composables/use-search.ts:9](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L9) |

***

### UseSearchResult

Defined in: [nuxt-backend/src/runtime/vue/composables/use-search.ts:12](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L12)

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* `FunctionReference`\<`"query"`\> |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="results"></a> `results` | `ComputedRef`\<`FunctionReturnType`\<`Query`\>\> | The matching documents (empty array while loading or when the term is blank). | [nuxt-backend/src/runtime/vue/composables/use-search.ts:14](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L14) |
| <a id="isloading"></a> `isLoading` | `ComputedRef`\<`boolean`\> | True while a non-empty term is in flight and no result has arrived yet. | [nuxt-backend/src/runtime/vue/composables/use-search.ts:16](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L16) |
| <a id="term"></a> `term` | `ComputedRef`\<`string`\> | The debounced term currently driving the query. | [nuxt-backend/src/runtime/vue/composables/use-search.ts:18](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L18) |

## Functions

### useSearch()

```ts
function useSearch<Query>(
   query, 
   term, 
options?): UseSearchResult<Query>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-search.ts:38](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-search.ts#L38)

Reactive, debounced full-text search. Pairs with a query created by
`defineSearch` (or any query taking `{ query: string }`): as the term ref
changes it debounces, skips the round-trip while blank, and returns the live
results.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* `FunctionReference`\<`"query"`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| `term` | `MaybeRefOrGetter`\<`string`\> |
| `options` | [`UseSearchOptions`](#usesearchoptions)\<`Query`\> |

#### Returns

[`UseSearchResult`](#usesearchresult)\<`Query`\>

#### Example

```vue
<script setup lang="ts">
import { useSearch } from '#imports'
import { api } from '#backend/api'

const term = ref('')
const { results, isLoading } = useSearch(api.search.searchMessages, term, { debounce: 200 })
</script>
```
