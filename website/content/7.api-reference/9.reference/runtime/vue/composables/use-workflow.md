---
navigation: true
---

# runtime/vue/composables/use-workflow

## Functions

### useWorkflowStatus()

```ts
function useWorkflowStatus<Query>(query, workflowId): ComputedRef<FunctionReturnType<Query> | undefined>;
```

Defined in: [src/runtime/vue/composables/use-workflow.ts:25](https://github.com/qruto/nuxt-backend/blob/main/src/runtime/vue/composables/use-workflow.ts#L25)

**`Experimental`**

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

 Tracks the upstream workflow component's status shape, which
is still pre-1.0; may change in a minor release (see STABILITY.md).
