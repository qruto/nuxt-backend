/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
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
    // The packaged welcome email goes out at signup; the sequence follows up.
    {
      after: 3 * 24 * 60 * 60 * 1000, // three days later
      email: ({ email, name }) => ({
        to: email,
        subject: 'How is it going?',
        text: `Hi${name ? ` ${name}` : ''}, you signed up three days ago. Reply to this email if anything is in your way.`,
      }),
    },
  ],
})
