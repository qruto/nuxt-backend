import { setupWorkflows, type WorkflowId } from 'nuxt-backend/workflows'
import { ConvexError, v } from 'convex/values'
import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { emailLimits, throttle } from './rateLimiter'

export const workflow = setupWorkflows(components)

// Runs once on signup. The welcome email itself is sent by the built-in
// `user.create.after` hook (templates.welcome), so this workflow handles the
// rest of onboarding: durable, retried-on-failure steps like provisioning or
// analytics — here, logging the signup to the showcase activity feed.
export const onSignup = workflow.define({
  args: { userId: v.string(), email: v.string(), name: v.string() },
  handler: async (step) => {
    // The feed is shared by every account, so it names nobody.
    await step.runMutation(internal.billing.recordWebhookEvent, {
      source: 'auth',
      type: 'user.created',
      summary: 'a new account signed up',
    })
  },
})

// A demo workflow you can start from the UI and watch live with
// `useWorkflowStatus`: a durable email step, a durable pause (so the status
// stays `inProgress` long enough to observe), then a completed result.
// NOTE: workflow handlers need an explicit return-type annotation.
export const demoWorkflow = workflow.define({
  args: { label: v.string() },
  handler: async (step, { label }): Promise<string> => {
    await step.runMutation(components.backend.email.send, {
      to: 'delivered@resend.dev',
      subject: `Workflow run: ${label}`,
      html: `<p>Durable workflow step executed for <b>${label}</b>.</p>`,
    })
    await step.sleep(4000)
    return `Completed: ${label}`
  },
})

// Kick off the demo workflow and return its id for the client to watch —
// signed-in visitors only, on the same email budget as the test email, since
// every run sends one. The explicit `Promise<string>` return type is
// required: the handler references `internal.workflows`, which would
// otherwise make its type infer circularly.
export const startDemoWorkflow = mutation({
  args: { label: v.string() },
  returns: v.string(),
  handler: async (ctx, { label }): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new ConvexError('Sign in to start a workflow.')
    await throttle(ctx, emailLimits(identity.subject))
    return workflow.start(ctx, internal.workflows.demoWorkflow, { label: label.slice(0, 80) })
  },
})

// Reactive status query for the `useWorkflowStatus` composable. The id is a
// branded string, so cast the validated arg back to `WorkflowId`.
export const getWorkflowStatus = query({
  args: { workflowId: v.string() },
  handler: (ctx, { workflowId }) => workflow.status(ctx, workflowId as WorkflowId),
})
