import { defineEmailSequence, setupWorkflows } from 'nuxt-backend/workflows'
import { v } from 'convex/values'
import { components } from './_generated/api'

export const workflow = setupWorkflows(components)

// Runs once on signup (started from auth.ts's onUserCreated): a durable
// onboarding drip through the backend component's email module. Steps
// sleep durably (they survive restarts and deploys), each email is
// delivery-tracked, and a step returning null is skipped. Extend it, or
// cancel a running sequence with `workflow.cancel(ctx, id)`.
export const onSignup = defineEmailSequence(workflow, components, {
  args: { userId: v.string(), email: v.string(), name: v.string() },
  steps: [
    {
      after: 0,
      email: ({ email, name }) => ({
        to: email,
        subject: 'Welcome!',
        html: `<p>Welcome aboard, ${name}! We're glad you're here.</p>`,
      }),
    },
    // {
    //   after: 3 * 24 * 60 * 60 * 1000, // three days later
    //   email: ({ email, name }) => ({ to: email, subject: 'Getting the most out of it', text: '…' }),
    // },
  ],
})
