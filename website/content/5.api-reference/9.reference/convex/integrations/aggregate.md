---
navigation: true
---

# convex/integrations/aggregate

## Classes

### TableAggregate

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:272

Re-exports for the [Aggregate](https://www.convex.dev/components/aggregate) component, so consumers configure denormalized counts/sums from a
single import. Construct one `TableAggregate` per app-mounted aggregate
instance and keep it in sync with [Triggers](#triggers).

#### Extends

- `Aggregate`\<`T`\[`"Key"`\], `GenericId`\<`T`\[`"TableName"`\]\>, `TableAggregateNamespace`\<`T`\>\>

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* `AnyTableAggregateType` |

#### Constructors

##### Constructor

```ts
new TableAggregate<T>(component, options): TableAggregate<T>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:274

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `component` | `ComponentApi` |
| `options` | \{ `sortKey`: (`d`) => `T`\[`"Key"`\]; `sumValue?`: (`d`) => `number`; \} & `undefined` *extends* `TableAggregateNamespace`\<`T`\> ? \{ `namespace?`: (`d`) => `TableAggregateNamespace`\<`T`\>; \} : \{ `namespace`: (`d`) => `TableAggregateNamespace`\<`T`\>; \} |

###### Returns

[`TableAggregate`](#tableaggregate)\<`T`\>

###### Overrides

```ts
Aggregate<T["Key"], GenericId<T["TableName"]>, TableAggregateNamespace<T>>.constructor
```

#### Methods

##### count()

```ts
count(ctx, ...opts): Promise<number>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:37

Counts items between the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`number`\>

###### Inherited from

```ts
Aggregate.count
```

##### countBatch()

```ts
countBatch(ctx, queries): Promise<number[]>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:43

Batch version of count() - counts items for multiple bounds in a single call.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `queries` | `NamespacedOptsBatch`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`number`[]\>

###### Inherited from

```ts
Aggregate.countBatch
```

##### sum()

```ts
sum(ctx, ...opts): Promise<number>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:49

Adds up the sumValue of items between the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`number`\>

###### Inherited from

```ts
Aggregate.sum
```

##### sumBatch()

```ts
sumBatch(ctx, queries): Promise<number[]>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:55

Batch version of sum() - sums items for multiple bounds in a single call.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `queries` | `NamespacedOptsBatch`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`number`[]\>

###### Inherited from

```ts
Aggregate.sumBatch
```

##### at()

```ts
at(
   ctx, 
   offset, ...
opts): Promise<Item<T["Key"], Id<T["TableName"]>>>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:66

Returns the item at the given offset/index/rank in the order of key,
within the bounds. Zero-indexed, so at(0) is the smallest key within the
bounds.

If offset is negative, it counts from the end of the list, so at(-1) is the
item with the largest key within the bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `offset` | `number` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>\>

###### Inherited from

```ts
Aggregate.at
```

##### atBatch()

```ts
atBatch(ctx, queries): Promise<Item<T["Key"], Id<T["TableName"]>>[]>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:72

Batch version of at() - returns items at multiple offsets in a single call.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `queries` | `NamespacedOptsBatch`\<\{ `offset`: `number`; `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>[]\>

###### Inherited from

```ts
Aggregate.atBatch
```

##### indexOf()

```ts
indexOf(
   ctx, 
   key, ...
opts): Promise<number>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:83

Returns the rank/offset/index of the given key, within the bounds.
Specifically, it returns the index of the first item with

- key >= the given key if `order` is "asc" (default)
- key <= the given key if `order` is "desc"

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `key` | `T`\[`"Key"`\] |
| ...`opts` | `NamespacedOpts`\<\{ `id?`: `Id`\<`T`\[`"TableName"`\]\>; `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `order?`: `"asc"` \| `"desc"`; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`number`\>

###### Inherited from

```ts
Aggregate.indexOf
```

##### ~~offsetOf()~~

```ts
offsetOf(
   ctx, 
   key, 
   namespace, 
   id?, 
bounds?): Promise<number>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:91

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `key` | `T`\[`"Key"`\] |
| `namespace` | `TableAggregateNamespace` |
| `id?` | `Id`\<`T`\[`"TableName"`\]\> |
| `bounds?` | `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\> |

###### Returns

`Promise`\<`number`\>

###### Deprecated

Use `indexOf` instead.

###### Inherited from

```ts
Aggregate.offsetOf
```

##### ~~offsetUntil()~~

```ts
offsetUntil(
   ctx, 
   key, 
   namespace, 
   id?, 
bounds?): Promise<number>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:95

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `key` | `T`\[`"Key"`\] |
| `namespace` | `TableAggregateNamespace` |
| `id?` | `Id`\<`T`\[`"TableName"`\]\> |
| `bounds?` | `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\> |

###### Returns

`Promise`\<`number`\>

###### Deprecated

Use `indexOf` instead.

###### Inherited from

```ts
Aggregate.offsetUntil
```

##### min()

```ts
min(ctx, ...opts): Promise<Item<T["Key"], Id<T["TableName"]>> | null>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:99

Gets the minimum item within the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\> \| `null`\>

###### Inherited from

```ts
Aggregate.min
```

##### max()

```ts
max(ctx, ...opts): Promise<Item<T["Key"], Id<T["TableName"]>> | null>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:105

Gets the maximum item within the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\> \| `null`\>

###### Inherited from

```ts
Aggregate.max
```

##### random()

```ts
random(ctx, ...opts): Promise<Item<T["Key"], Id<T["TableName"]>> | null>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:111

Gets a uniformly random item within the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\> \| `null`\>

###### Inherited from

```ts
Aggregate.random
```

##### paginate()

```ts
paginate(ctx, ...opts): Promise<{
  page: Item<T["Key"], Id<T["TableName"]>>[];
  cursor: string;
  isDone: boolean;
}>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:118

Get a page of items between the given bounds, with a cursor to paginate.
Use `iter` to iterate over all items within the bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `cursor?`: `string`; `order?`: `"asc"` \| `"desc"`; `pageSize?`: `number`; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<\{
  `page`: `Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>[];
  `cursor`: `string`;
  `isDone`: `boolean`;
\}\>

###### Inherited from

```ts
Aggregate.paginate
```

##### iter()

```ts
iter(ctx, ...opts): AsyncGenerator<Item<T["Key"], Id<T["TableName"]>>, void, undefined>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:136

Example usage:
```ts
for await (const item of aggregate.iter(ctx, bounds)) {
  console.log(item);
}
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `order?`: `"asc"` \| `"desc"`; `pageSize?`: `number`; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`AsyncGenerator`\<`Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>, `void`, `undefined`\>

###### Inherited from

```ts
Aggregate.iter
```

##### \_insert()

```ts
_insert(
   ctx, 
   namespace, 
   key, 
   id, 
summand?): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:142

Write operations. See DirectAggregate for docstrings.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate._insert
```

##### \_delete()

```ts
_delete(
   ctx, 
   namespace, 
   key, 
id): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:143

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate._delete
```

##### \_replace()

```ts
_replace(
   ctx, 
   currentNamespace, 
   currentKey, 
   newNamespace, 
   newKey, 
   id, 
summand?): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:144

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `currentNamespace` | `TableAggregateNamespace` |
| `currentKey` | `T`\[`"Key"`\] |
| `newNamespace` | `TableAggregateNamespace` |
| `newKey` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate._replace
```

##### \_insertIfDoesNotExist()

```ts
_insertIfDoesNotExist(
   ctx, 
   namespace, 
   key, 
   id, 
summand?): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:145

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate._insertIfDoesNotExist
```

##### \_deleteIfExists()

```ts
_deleteIfExists(
   ctx, 
   namespace, 
   key, 
id): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:146

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate._deleteIfExists
```

##### \_replaceOrInsert()

```ts
_replaceOrInsert(
   ctx, 
   currentNamespace, 
   currentKey, 
   newNamespace, 
   newKey, 
   id, 
summand?): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:147

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `currentNamespace` | `TableAggregateNamespace` |
| `currentKey` | `T`\[`"Key"`\] |
| `newNamespace` | `TableAggregateNamespace` |
| `newKey` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate._replaceOrInsert
```

##### clear()

```ts
clear(ctx, ...opts): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:160

(re-)initialize the data structure, removing all items if it exists.

Change the maxNodeSize if provided, otherwise keep it the same.
  maxNodeSize is how you tune the data structure's width and depth.
  Larger values can reduce write contention but increase read latency.
  Default is 16.
Set rootLazy = false to eagerly compute aggregates on the root node, which
  improves aggregation latency at the expense of making all writes contend
  with each other, so it's only recommended for read-heavy workloads.
  Default is true.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `maxNodeSize?`: `number`; `rootLazy?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate.clear
```

##### makeRootLazy()

```ts
makeRootLazy(ctx, namespace): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:175

If rootLazy is false (the default is true but it can be set to false by
`clear`), the aggregates data structure writes to a single root node on
every insert/delete/replace, which can cause contention.

If your data structure has frequent writes, you can reduce contention by
calling makeRootLazy, which removes the frequent writes to the root node.
With a lazy root node, updates will only contend with other updates to the
same shard of the tree. The number of shards is determined by maxNodeSize,
so larger maxNodeSize can also help.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `namespace` | `TableAggregateNamespace` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate.makeRootLazy
```

##### paginateNamespaces()

```ts
paginateNamespaces(
   ctx, 
   cursor?, 
   pageSize?): Promise<{
  page: TableAggregateNamespace<T>[];
  cursor: string;
  isDone: boolean;
}>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:176

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `cursor?` | `string` |
| `pageSize?` | `number` |

###### Returns

`Promise`\<\{
  `page`: `TableAggregateNamespace`\<`T`\>[];
  `cursor`: `string`;
  `isDone`: `boolean`;
\}\>

###### Inherited from

```ts
Aggregate.paginateNamespaces
```

##### iterNamespaces()

```ts
iterNamespaces(ctx, pageSize?): AsyncGenerator<TableAggregateNamespace<T>, void, undefined>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:181

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `pageSize?` | `number` |

###### Returns

`AsyncGenerator`\<`TableAggregateNamespace`\<`T`\>, `void`, `undefined`\>

###### Inherited from

```ts
Aggregate.iterNamespaces
```

##### clearAll()

```ts
clearAll(ctx, opts?): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:182

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` & `RunQueryCtx` |
| `opts?` | \{ `maxNodeSize?`: `number`; `rootLazy?`: `boolean`; \} |
| `opts.maxNodeSize?` | `number` |
| `opts.rootLazy?` | `boolean` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate.clearAll
```

##### makeAllRootsLazy()

```ts
makeAllRootsLazy(ctx): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:186

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` & `RunQueryCtx` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate.makeAllRootsLazy
```

##### insert()

```ts
insert(ctx, doc): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:282

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |

###### Returns

`Promise`\<`void`\>

##### delete()

```ts
delete(ctx, doc): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:283

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |

###### Returns

`Promise`\<`void`\>

##### replace()

```ts
replace(
   ctx, 
   oldDoc, 
newDoc): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:284

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `oldDoc` | `TableAggregateDocument`\<`T`\> |
| `newDoc` | `TableAggregateDocument`\<`T`\> |

###### Returns

`Promise`\<`void`\>

##### insertIfDoesNotExist()

```ts
insertIfDoesNotExist(ctx, doc): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:285

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |

###### Returns

`Promise`\<`void`\>

##### deleteIfExists()

```ts
deleteIfExists(ctx, doc): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:286

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |

###### Returns

`Promise`\<`void`\>

##### replaceOrInsert()

```ts
replaceOrInsert(
   ctx, 
   oldDoc, 
newDoc): Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:287

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunMutationCtx` |
| `oldDoc` | `TableAggregateDocument`\<`T`\> |
| `newDoc` | `TableAggregateDocument`\<`T`\> |

###### Returns

`Promise`\<`void`\>

##### indexOfDoc()

```ts
indexOfDoc(
   ctx, 
   doc, 
opts?): Promise<number>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:296

Returns the rank/offset/index of the given document, within the bounds.
This differs from `indexOf` in that it take the document rather than key.
Specifically, it returns the index of the first item with

- key >= the given doc's key if `order` is "asc" (default)
- key <= the given doc's key if `order` is "desc"

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `RunQueryCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `id?`: `TableAggregateId`\<`T`\>; `bounds?`: `Bounds`\<`T`\[`"Key"`\], `TableAggregateId`\<`T`\>\>; `order?`: `"asc"` \| `"desc"`; \} |
| `opts.id?` | `TableAggregateId`\<`T`\> |
| `opts.bounds?` | `Bounds`\<`T`\[`"Key"`\], `TableAggregateId`\<`T`\>\> |
| `opts.order?` | `"asc"` \| `"desc"` |

###### Returns

`Promise`\<`number`\>

##### trigger()

```ts
trigger<Ctx>(): TableAggregateTrigger<Ctx, T>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:301

###### Type Parameters

| Type Parameter |
| ------ |
| `Ctx` *extends* `RunMutationCtx` |

###### Returns

`TableAggregateTrigger`\<`Ctx`, `T`\>

##### idempotentTrigger()

```ts
idempotentTrigger<Ctx>(): TableAggregateTrigger<Ctx, T>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:302

###### Type Parameters

| Type Parameter |
| ------ |
| `Ctx` *extends* `RunMutationCtx` |

###### Returns

`TableAggregateTrigger`\<`Ctx`, `T`\>

***

### Triggers

Defined in: nuxt-backend/node\_modules/convex-helpers/server/triggers.d.ts:43

Construct Triggers to register functions that run whenever a table changes.
Sample usage:

```
import { mutation as rawMutation } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";

const triggers = new Triggers<DataModel>();
triggers.register("myTableName", async (ctx, change) => {
  console.log("Table changed", change);
});

// Use `mutation` to define all mutations, and the triggers will get called.
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
```

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `DataModel` *extends* `GenericDataModel` | - |
| `Ctx` *extends* \{ `db`: `GenericDatabaseWriter`\<`DataModel`\>; \} | `GenericMutationCtx`\<`DataModel`\> |

#### Constructors

##### Constructor

```ts
new Triggers<DataModel, Ctx>(): Triggers<DataModel, Ctx>;
```

###### Returns

[`Triggers`](#triggers)\<`DataModel`, `Ctx`\>

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="registered"></a> `registered` | `{ [TableName in string]?: Trigger<Ctx, DataModel, TableName>[] }` | nuxt-backend/node\_modules/convex-helpers/server/triggers.d.ts:46 |
| <a id="wrapdb"></a> `wrapDB` | \<`C`\>(`ctx`) => `C` | nuxt-backend/node\_modules/convex-helpers/server/triggers.d.ts:50 |

#### Methods

##### register()

```ts
register<TableName>(tableName, trigger): void;
```

Defined in: nuxt-backend/node\_modules/convex-helpers/server/triggers.d.ts:49

###### Type Parameters

| Type Parameter |
| ------ |
| `TableName` *extends* `string` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `tableName` | `TableName` |
| `trigger` | `Trigger`\<`Ctx`, `DataModel`, `TableName`\> |

###### Returns

`void`

## Type Aliases

### TableAggregateType

```ts
type TableAggregateType<K, DataModel, TableName, Namespace> = {
  Key: K;
  DataModel: DataModel;
  TableName: TableName;
  Namespace?: Namespace;
};
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:261

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `K` *extends* `Key` | - |
| `DataModel` *extends* `GenericDataModel` | - |
| `TableName` *extends* `TableNamesInDataModel`\<`DataModel`\> | - |
| `Namespace` *extends* `ConvexValue` \| `undefined` | `undefined` |

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="key"></a> `Key` | `K` | nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:262 |
| <a id="datamodel-1"></a> `DataModel` | `DataModel` | nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:263 |
| <a id="tablename-1"></a> `TableName` | `TableName` | nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:264 |
| <a id="namespace-1"></a> `Namespace?` | `Namespace` | nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:265 |

***

### Trigger

```ts
type Trigger<Ctx, DataModel, TableName> = (ctx, change) => Promise<void>;
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:304

#### Type Parameters

| Type Parameter |
| ------ |
| `Ctx` |
| `DataModel` *extends* `GenericDataModel` |
| `TableName` *extends* `TableNamesInDataModel`\<`DataModel`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `Ctx` |
| `change` | [`Change`](#change)\<`DataModel`, `TableName`\> |

#### Returns

`Promise`\<`void`\>

***

### Change

```ts
type Change<DataModel, TableName> = {
  id: GenericId<TableName>;
} & 
  | {
  operation: "insert";
  oldDoc: null;
  newDoc: DocumentByName<DataModel, TableName>;
}
  | {
  operation: "update";
  oldDoc: DocumentByName<DataModel, TableName>;
  newDoc: DocumentByName<DataModel, TableName>;
}
  | {
  operation: "delete";
  oldDoc: DocumentByName<DataModel, TableName>;
  newDoc: null;
};
```

Defined in: nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:305

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `GenericId`\<`TableName`\> | nuxt-backend/node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:306 |

#### Type Parameters

| Type Parameter |
| ------ |
| `DataModel` *extends* `GenericDataModel` |
| `TableName` *extends* `TableNamesInDataModel`\<`DataModel`\> |

## Functions

### customCtx()

```ts
function customCtx<InCtx, OutCtx, ExtraArgs>(modifyCtx): Customization<InCtx, Record<string, never>, OutCtx, Record<string, never>, ExtraArgs>;
```

Defined in: nuxt-backend/node\_modules/convex-helpers/server/customFunctions.d.ts:114

A helper for defining a Customization when your mod doesn't need to add or remove
anything from args.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `InCtx` *extends* `Record`\<`string`, `any`\> | - |
| `OutCtx` *extends* `Record`\<`string`, `any`\> | - |
| `ExtraArgs` *extends* `Record`\<`string`, `any`\> | `Record`\<`string`, `any`\> |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `modifyCtx` | (`original`, `extra`) => `OutCtx` \| `Promise`\<`OutCtx`\> | A function that defines how to modify the ctx. |

#### Returns

`Customization`\<`InCtx`, `Record`\<`string`, `never`\>, `OutCtx`, `Record`\<`string`, `never`\>, `ExtraArgs`\>

A ctx delta to be applied to the original ctx.

***

### customMutation()

```ts
function customMutation<CustomArgsValidator, CustomCtx, CustomMadeArgs, Visibility, DataModel, ExtraArgs>(mutation, customization): CustomBuilder<"mutation", CustomArgsValidator, CustomCtx, CustomMadeArgs, GenericMutationCtx<DataModel>, Visibility, ExtraArgs>;
```

Defined in: nuxt-backend/node\_modules/convex-helpers/server/customFunctions.d.ts:246

customMutation helps define custom behavior on top of `mutation`
or `internalMutation` by passing a function that modifies the ctx and args.

Example usage:
```js
const myMutationBuilder = customMutation(mutation, {
  args: { sessionId: v.id("sessions") },
  input: async (ctx, args) => {
    const user = await getUserOrNull(ctx);
    const session = await db.get(sessionId);
    const db = wrapDatabaseReader({ user }, ctx.db, rlsRules);
    return {
      ctx: { db, user, session },
      args: {},
      onSuccess: ({ result }) => {
        // Optional callback that runs after the function executes
        // Has access to resources created during input processing
        console.log(`User ${user.name} returned:`, result);
      }
    };
  },
});

// Using the custom builder
export const setSomeData = myMutationBuilder({
  args: { someArg: v.string() },
  handler: async (ctx, args) => {
    const { db, user, session, scheduler } = ctx;
    const { someArg } = args;
    // ...
  }
});
```

Simple usage only modifying ctx:
```js
const myUserMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    return {
      // Throws an exception if the user isn't logged in
      user: await getUserByTokenIdentifier(ctx),
    };
  })
);

// Using it
export const setMyName = myUserMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(ctx.user._id, { name: args.name });
  },
});

@param mutation The mutation to be modified. Usually `mutation` or `internalMutation`
  from `_generated/server`.
@param customization The modifier to be applied to the mutation, changing ctx and args.
@returns A new mutation builder to define queries with modified ctx and args.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `CustomArgsValidator` *extends* `PropertyValidators` | - |
| `CustomCtx` *extends* `Record`\<`string`, `any`\> | - |
| `CustomMadeArgs` *extends* `Record`\<`string`, `any`\> | - |
| `Visibility` *extends* `FunctionVisibility` | - |
| `DataModel` *extends* `GenericDataModel` | - |
| `ExtraArgs` *extends* `Record`\<`string`, `any`\> | `object` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mutation` | `MutationBuilder`\<`DataModel`, `Visibility`\> |
| `customization` | `Customization`\<`GenericMutationCtx`\<`DataModel`\>, `CustomArgsValidator`, `CustomCtx`, `CustomMadeArgs`, `ExtraArgs`\> |

#### Returns

`CustomBuilder`\<`"mutation"`, `CustomArgsValidator`, `CustomCtx`, `CustomMadeArgs`, `GenericMutationCtx`\<`DataModel`\>, `Visibility`, `ExtraArgs`\>

***

### withTriggers()

```ts
function withTriggers<DataModel, Visibility>(rawMutation, triggers): CustomBuilder<"mutation", Record<string, never>, GenericMutationCtx<DataModel>, Record<string, never>, GenericMutationCtx<DataModel>, Visibility, Record<string, any>>;
```

Defined in: [nuxt-backend/src/convex/integrations/aggregate.ts:39](https://github.com/qruto/nuxt-backend/blob/0ca7dc0bc2b050c604e1acc44d383bd91f834a8a/src/convex/integrations/aggregate.ts#L39)

Wrap a raw `mutation`/`internalMutation` builder so every write
automatically fires the registered [Triggers](#triggers) (e.g. to keep a
`TableAggregate` in sync) — no manual `insert`/`delete`/`replace` calls.

#### Type Parameters

| Type Parameter |
| ------ |
| `DataModel` *extends* `GenericDataModel` |
| `Visibility` *extends* `FunctionVisibility` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rawMutation` | `MutationBuilder`\<`DataModel`, `Visibility`\> |
| `triggers` | [`Triggers`](#triggers)\<`DataModel`\> |

#### Returns

`CustomBuilder`\<`"mutation"`, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DataModel`\>, `Record`\<`string`, `never`\>, `GenericMutationCtx`\<`DataModel`\>, `Visibility`, `Record`\<`string`, `any`\>\>

#### Example

```ts
import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/convex/aggregate'
import { components } from './_generated/api'
import { mutation as rawMutation } from './_generated/server'
import type { DataModel } from './_generated/dataModel'

export const messagesCount = new TableAggregate<{ Key: null, DataModel: DataModel, TableName: 'messages' }>(
  components.messagesCount,
  { sortKey: () => null },
)

const triggers = new Triggers<DataModel>()
triggers.register('messages', messagesCount.trigger())

export const mutation = withTriggers(rawMutation, triggers)
```
