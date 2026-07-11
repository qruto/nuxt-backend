import { setupWorkflows } from 'nuxt-backend/convex/workflows'
import { v } from 'convex/values'
import { components } from './_generated/api'

export const workflow = setupWorkflows(components.workflow)

// Runs once on signup: send a welcome email through the Resend component
// nested inside `backend`. Steps are durable and retried on failure.
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
