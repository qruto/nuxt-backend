---
navigation: true
---

# convex/integrations/migrations

## Interfaces

### SetupMigrationsOptions

Defined in: [src/convex/integrations/migrations.ts:8](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/migrations.ts#L8)

#### Type Parameters

| Type Parameter |
| ------ |
| `Schema` *extends* `SchemaDefinition`\<`GenericSchema`, `boolean`\> \| `void` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="schema-1"></a> `schema?` | `Schema` | Your database schema. Recommended — it provides table types to `migrations.define({ table, migrateOne })` and enables custom index ranges. | [src/convex/integrations/migrations.ts:13](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/migrations.ts#L13) |
| <a id="defaultbatchsize"></a> `defaultBatchSize?` | `number` | Documents processed per transaction batch (default 100). | [src/convex/integrations/migrations.ts:15](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/migrations.ts#L15) |
| <a id="migrationslocationprefix"></a> `migrationsLocationPrefix?` | `string` | Prefix added to function names when running migrations from the CLI. | [src/convex/integrations/migrations.ts:17](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/migrations.ts#L17) |

## Functions

### setupMigrations()

```ts
function setupMigrations<Schema>(component, options?): {
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

Defined in: [src/convex/integrations/migrations.ts:44](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/migrations.ts#L44)

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
| `component` | `ComponentApi` |
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
| `migrations` | `Migrations`\<`GenericDataModel`, `Schema`, `Schema` *extends* `SchemaDefinition`\<`any`, `boolean`\> ? `MaybeMakeLooseDataModel`\<\{ \[TableName in string\]: Schema\["tables"\]\[TableName\] extends TableDefinition\<DocumentType, Indexes, SearchIndexes, VectorIndexes\> ? \{ document: Expand\<IdField\<TableName\> & Expand\<(...) & (...)\>\>; fieldPaths: "\_id" \| ExtractFieldPaths\<DocumentType\>; indexes: Expand\<Indexes & SystemIndexes\>; searchIndexes: SearchIndexes; vectorIndexes: VectorIndexes \} : never \}, `Schema`\[`"strictTableNameTypes"`\]\> : `GenericDataModel`\> | [src/convex/integrations/migrations.ts:52](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/migrations.ts#L52) |
| `run` | `RegisteredMutation`\<`"internal"`, \{ `fn?`: `string`; `cursor?`: `string` \| `null`; `batchSize?`: `number`; `dryRun?`: `boolean`; `next?`: `string`[]; `reset?`: `boolean`; `oneBatchOnly?`: `boolean`; \}, `Promise`\<`Record`\<`string`, `unknown`\>\>\> | [src/convex/integrations/migrations.ts:52](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/migrations.ts#L52) |

#### Example

```ts
import { setupMigrations } from 'nuxt-backend/convex/migrations'
import { components } from './_generated/api'
import schema from './schema'

export const { migrations, run } = setupMigrations(components.migrations, { schema })

export const backfillCompleted = migrations.define({
  table: 'todos',
  migrateOne: (_ctx, todo) => (todo.completed === undefined ? { completed: false } : undefined),
})
```
