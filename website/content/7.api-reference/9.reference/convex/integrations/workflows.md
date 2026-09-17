---
navigation: true
---

# convex/integrations/workflows

## Interfaces

### WorkflowComponents

Defined in: [src/convex/integrations/workflows.ts:17](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/workflows.ts#L17)

The component handle `setupWorkflows` reads from your generated `components`
object (the key is picked structurally — pass the whole object).

#### Properties

| Property | Type | Defined in |
| ------ | ------ | ------ |
| <a id="workflow"></a> `workflow` | `WorkflowComponent` | [src/convex/integrations/workflows.ts:18](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/workflows.ts#L18) |

***

### EmailSequenceStep

Defined in: [src/convex/integrations/workflows.ts:67](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/workflows.ts#L67)

One email in an [defineEmailSequence](#defineemailsequence) drip.

#### Type Parameters

| Type Parameter |
| ------ |
| `Data` |

#### Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="after"></a> `after` | `number` | Delay before this step, in milliseconds from the previous one. | [src/convex/integrations/workflows.ts:69](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/workflows.ts#L69) |
| <a id="email"></a> `email` | (`data`) => \| \{ `to`: `string`; `subject`: `string`; `html?`: `string`; `text?`: `string`; \} \| `null` | Build the email for this step — or return `null` to skip it (e.g. the user already activated and the nudge is moot). | [src/convex/integrations/workflows.ts:74](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/workflows.ts#L74) |

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
function setupWorkflows(components, options?): WorkflowManager;
```

Defined in: [src/convex/integrations/workflows.ts:57](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/workflows.ts#L57)

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

***

### defineEmailSequence()

```ts
function defineEmailSequence<Args>(
   workflow, 
   components, 
   options
): RegisteredMutation<"internal", WorkflowArgs<Args>, WorkflowId>;
```

Defined in: [src/convex/integrations/workflows.ts:108](https://github.com/qruto/nuxt-backend/blob/main/src/convex/integrations/workflows.ts#L108)

A durable, multi-step email sequence (onboarding drips, cancellation
follow-ups): each step sleeps its `after` delay durably (survives restarts
and deploys via the workflow component), then sends through the backend
component's email module — delivery-tracked like every other transactional
email. Cancel a started sequence with the workflow manager's own
`workflow.cancel(ctx, id)`.

#### Type Parameters

| Type Parameter |
| ------ |
| `Args` *extends* `PropertyValidators` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `workflow` | `WorkflowManager` |
| `components` | `SequenceEmailComponents` |
| `options` | \{ `args`: `Args`; `steps`: [`EmailSequenceStep`](#emailsequencestep)\<`ObjectType`\<`Args`\>\>[]; \} |
| `options.args` | `Args` |
| `options.steps` | [`EmailSequenceStep`](#emailsequencestep)\<`ObjectType`\<`Args`\>\>[] |

#### Returns

`RegisteredMutation`\<`"internal"`, `WorkflowArgs`\<`Args`\>, [`WorkflowId`](#workflowid)\>

#### Example

```ts
// backend/workflows.ts
export const onboardingSequence = defineEmailSequence(workflow, components, {
  args: { email: v.string(), name: v.string() },
  steps: [
    { after: 0, email: ({ email, name }) => ({ to: email, subject: `Welcome, ${name}!`, text: '…' }) },
    { after: 3 * 24 * 60 * 60 * 1000, email: ({ email }) => ({ to: email, subject: 'Getting the most out of it', text: '…' }) },
  ],
})
// started from auth's onUserCreated:
//   await workflow.start(ctx, internal.workflows.onboardingSequence, { email, name })
```
