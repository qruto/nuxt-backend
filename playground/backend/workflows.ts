import { setupWorkflows, type WorkflowId } from 'nuxt-backend/convex/workflows'
import { v } from 'convex/values'
import { components, internal } from './_generated/api'
import { mutation, query } from './_generated/server'

export const workflow = setupWorkflows(components.workflow)

// Runs once on signup: send a welcome email through the Resend component nested
// inside `backend` (components.backend.email.send). Steps are durable and
// retried on failure. Add more steps (provisioning, analytics) as needed.
export const onSignup = workflow.define({
  args: { userId: v.string(), email: v.string(), name: v.string() },
  handler: async (step, { email, name }) => {
    await step.runMutation(components.backend.email.send, {
      to: email,
      subject: 'Welcome!',
      html: `<p>Welcome aboard, ${name}! We're glad you're here.</p>`,
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

// Kick off the demo workflow and return its id for the client to watch. The
// explicit `Promise<string>` return type is required: the handler references
// `internal.workflows`, which would otherwise make its type infer circularly.
export const startDemoWorkflow = mutation({
  args: { label: v.string() },
  returns: v.string(),
  handler: async (ctx, { label }): Promise<string> => {
    return workflow.start(ctx, internal.workflows.demoWorkflow, { label })
  },
})

// Reactive status query for the `useWorkflowStatus` composable. The id is a
// branded string, so cast the validated arg back to `WorkflowId`.
export const getWorkflowStatus = query({
  args: { workflowId: v.string() },
  handler: (ctx, { workflowId }) => workflow.status(ctx, workflowId as WorkflowId),
})
