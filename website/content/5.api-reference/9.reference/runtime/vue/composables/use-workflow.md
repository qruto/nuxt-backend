---
navigation: true
---

# runtime/vue/composables/use-workflow

## Functions

### useWorkflowStatus()

```ts
function useWorkflowStatus<Query>(query, workflowId): ComputedRef<FunctionReturnType<Query> | undefined>;
```

Defined in: [nuxt-backend/src/runtime/vue/composables/use-workflow.ts:22](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/runtime/vue/composables/use-workflow.ts#L22)

Reactively track a durable [Workflow](https://www.convex.dev/components/workflow)'s status. Pass a query that takes `{ workflowId }` (wrapping
`workflow.status`) and the id to watch; the subscription pauses while the id
is null/undefined and updates live as the workflow progresses.

#### Type Parameters

| Type Parameter |
| ------ |
| `Query` *extends* `FunctionReference`\<`"query"`\> |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `Query` |
| `workflowId` | `MaybeRefOrGetter`\<`string` \| `null` \| `undefined`\> |

#### Returns

`ComputedRef`\<`FunctionReturnType`\<`Query`\> \| `undefined`\>

#### Example

```vue
<script setup lang="ts">
import { useWorkflowStatus } from '#imports'
import { api } from '#backend/api'

const status = useWorkflowStatus(api.workflows.status, workflowId)
// status.value?.type: 'inProgress' | 'completed' | 'failed' | 'canceled'
</script>
```
