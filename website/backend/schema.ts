import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/** A drawn panel: its image, in the package's storage (ctx.storeImage), by its id as a string. */
const panel = v.object({ imageId: v.string(), caption: v.string() })

// Panels' tables. The package keeps its tables in its own component, so this
// schema holds only the app's: a strip belongs to the workspace it was made
// in, and the public demo keeps the panels of its canned ideas (demo.ts).
export default defineSchema({
  strips: defineTable({
    workspaceId: v.string(),
    authorId: v.string(),
    authorEmail: v.string(),
    idea: v.string(),
    // One of the canned ideas (demo.ts), when the strip started from one.
    ideaId: v.optional(v.string()),
    status: v.union(v.literal('draft'), v.literal('queued'), v.literal('ready')),
    // An upload the package's storage keeps (storage.ts): its id, as a string.
    photoId: v.optional(v.string()),
    jobId: v.optional(v.string()),
    // The drawn panels, each image its workspace's file, stored by the job.
    panels: v.array(panel),
    // The panels are a canned idea's, copied from the demo's cache: the files
    // are the app's own, so deleting the strip leaves them.
    cached: v.optional(v.boolean()),
    hidden: v.optional(v.boolean()),
  })
    .index('by_workspace', ['workspaceId'])
    // An account's strips, for its export and its erasure (account.ts).
    .index('by_author', ['authorId']),

  // The panels each canned idea was drawn into once, by the seed job
  // (demo.ts): a job the app runs for itself, so the images are the app's.
  cannedStrips: defineTable({
    ideaId: v.string(),
    // The seed job drawing it: a panel any other job draws is dropped.
    jobId: v.optional(v.string()),
    panels: v.array(panel),
    ready: v.boolean(),
  }).index('by_ideaId', ['ideaId']),
})
