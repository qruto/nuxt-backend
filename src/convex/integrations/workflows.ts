import { WorkflowManager } from '@convex-dev/workflow'

/**
 * Re-exported so consumers can type a `status` query's `workflowId` arg and
 * cast a stored id back to a {@link WorkflowId} (it is a branded string).
 */
export type { WorkflowId, WorkflowStatus } from '@convex-dev/workflow'

/** The component reference accepted by WorkflowManager (`components.workflow`). */
type WorkflowComponent = ConstructorParameters<typeof WorkflowManager>[0]

/**
 * The component handle `setupWorkflows` reads from your generated `components`
 * object (the key is picked structurally — pass the whole object).
 */
export interface WorkflowComponents {
  workflow: WorkflowComponent
}
/** The workpool options bag (`maxParallelism`, `defaultRetryBehavior`, ...). */
type WorkpoolOptions = NonNullable<ConstructorParameters<typeof WorkflowManager>[1]>['workpoolOptions']

/**
 * Sensible defaults: bounded parallelism and exponential-backoff retries so
 * transient failures recover without hammering downstream services.
 */
const DEFAULT_WORKPOOL_OPTIONS = {
  maxParallelism: 10,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
} satisfies WorkpoolOptions

/**
 * Configure the {@link https://www.convex.dev/components/workflow | Workflow}
 * component for durable, long-running, multi-step functions. Your overrides are
 * merged onto {@link DEFAULT_WORKPOOL_OPTIONS}.
 *
 * @example
 * ```ts
 * import { setupWorkflows } from 'nuxt-backend/convex/workflows'
 * import { components } from './_generated/api'
 *
 * export const workflow = setupWorkflows(components)
 *
 * export const onSignup = workflow.define({
 *   args: { email: v.string(), name: v.string() },
 *   handler: async (step, { email, name }) => {
 *     // Email is sent through the `backend` component's email module.
 *     await step.runMutation(components.backend.email.send, {
 *       to: email,
 *       subject: 'Welcome!',
 *       html: `<p>Welcome aboard, ${name}!</p>`,
 *     })
 *   },
 * })
 * ```
 */
export function setupWorkflows(
  components: WorkflowComponents,
  options?: { workpoolOptions?: WorkpoolOptions },
): WorkflowManager {
  return new WorkflowManager(components.workflow, {
    workpoolOptions: { ...DEFAULT_WORKPOOL_OPTIONS, ...options?.workpoolOptions },
  })
}
