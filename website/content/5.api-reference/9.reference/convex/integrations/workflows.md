---
navigation: true
---

# convex/integrations/workflows

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

Defined in: node\_modules/@convex-dev/workflow/dist/client/index.d.ts:51

Re-exported so consumers can type a `status` query's `workflowId` arg and
cast a stored id back to a [WorkflowId](#workflowid) (it is a branded string).

***

### WorkflowId

```ts
type WorkflowId = string & {
  __isWorkflowId: true;
};
```

Defined in: node\_modules/@convex-dev/workflow/dist/types.d.ts:4

Re-exported so consumers can type a `status` query's `workflowId` arg and
cast a stored id back to a [WorkflowId](#workflowid) (it is a branded string).

#### Type Declaration

| Name | Type | Defined in |
| ------ | ------ | ------ |
| `__isWorkflowId` | `true` | node\_modules/@convex-dev/workflow/dist/types.d.ts:5 |

## Functions

### setupWorkflows()

```ts
function setupWorkflows(component, options?): WorkflowManager;
```

Defined in: [src/convex/integrations/workflows.ts:48](https://github.com/qruto/nuxt-backend/blob/29eb1bb20af4070302c37e8b8e2907a04791a76a/src/convex/integrations/workflows.ts#L48)

Configure the [Workflow](https://www.convex.dev/components/workflow)
component for durable, long-running, multi-step functions. Your overrides are
merged onto DEFAULT\_WORKPOOL\_OPTIONS.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `component` | `WorkflowComponent` |
| `options?` | \{ `workpoolOptions?`: `WorkpoolOptions`; \} |
| `options.workpoolOptions?` | `WorkpoolOptions` |

#### Returns

`WorkflowManager`

#### Example

```ts
import { setupWorkflows } from 'nuxt-backend/convex/workflows'
import { components } from './_generated/api'

export const workflow = setupWorkflows(components.workflow)

export const onSignup = workflow.define({
  args: { email: v.string(), name: v.string() },
  handler: async (step, { email, name }) => {
    // Email is sent through the Resend component nested inside `backend`.
    await step.runMutation(components.backend.email.send, {
      to: email,
      subject: 'Welcome!',
      html: `<p>Welcome aboard, ${name}!</p>`,
    })
  },
})
```
