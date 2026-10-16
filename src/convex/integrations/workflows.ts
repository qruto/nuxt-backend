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
 * merged onto the package defaults (`DEFAULT_WORKPOOL_OPTIONS`: bounded
 * parallelism, exponential-backoff retries).
 *
 * @example
 * ```ts
 * import { setupWorkflows } from 'nuxt-backend/workflows'
 * import { components } from './_generated/api'
 *
 * export const workflow = setupWorkflows(components)
 *
 * export const exportReady = workflow.define({
 *   args: { email: v.string(), url: v.string() },
 *   handler: async (step, { email, url }) => {
 *     // Email is sent through the `backend` component's email module.
 *     await step.runMutation(components.backend.email.send, {
 *       to: email,
 *       subject: 'Your export is ready',
 *       text: `Download it here: ${url}`,
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

/**
 * The `backend` component's parts a sequence uses, structurally: the email
 * transport, and the auth adapter a sequence with a `userId` reads the
 * account through.
 */
interface SequenceEmailComponents {
  backend: {
    email: {
      send: unknown
    }
    adapter?: {
      findOne?: unknown
    }
  }
}

/** The account a step is sent for, as the auth tables hold it now. */
interface SequenceRecipient {
  email: string
  name: string
}

/**
 * What a step renders with: the data as started, or for a sequence that
 * carries a `userId`, the account's current `email` and `name` over it.
 * `null` once the account is gone (deleted since the sequence started), so
 * nobody is written to.
 */
async function currentRecipient<Data extends Record<string, unknown>>(
  step: { runQuery: (query: never, args: never) => Promise<unknown> },
  findUser: unknown,
  data: Data,
): Promise<Data | null> {
  const userId = data.userId
  if (typeof userId !== 'string' || !findUser) return data
  const user = await step.runQuery(findUser as never, {
    model: 'user',
    where: [{ field: '_id', value: userId }],
  } as never) as SequenceRecipient | null
  if (!user) return null
  return {
    ...data,
    ...('email' in data ? { email: user.email } : {}),
    ...('name' in data ? { name: user.name } : {}),
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
 * A sequence started with a `userId` follows the account: before each email
 * it reads the user, ends the sequence when the account is gone (deleted
 * since sign-up), and hands the step the account's current `email` and
 * `name` in place of the ones captured when it started.
 *
 * @example
 * ```ts
 * // backend/workflows.ts
 * export const onboardingSequence = defineEmailSequence(workflow, components, {
 *   args: { email: v.string(), name: v.string() },
 *   steps: [
 *     { after: 24 * 60 * 60 * 1000, email: ({ email, name }) => ({ to: email, subject: `Your first day, ${name}`, text: '…' }) },
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
  const findUser = components.backend.adapter?.findOne
  return workflow.define({
    args: options.args,
    handler: async (step, data) => {
      for (const [index, sequenceStep] of options.steps.entries()) {
        if (sequenceStep.after > 0) {
          await step.sleep(sequenceStep.after, { name: `email-sequence-wait-${index}` })
        }
        const current = await currentRecipient(step, findUser, data)
        if (!current) return
        const message = sequenceStep.email(current)
        if (!message) continue
        await step.runMutation(send as never, message as never)
      }
    },
  })
}
