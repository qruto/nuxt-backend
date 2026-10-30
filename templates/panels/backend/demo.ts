import { backendEnvironment } from 'nuxt-backend/app'
import { defineRetention } from 'nuxt-backend/functions'
import { DAY } from 'nuxt-backend/rate-limit'
import { v } from 'convex/values'
import { internal } from './_generated/api'
import { internalMutation, type MutationCtx, query, type QueryCtx } from './_generated/server'
import { admin } from './functions'
import { jobs } from './jobs'
import { storage } from './storage'
import { captionsFor, deleteStrip, panelFor } from './strips'

// Panels as a public demo. A `sandbox` deployment (BACKEND_ENVIRONMENT) is
// open to anyone, and its model calls are real, so there:
// - a strip starts from one of the canned ideas below, whose panels were
//   drawn once and are copied at 0 credits, with no model call (strips.ts);
// - an idea of one's own asks for a passkey sign-in (strips.create);
// - share links are off (storage.ts);
// - a nightly reset deletes every strip older than a day (crons.ts).
// setupAi's spendLimit (ai.ts) caps what a day of model calls may cost.
// Everywhere else the canned ideas are suggestions, drawn like any other.

/** Whether this deployment is the public demo. */
export const isDemo = () => backendEnvironment() === 'sandbox'

/** Where the demo sends someone who wants what it turns off. */
export const TEMPLATE_URL = 'https://github.com/qruto/nuxt-backend/tree/main/templates/panels'

/** The ideas the demo has drawn, by id. */
export const CANNED_IDEAS = [
  { id: 'surfing-cat', idea: 'A cat learns to surf' },
  { id: 'moon-bus', idea: 'The last bus on the moon' },
  { id: 'robot-baker', idea: 'A robot bakes bread' },
  { id: 'lighthouse-whale', idea: 'A lighthouse keeper adopts a lost whale' },
] as const

/** A canned idea by its id, or `null`. */
export function cannedIdea(id: string) {
  return CANNED_IDEAS.find(each => each.id === id) ?? null
}

/** The cache's row for a canned idea. */
const cacheRow = (ctx: QueryCtx, ideaId: string) =>
  ctx.db.query('cannedStrips').withIndex('by_ideaId', q => q.eq('ideaId', ideaId)).unique()

/** A canned idea's panels once the seed job drew them all; `null` before. */
export async function cannedPanels(ctx: QueryCtx, ideaId: string) {
  const row = await cacheRow(ctx, ideaId)
  return row?.ready ? row.panels : null
}

// What the pages read to fit the demo: whether this is it, whether links
// can be shared, whether an idea of one's own needs a passkey, and the
// canned ideas, each `ready` once its panels are in the cache.
export const status = query({
  args: {},
  handler: async (ctx) => {
    const demo = isDemo()
    const ideas = await Promise.all(CANNED_IDEAS.map(async ({ id, idea }) => ({
      id,
      idea,
      ready: (await cannedPanels(ctx, id)) !== null,
    })))
    return { demo, sharing: !demo, ownIdeaNeedsPasskey: demo, ideas, templateUrl: TEMPLATE_URL }
  },
})

// Fills the cache: one free job per canned idea not drawn yet, run like a
// strip's (the queue, the model limits, the spend limit). The app runs it
// for itself (`billTo: 'app'`), so the panels are the app's files, not the
// administrator's: no workspace's quota counts them, and no account's
// export or erasure takes them from the strips they are copied into. An
// idea whose seeding stopped halfway starts over.
async function fillCache(ctx: MutationCtx) {
  let queued = 0
  for (const { id } of CANNED_IDEAS) {
    const row = await cacheRow(ctx, id)
    if (row?.ready) continue
    if (row) {
      for (const panel of row.panels) await storage.release(ctx, panel.imageId)
      await ctx.db.delete('cannedStrips', row._id)
    }
    const { jobId } = await jobs.enqueue(ctx, internal.demo.drawCanned, { ideaId: id }, { billTo: 'app' })
    await ctx.db.insert('cannedStrips', { ideaId: id, jobId, panels: [], ready: false })
    queued++
  }
  return { queued }
}

// The admin console's Demo tab (app/pages/admin/demo.vue) fills the cache.
export const seed = admin.mutation({
  recentSignIn: false,
  args: {},
  handler: ctx => fillCache(ctx),
})

// The same fill for your own tooling, with no one signed in: internal, so
// only a deploy key reaches it (`npx convex run demo:seedInternal`).
export const seedInternal = internalMutation({
  args: {},
  handler: ctx => fillCache(ctx),
})

// The seed job: the strip's own captions and panels (strips.ts), kept in
// the cache instead of on a strip. `meter: false` charges no credits.
export const drawCanned = jobs.define({
  meter: false,
  cost: 0,
  args: { ideaId: v.string() },
  handler: async (job, { ideaId }) => {
    const captions = await job.run(internal.demo.writeCannedCaptions, { ideaId })
    for (const [index, caption] of captions.entries()) {
      await job.run(internal.demo.drawCannedPanel, { ideaId, caption, index, last: index === captions.length - 1 })
    }
  },
})

export const writeCannedCaptions = jobs.step({
  model: 'openai/gpt-5-mini',
  args: { ideaId: v.string() },
  handler: async (ctx, { ideaId }) => captionsFor(ctx.model(), cannedIdea(ideaId)?.idea ?? ideaId),
})

export const drawCannedPanel = jobs.step({
  model: 'google/gemini-2.5-flash-image',
  args: { ideaId: v.string(), caption: v.string(), index: v.number(), last: v.boolean() },
  handler: async (ctx, { ideaId, caption, index, last }) => {
    const image = await panelFor(ctx.model(), caption, null)
    const imageId = await ctx.storeImage(image, { inputs: [ideaId] })
    await ctx.runMutation(internal.demo.cachePanel, { ideaId, jobId: ctx.job.id, imageId, caption, index, last })
  },
})

export const cachePanel = internalMutation({
  args: { ideaId: v.string(), jobId: v.string(), imageId: v.string(), caption: v.string(), index: v.number(), last: v.boolean() },
  handler: async (ctx, { ideaId, jobId, imageId, caption, index, last }) => {
    const row = await cacheRow(ctx, ideaId)
    // A seed job another seed replaced, or a panel a retried step saved
    // already: its image is not the cache's.
    if (row?.jobId !== jobId || row.ready || index < row.panels.length) {
      await storage.release(ctx, imageId)
      return
    }
    if (index > row.panels.length) throw new Error(`Panel ${index} came before panel ${row.panels.length}`)
    await ctx.db.patch('cannedStrips', row._id, { panels: [...row.panels, { imageId, caption }], ready: last })
  },
})

// The nightly reset's pass: every strip older than a day, in batches, with
// its photo, its panels, its share link and its notifications
// (strips.deleteStrip). The cache, and the app's panels a canned strip
// shows, stay.
export const pruneStrips = defineRetention(internalMutation, {
  fn: 'demo:pruneStrips',
  table: 'strips',
  index: 'by_creation_time',
  ttl: DAY,
  onDelete: deleteStrip,
})

// What crons.ts runs each night: the pass above, on the demo only. `now`
// moves the clock in a test.
export const reset = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }) => {
    if (!isDemo()) return false
    await ctx.scheduler.runAfter(0, internal.demo.pruneStrips, now === undefined ? {} : { now })
    return true
  },
})
