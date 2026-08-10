import { setupWorkflows } from 'nuxt-backend/workflows'
import { v } from 'convex/values'
import { components } from './_generated/api'

export const workflow = setupWorkflows(components)

// Runs once on signup: send a welcome email through the backend component's
// email module. Steps are durable and retried on failure.
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
