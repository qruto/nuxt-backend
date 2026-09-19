---
navigation: true
---

# convex/integrations/aggregate

## Classes

### TableAggregate

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:390

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:392

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:83

Counts items between the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`number`\>

###### Inherited from

```ts
Aggregate.count
```

##### countBatch()

```ts
countBatch(
   ctx, 
   queries, 
   opts?
): Promise<number[]>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:90

Batch version of count() - counts items for multiple bounds in a single call.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `queries` | `NamespacedOptsBatch`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |
| `opts?` | \{ `stale?`: `boolean`; \} |
| `opts.stale?` | `boolean` |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:98

Adds up the sumValue of items between the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`number`\>

###### Inherited from

```ts
Aggregate.sum
```

##### sumBatch()

```ts
sumBatch(
   ctx, 
   queries, 
   opts?
): Promise<number[]>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:105

Batch version of sum() - sums items for multiple bounds in a single call.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `queries` | `NamespacedOptsBatch`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |
| `opts?` | \{ `stale?`: `boolean`; \} |
| `opts.stale?` | `boolean` |

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
   offset, 
   ...opts
): Promise<Item<T["Key"], Id<T["TableName"]>>>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:118

Returns the item at the given offset/index/rank in the order of key,
within the bounds. Zero-indexed, so at(0) is the smallest key within the
bounds.

If offset is negative, it counts from the end of the list, so at(-1) is the
item with the largest key within the bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `offset` | `number` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

###### Returns

`Promise`\<`Item`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>\>

###### Inherited from

```ts
Aggregate.at
```

##### atBatch()

```ts
atBatch(
   ctx, 
   queries, 
   opts?
): Promise<Item<T["Key"], Id<T["TableName"]>>[]>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:125

Batch version of at() - returns items at multiple offsets in a single call.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `queries` | `NamespacedOptsBatch`\<\{ `offset`: `number`; `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; \}, `TableAggregateNamespace`\<`T`\>\> |
| `opts?` | \{ `stale?`: `boolean`; \} |
| `opts.stale?` | `boolean` |

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
   key, 
   ...opts
): Promise<number>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:138

Returns the rank/offset/index of the given key, within the bounds.
Specifically, it returns the index of the first item with

- key >= the given key if `order` is "asc" (default)
- key <= the given key if `order` is "desc"

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `key` | `T`\[`"Key"`\] |
| ...`opts` | `NamespacedOpts`\<\{ `id?`: `Id`\<`T`\[`"TableName"`\]\>; `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `order?`: `"asc"` \| `"desc"`; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

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
   bounds?, 
   stale?
): Promise<number>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:147

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `key` | `T`\[`"Key"`\] |
| `namespace` | `TableAggregateNamespace` |
| `id?` | `Id`\<`T`\[`"TableName"`\]\> |
| `bounds?` | `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\> |
| `stale?` | `boolean` |

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
   bounds?, 
   stale?
): Promise<number>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:151

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `key` | `T`\[`"Key"`\] |
| `namespace` | `TableAggregateNamespace` |
| `id?` | `Id`\<`T`\[`"TableName"`\]\> |
| `bounds?` | `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\> |
| `stale?` | `boolean` |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:155

Gets the minimum item within the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:162

Gets the maximum item within the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:169

Gets a uniformly random item within the given bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:177

Get a page of items between the given bounds, with a cursor to paginate.
Use `iter` to iterate over all items within the bounds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `cursor?`: `string`; `order?`: `"asc"` \| `"desc"`; `pageSize?`: `number`; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:196

Example usage:
```ts
for await (const item of aggregate.iter(ctx, bounds)) {
  console.log(item);
}
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| ...`opts` | `NamespacedOpts`\<\{ `bounds?`: `Bounds`\<`T`\[`"Key"`\], `Id`\<`T`\[`"TableName"`\]\>\>; `order?`: `"asc"` \| `"desc"`; `pageSize?`: `number`; `stale?`: `boolean`; \}, `TableAggregateNamespace`\<`T`\>\> |

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
   summand?, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:203

Write operations. See DirectAggregate for docstrings.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

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
   id, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:206

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

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
   summand?, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:209

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `currentNamespace` | `TableAggregateNamespace` |
| `currentKey` | `T`\[`"Key"`\] |
| `newNamespace` | `TableAggregateNamespace` |
| `newKey` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

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
   summand?, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:212

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

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
   id, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:215

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `namespace` | `TableAggregateNamespace` |
| `key` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

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
   summand?, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:218

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `currentNamespace` | `TableAggregateNamespace` |
| `currentKey` | `T`\[`"Key"`\] |
| `newNamespace` | `TableAggregateNamespace` |
| `newKey` | `T`\[`"Key"`\] |
| `id` | `Id` |
| `summand?` | `number` |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:233

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
| `ctx` | `MutationCtx` \| `ActionCtx` |
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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:248

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
| `ctx` | `MutationCtx` \| `ActionCtx` |
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
   pageSize?, 
   stale?
): Promise<{
  page: TableAggregateNamespace<T>[];
  cursor: string;
  isDone: boolean;
}>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:249

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `cursor?` | `string` |
| `pageSize?` | `number` |
| `stale?` | `boolean` |

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
iterNamespaces(
   ctx, 
   pageSize?, 
   stale?
): AsyncGenerator<TableAggregateNamespace<T>, void, undefined>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:254

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `pageSize?` | `number` |
| `stale?` | `boolean` |

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:255

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:259

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |

###### Returns

`Promise`\<`void`\>

###### Inherited from

```ts
Aggregate.makeAllRootsLazy
```

##### enqueueBatch()

```ts
enqueueBatch(ctx, operations): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:408

Enqueue a batch of writes, to be applied asynchronously by the batch
worker.

Equivalent to calling the individual write methods with `{ async: true }`,
except that the whole batch is sent to the component in a single call.
The operations are applied in the order they are given.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `operations` | `TableAggregateOperation`\<`T`\>[] |

###### Returns

`Promise`\<`void`\>

##### insert()

```ts
insert(
   ctx, 
   doc, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:410

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`Promise`\<`void`\>

##### delete()

```ts
delete(
   ctx, 
   doc, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:413

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`Promise`\<`void`\>

##### replace()

```ts
replace(
   ctx, 
   oldDoc, 
   newDoc, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:416

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `oldDoc` | `TableAggregateDocument`\<`T`\> |
| `newDoc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`Promise`\<`void`\>

##### insertIfDoesNotExist()

```ts
insertIfDoesNotExist(
   ctx, 
   doc, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:419

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`Promise`\<`void`\>

##### deleteIfExists()

```ts
deleteIfExists(
   ctx, 
   doc, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:422

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`Promise`\<`void`\>

##### replaceOrInsert()

```ts
replaceOrInsert(
   ctx, 
   oldDoc, 
   newDoc, 
   opts?
): Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:425

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` |
| `oldDoc` | `TableAggregateDocument`\<`T`\> |
| `newDoc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`Promise`\<`void`\>

##### indexOfDoc()

```ts
indexOfDoc(
   ctx, 
   doc, 
   opts?
): Promise<number>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:436

Returns the rank/offset/index of the given document, within the bounds.
This differs from `indexOf` in that it take the document rather than key.
Specifically, it returns the index of the first item with

- key >= the given doc's key if `order` is "asc" (default)
- key <= the given doc's key if `order` is "desc"

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `MutationCtx` \| `ActionCtx` \| `QueryCtx` |
| `doc` | `TableAggregateDocument`\<`T`\> |
| `opts?` | \{ `id?`: `TableAggregateId`\<`T`\>; `bounds?`: `Bounds`\<`T`\[`"Key"`\], `TableAggregateId`\<`T`\>\>; `order?`: `"asc"` \| `"desc"`; `stale?`: `boolean`; \} |
| `opts.id?` | `TableAggregateId`\<`T`\> |
| `opts.bounds?` | `Bounds`\<`T`\[`"Key"`\], `TableAggregateId`\<`T`\>\> |
| `opts.order?` | `"asc"` \| `"desc"` |
| `opts.stale?` | `boolean` |

###### Returns

`Promise`\<`number`\>

##### trigger()

```ts
trigger<Ctx>(opts?): TableAggregateTrigger<Ctx, T>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:442

###### Type Parameters

| Type Parameter |
| ------ |
| `Ctx` *extends* `MutationCtx` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`TableAggregateTrigger`\<`Ctx`, `T`\>

##### idempotentTrigger()

```ts
idempotentTrigger<Ctx>(opts?): TableAggregateTrigger<Ctx, T>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:445

###### Type Parameters

| Type Parameter |
| ------ |
| `Ctx` *extends* `MutationCtx` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | \{ `async?`: `boolean`; \} |
| `opts.async?` | `boolean` |

###### Returns

`TableAggregateTrigger`\<`Ctx`, `T`\>

***

### Triggers

Defined in: node\_modules/convex-helpers/server/triggers.d.ts:43

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
| <a id="registered"></a> `registered` | `{ [TableName in string]?: Trigger<Ctx, DataModel, TableName>[] }` | node\_modules/convex-helpers/server/triggers.d.ts:46 |
| <a id="wrapdb"></a> `wrapDB` | \<`C`\>(`ctx`) => `C` | node\_modules/convex-helpers/server/triggers.d.ts:50 |

#### Methods

##### register()

```ts
register<TableName>(tableName, trigger): void;
```

Defined in: node\_modules/convex-helpers/server/triggers.d.ts:49

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:355

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
| <a id="key"></a> `Key` | `K` | node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:356 |
| <a id="datamodel-1"></a> `DataModel` | `DataModel` | node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:357 |
| <a id="tablename-1"></a> `TableName` | `TableName` | node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:358 |
| <a id="namespace-1"></a> `Namespace?` | `Namespace` | node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:359 |

***

### Trigger

```ts
type Trigger<Ctx, DataModel, TableName> = (ctx, change) => Promise<void>;
```

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:449

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

Defined in: node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:450

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `id` | `GenericId`\<`TableName`\> | node\_modules/@convex-dev/aggregate/dist/client/index.d.ts:451 |

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

Defined in: node\_modules/convex-helpers/server/customFunctions.d.ts:114

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

Defined in: node\_modules/convex-helpers/server/customFunctions.d.ts:246

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

Defined in: [src/convex/integrations/aggregate.ts:39](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/aggregate.ts#L39)

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
import { TableAggregate, Triggers, withTriggers } from 'nuxt-backend/aggregate'
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
