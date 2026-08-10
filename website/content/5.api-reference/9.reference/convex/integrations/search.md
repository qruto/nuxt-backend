---
navigation: true
---

# convex/integrations/search

## Interfaces

### SearchConfig

Defined in: [nuxt-backend/src/convex/integrations/search.ts:130](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L130)

#### Type Parameters

| Type Parameter |
| ------ |
| `DM` *extends* `GenericDataModel` |
| `T` *extends* `TableNamesInDataModel`\<`DM`\> |
| `I` *extends* `IndexName`\<`DM`, `T`\> |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="table"></a> `table` | `T` | The table to search. | [nuxt-backend/src/convex/integrations/search.ts:136](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L136) |
| <a id="index"></a> `index` | `I` | The `searchIndex` name on that table. | [nuxt-backend/src/convex/integrations/search.ts:138](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L138) |
| <a id="searchfield"></a> `searchField` | `NamedSearchIndex`\<`TableInfo`\<`DM`, `T`\>, `I`\>\[`"searchField"`\] | The search field declared on the index. | [nuxt-backend/src/convex/integrations/search.ts:140](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L140) |
| <a id="defaultlimit"></a> `defaultLimit?` | `number` | Default number of results when the caller omits `limit` (default 20). | [nuxt-backend/src/convex/integrations/search.ts:142](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L142) |

## Functions

### search()

```ts
function search<DM, T>(ctx, table): {
  withSearchIndex: SearchIndexBound<DM, T, I>;
};
```

Defined in: [nuxt-backend/src/convex/integrations/search.ts:118](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L118)

A fluent, type-safe builder over Convex's native full-text search. Index
names, search fields, and `eq` filter fields are all checked against your
schema's `searchIndex` definitions.

#### Type Parameters

| Type Parameter |
| ------ |
| `DM` *extends* `GenericDataModel` |
| `T` *extends* `string` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | \{ `db`: `GenericDatabaseReader`\<`DM`\>; \} |
| `ctx.db` | `GenericDatabaseReader`\<`DM`\> |
| `table` | `T` |

#### Returns

| Name | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| `withSearchIndex()` | (`index`) => `SearchIndexBound`\<`DM`, `T`, `I`\> | Pick the `searchIndex` (by name) to query. | [nuxt-backend/src/convex/integrations/search.ts:124](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L124) |

#### Example

```ts
const results = await search(ctx, 'messages')
  .withSearchIndex('search_text')
  .search('text', term)
  .eq('userId', userId)
  .take(20)
```

***

### defineSearch()

```ts
function defineSearch<DM, T, I>(query, config): RegisteredQuery<"public", {
  query: string;
  limit?: number;
}, Promise<Doc<DM, T>[]>>;
```

Defined in: [nuxt-backend/src/convex/integrations/search.ts:162](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/search.ts#L162)

Define a ready-to-call Convex search query from a search-index config. The
generated query takes `{ query: string, limit?: number }` and returns the
matching documents — pair it with the `useSearch` composable on the client.

#### Type Parameters

| Type Parameter |
| ------ |
| `DM` *extends* `GenericDataModel` |
| `T` *extends* `string` |
| `I` *extends* `string` \| `number` \| `symbol` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `QueryBuilder`\<`DM`, `"public"`\> |
| `config` | [`SearchConfig`](#searchconfig)\<`DM`, `T`, `I`\> |

#### Returns

`RegisteredQuery`\<`"public"`, \{
  `query`: `string`;
  `limit?`: `number`;
\}, `Promise`\<`Doc`\<`DM`, `T`\>[]\>\>

#### Example

```ts
import { defineSearch } from 'nuxt-backend/search'
import { query } from './_generated/server'

export const searchMessages = defineSearch(query, {
  table: 'messages',
  index: 'search_text',
  searchField: 'text',
})
```
