---
navigation: true
---

# convex/integrations/migrations

## Interfaces

### MigrationsComponents

Defined in: [nuxt-backend/src/convex/integrations/migrations.ts:11](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L11)

The component handle `setupMigrations` reads from your generated `components`
object (the key is picked structurally — pass the whole object).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="migrations"></a> `migrations` | `ComponentApi` | [nuxt-backend/src/convex/integrations/migrations.ts:12](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L12) |

***

### SetupMigrationsOptions

Defined in: [nuxt-backend/src/convex/integrations/migrations.ts:16](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L16)

#### Type Parameters

| Type Parameter |
| ------ |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `boolean`\> \| `void` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="schema-1"></a> `schema?` | `Schema` | Your database schema. Recommended — it provides table types to `migrations.define({ table, migrateOne })` and enables custom index ranges. | [nuxt-backend/src/convex/integrations/migrations.ts:21](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L21) |
| <a id="defaultbatchsize"></a> `defaultBatchSize?` | `number` | Documents processed per transaction batch (default 100). | [nuxt-backend/src/convex/integrations/migrations.ts:23](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L23) |
| <a id="migrationslocationprefix"></a> `migrationsLocationPrefix?` | `string` | Prefix added to function names when running migrations from the CLI. | [nuxt-backend/src/convex/integrations/migrations.ts:25](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L25) |

## Functions

### setupMigrations()

```ts
function setupMigrations<Schema>(components, options?): {
  migrations: Migrations<GenericDataModel, Schema, Schema extends SchemaDefinition<any, boolean> ? MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<IdField<TableName> & Expand<(...) & (...)>>; fieldPaths: "_id" | ExtractFieldPaths<DocumentType>; indexes: Expand<Indexes & SystemIndexes>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]> : GenericDataModel>;
  run: RegisteredMutation<"internal", {
     fn?: string;
     cursor?: string | null;
     batchSize?: number;
     dryRun?: boolean;
     next?: string[];
     reset?: boolean;
     oneBatchOnly?: boolean;
  }, Promise<Record<string, unknown>>>;
};
```

Defined in: [nuxt-backend/src/convex/integrations/migrations.ts:52](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L52)

Configure the [Migrations](https://www.convex.dev/components/migrations)
component for safe, online, batched schema migrations.

Returns the `migrations` instance (use `migrations.define({ table, migrateOne })`)
and a generic `run` runner to invoke any migration from the CLI/dashboard.

Pass your `schema` so `define()` gets table types. If you need to supply the
`internalMutation` builder instead, construct `Migrations` directly.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `Schema` *extends* `void` \| `SchemaDefinition`\<`GenericSchema`, `boolean`\> | `void` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`MigrationsComponents`](#migrationscomponents) |
| `options?` | [`SetupMigrationsOptions`](#setupmigrationsoptions)\<`Schema`\> |

#### Returns

```ts
{
  migrations: Migrations<GenericDataModel, Schema, Schema extends SchemaDefinition<any, boolean> ? MaybeMakeLooseDataModel<{ [TableName in string]: Schema["tables"][TableName] extends TableDefinition<DocumentType, Indexes, SearchIndexes, VectorIndexes> ? { document: Expand<IdField<TableName> & Expand<(...) & (...)>>; fieldPaths: "_id" | ExtractFieldPaths<DocumentType>; indexes: Expand<Indexes & SystemIndexes>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes } : never }, Schema["strictTableNameTypes"]> : GenericDataModel>;
  run: RegisteredMutation<"internal", {
     fn?: string;
     cursor?: string | null;
     batchSize?: number;
     dryRun?: boolean;
     next?: string[];
     reset?: boolean;
     oneBatchOnly?: boolean;
  }, Promise<Record<string, unknown>>>;
}
```

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `migrations` | `Migrations`\<`GenericDataModel`, `Schema`, `Schema` *extends* `SchemaDefinition`\<`any`, `boolean`\> ? `MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: Schema\["tables"\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<IdField\<TableName\> & Expand\<(...) & (...)\>\>; fieldPaths: "\_id" \| ExtractFieldPaths\<DocumentType\>; indexes: Expand\<Indexes & SystemIndexes\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\> : `GenericDataModel`\> | [nuxt-backend/src/convex/integrations/migrations.ts:60](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L60) |
| `run` | `RegisteredMutation`\<`"internal"`, \{ `fn?`: `string`; `cursor?`: `string` \| `null`; `batchSize?`: `number`; `dryRun?`: `boolean`; `next?`: `string`[]; `reset?`: `boolean`; `oneBatchOnly?`: `boolean`; \}, `Promise`\<`Record`\<`string`, `unknown`\>\>\> | [nuxt-backend/src/convex/integrations/migrations.ts:60](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/migrations.ts#L60) |

#### Example

```ts
import { setupMigrations } from 'nuxt-backend/migrations'
import { components } from './_generated/api'
import schema from './schema'

export const { migrations, run } = setupMigrations(components, { schema })

export const backfillCompleted = migrations.define({
  table: 'todos',
  migrateOne: (_ctx, todo) => (todo.completed === undefined ? { completed: false } : undefined),
})
```
