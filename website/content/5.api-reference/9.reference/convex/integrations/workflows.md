---
navigation: true
---

# convex/integrations/workflows

## Interfaces

### WorkflowComponents

Defined in: [nuxt-backend/src/convex/integrations/workflows.ts:16](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/workflows.ts#L16)

The component handle `setupWorkflows` reads from your generated `components`
object (the key is picked structurally — pass the whole object).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="workflow"></a> `workflow` | `WorkflowComponent` | [nuxt-backend/src/convex/integrations/workflows.ts:17](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/workflows.ts#L17) |

## Type Aliases

### WorkflowStatus

```ts
type WorkflowStatus = 
  | {
  type: "inProgress";
  running: IdsToStrings<Step>[];
}
  | {
  type: "completed";
  result: unknown;
}
  | {
  type: "canceled";
}
  | {
  type: "failed";
  error: string;
};
```

Defined in: nuxt-backend/node\_modules/@convex-dev/workflow/dist/client/index.d.ts:51

Re-exported so consumers can type a `status` query's `workflowId` arg and
cast a stored id back to a [WorkflowId](#workflowid) (it is a branded string).

***

### WorkflowId

```ts
type WorkflowId = string & {
  __isWorkflowId: true;
};
```

Defined in: nuxt-backend/node\_modules/@convex-dev/workflow/dist/types.d.ts:4

Re-exported so consumers can type a `status` query's `workflowId` arg and
cast a stored id back to a [WorkflowId](#workflowid) (it is a branded string).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `__isWorkflowId` | `true` | nuxt-backend/node\_modules/@convex-dev/workflow/dist/types.d.ts:5 |

## Functions

### setupWorkflows()

```ts
function setupWorkflows(components, options?): WorkflowManager;
```

Defined in: [nuxt-backend/src/convex/integrations/workflows.ts:56](https://github.com/qruto/nuxt-backend/blob/2319feb8b3523db41f3ec9ed6900095e65f4ee42/src/convex/integrations/workflows.ts#L56)

Configure the [Workflow](https://www.convex.dev/components/workflow)
component for durable, long-running, multi-step functions. Your overrides are
merged onto DEFAULT\_WORKPOOL\_OPTIONS.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `components` | [`WorkflowComponents`](#workflowcomponents) |
| `options?` | \{ `workpoolOptions?`: `WorkpoolOptions`; \} |
| `options.workpoolOptions?` | `WorkpoolOptions` |

#### Returns

`WorkflowManager`

#### Example

```ts
import { setupWorkflows } from 'nuxt-backend/workflows'
import { components } from './_generated/api'

export const workflow = setupWorkflows(components)

export const onSignup = workflow.define({
  args: { email: v.string(), name: v.string() },
  handler: async (step, { email, name }) => {
    // Email is sent through the `backend` component's email module.
    await step.runMutation(components.backend.email.send, {
      to: email,
      subject: 'Welcome!',
      html: `<p>Welcome aboard, ${name}!</p>`,
    })
  },
})
```
