import { v } from 'convex/values'

/** One address or a list — every recipient field of a transactional email. */
export const vRecipient = v.union(v.string(), v.array(v.string()))

/**
 * The argument validators of a transactional send, shared verbatim by the
 * component's `email.send` and the app-side `setupEmail` wrapper: the app
 * validates what it forwards, the component validates what it receives, and
 * one definition keeps the two from drifting.
 */
export const sendArgs = {
  to: vRecipient,
  subject: v.optional(v.string()),
  html: v.optional(v.string()),
  text: v.optional(v.string()),
  from: v.optional(v.string()),
  cc: v.optional(vRecipient),
  bcc: v.optional(vRecipient),
  replyTo: v.optional(v.array(v.string())),
  headers: v.optional(v.array(v.object({ name: v.string(), value: v.string() }))),
  template: v.optional(v.object({
    id: v.string(),
    variables: v.optional(v.record(v.string(), v.union(v.string(), v.number()))),
  })),
}
