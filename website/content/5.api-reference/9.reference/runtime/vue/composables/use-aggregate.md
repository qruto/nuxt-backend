---
navigation: true
---

# runtime/vue/composables/use-aggregate

## Variables

### useCount

```ts
const useCount: <Query>(query, ...args) => ComputedRef<number> = useAggregate;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-aggregate.ts:33](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-aggregate.ts#L33)

Alias of [useAggregate](#useaggregate), for the common count case.

Reactive numeric aggregate (count / sum) backed by a Convex query — typically
one that reads from the [Aggregate](https://www.convex.dev/components/aggregate) component. Coerces the loading/`null` state to `0` so templates can
bind directly.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* `FunctionReference`\<`"query"`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| ...`args` | `OptionalRestArgsOrSkip`\<`Query`\> |

#### Returns

`ComputedRef`\<`number`\>

#### Example

```vue
<script setup lang="ts">
import { useCount } from '#imports'
import { api } from '#backend/api'

const messageCount = useCount(api.aggregates.countMessages)
</script>
```

## Functions

### useAggregate()

```ts
function useAggregate<Query>(query, ...args): ComputedRef<number>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-aggregate.ts:21](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-aggregate.ts#L21)

Reactive numeric aggregate (count / sum) backed by a Convex query — typically
one that reads from the [Aggregate](https://www.convex.dev/components/aggregate) component. Coerces the loading/`null` state to `0` so templates can
bind directly.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* `FunctionReference`\<`"query"`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| ...`args` | `OptionalRestArgsOrSkip`\<`Query`\> |

#### Returns

`ComputedRef`\<`number`\>

#### Example

```vue
<script setup lang="ts">
import { useCount } from '#imports'
import { api } from '#backend/api'

const messageCount = useCount(api.aggregates.countMessages)
</script>
```
