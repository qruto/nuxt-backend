import { WorkflowManager } from '@convex-dev/workflow'
import type { ObjectType, PropertyValidators } from 'convex/values'

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
 * import { setupWorkflows } from 'nuxt-backend/workflows'
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

/** One email in an {@link defineEmailSequence} drip. */
export interface EmailSequenceStep<Data> {
  /** Delay before this step, in milliseconds from the previous one. */
  after: number
  /**
   * Build the email for this step — or return `null` to skip it (e.g. the
   * user already activated and the nudge is moot).
   */
  email: (data: Data) => { to: string, subject: string, html?: string, text?: string } | null
}

/** The email transport shape (`components.backend.email.send`, structurally). */
interface SequenceEmailComponents {
  backend: {
    email: {
      send: unknown
    }
  }
}

/**
 * A durable, multi-step email sequence (onboarding drips, cancellation
 * follow-ups): each step sleeps its `after` delay durably (survives restarts
 * and deploys via the workflow component), then sends through the backend
 * component's email module — delivery-tracked like every other transactional
 * email. Cancel a started sequence with the workflow manager's own
 * `workflow.cancel(ctx, id)`.
 *
 * @example
 * ```ts
 * // backend/workflows.ts
 * export const onboardingSequence = defineEmailSequence(workflow, components, {
 *   args: { email: v.string(), name: v.string() },
 *   steps: [
 *     { after: 0, email: ({ email, name }) => ({ to: email, subject: `Welcome, ${name}!`, text: '…' }) },
 *     { after: 3 * 24 * 60 * 60 * 1000, email: ({ email }) => ({ to: email, subject: 'Getting the most out of it', text: '…' }) },
 *   ],
 * })
 * // started from auth's onUserCreated:
 * //   await workflow.start(ctx, internal.workflows.onboardingSequence, { email, name })
 * ```
 */
export function defineEmailSequence<Args extends PropertyValidators>(
  workflow: WorkflowManager,
  components: SequenceEmailComponents,
  options: {
    args: Args
    steps: EmailSequenceStep<ObjectType<Args>>[]
  },
) {
  const send = components.backend.email.send
  return workflow.define({
    args: options.args,
    handler: async (step, data) => {
      for (const [index, sequenceStep] of options.steps.entries()) {
        if (sequenceStep.after > 0) {
          await step.sleep(sequenceStep.after, { name: `email-sequence-wait-${index}` })
        }
        const message = sequenceStep.email(data)
        if (!message) continue
        await step.runMutation(send as never, message as never)
      }
    },
  })
}
