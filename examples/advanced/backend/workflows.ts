import { setupWorkflows } from 'nuxt-backend/workflows'
import { v } from 'convex/values'
import { components } from './_generated/api'

export const workflow = setupWorkflows(components)

// CUSTOMIZATION: a hand-rolled `workflow.define` instead of the scaffold's
// `defineEmailSequence` — the step calls the backend component's email
// module directly. Runs once on signup (started from auth.ts's
// onUserCreated), after the packaged welcome email; steps are durable and
// retried on failure, and the sleep survives restarts and deploys.
//
// After the sleep it reads the account again, as `defineEmailSequence` does:
// an account deleted in the meantime gets nothing, and a changed address
// gets the email at the new one, never at the address it signed up with.
export const onSignup = workflow.define({
  args: { userId: v.string(), email: v.string(), name: v.string() },
  handler: async (step, { userId }) => {
    await step.sleep(3 * 24 * 60 * 60 * 1000, { name: 'three-days' })
    const user = await step.runQuery(components.backend.adapter.findOne, {
      model: 'user',
      where: [{ field: '_id', value: userId }],
    }) as { email: string, name: string } | null
    if (!user) return
    await step.runMutation(components.backend.email.send, {
      to: user.email,
      subject: 'How is it going?',
      text: `Hi${user.name ? ` ${user.name}` : ''}, you signed up three days ago. Reply to this email if anything is in your way.`,
    })
  },
})
