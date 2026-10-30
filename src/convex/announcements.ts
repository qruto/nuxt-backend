import { v } from 'convex/values'

// What an announcement is made of, shared by the component that stores it
// and the app's functions that publish and send it. Runtime-neutral: no
// Convex runtime, no Vue.

/** Where a notice links: a path of the app or an `https:` URL, and its words. */
export const vAnnouncementLink = v.object({ url: v.string(), label: v.optional(v.string()) })

/** Who a broadcast goes to: the app's accounts under a topic, or the waitlist's launch-news contacts. */
export const vAnnouncementAudience = v.union(v.literal('accounts'), v.literal('waitlist'))

/** The email an administrator wrote to go with a notice. */
export const vBroadcastDraft = v.object({
  audience: vAnnouncementAudience,
  /** The topic's key (`setupEmail({ topics })`), for the accounts' audience. */
  topic: v.optional(v.string()),
  subject: v.string(),
  body: v.string(),
})

/** `draft` until it is created at the provider, `created` until it is sent (or scheduled), then `sent` or `cancelled`. */
export const vBroadcastState = v.union(v.literal('draft'), v.literal('creating'), v.literal('created'), v.literal('sent'), v.literal('cancelled'))

/** What an administrator publishes: the notice, when it goes, and an email that may go with it. */
export const vAnnouncementInput = {
  message: v.string(),
  link: v.optional(vAnnouncementLink),
  expiresAt: v.number(),
  broadcast: v.optional(vBroadcastDraft),
}
