import { backendError, getBackendError } from 'nuxt-backend/functions'
import { generateText, type LanguageModel } from 'ai'
import { v } from 'convex/values'
import { api, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, type MutationCtx, query, type QueryCtx } from './_generated/server'
import { ai } from './ai'
import { audit } from './audit'
import { cannedIdea, cannedPanels, isDemo } from './demo'
import { workspace } from './functions'
import { jobs } from './jobs'
import { notifications } from './notifications'
import { storage } from './storage'

const PANELS = 3

/** What drawing a strip costs, in credits from the `credits` meter. */
const DRAW_COST = 30

// The strip functions. Each reads and writes only the caller's workspace:
// `workspace` functions run for a signed-in member, and `ctx.workspace` is
// the caller's active workspace, read fresh on every call.

export const list = workspace.query({
  args: {},
  handler: async (ctx) => {
    const strips = await ctx.db
      .query('strips')
      .withIndex('by_workspace', q => q.eq('workspaceId', ctx.workspace.id))
      .order('desc')
      .take(50)
    return strips.filter(strip => !strip.hidden)
  },
})

export const get = workspace.query({
  args: { id: v.id('strips') },
  handler: async (ctx, { id }) => {
    const strip = await ctx.db.get('strips', id)
    if (strip?.workspaceId !== ctx.workspace.id || strip.hidden) return null
    return { ...strip, panels: await withUrls(ctx, strip.panels), cost: await costOf(ctx, strip) }
  },
})

/**
 * What drawing the strip costs, as its button says: on the demo a canned
 * idea is a free copy once its panels are in the cache, and `null` (no
 * button) before; everywhere else a strip costs a job's credits.
 */
async function costOf(ctx: QueryCtx, strip: Doc<'strips'>): Promise<number | null> {
  if (!isDemo() || strip.ideaId === undefined) return DRAW_COST
  return (await cannedPanels(ctx, strip.ideaId)) ? 0 : null
}

/** A strip of the caller's workspace that may still change: another workspace's is `forbidden`, and so is one an administrator hid. */
function ownStrip(strip: Doc<'strips'> | null, workspaceId: string): Doc<'strips'> {
  if (strip?.workspaceId !== workspaceId) throw backendError('forbidden', { reason: 'other_workspace' })
  if (strip.hidden) throw backendError('forbidden', { reason: 'hidden' })
  return strip
}

/**
 * The panels with their images' URLs. The images are in the package's
 * storage, and `storage.fileUrl` is the app's own read: it reads any file,
 * so call it once the query decided who may see the strip, as `get` and
 * `shared` do. A canned strip's images are the app's, never the reader's.
 */
async function withUrls(ctx: QueryCtx, panels: Doc<'strips'>['panels']) {
  return await Promise.all(panels.map(async panel => ({ ...panel, url: await storage.fileUrl(ctx, panel.imageId) })))
}

// A strip starts from an idea of the author's own, or from one of the
// canned ideas (demo.ts) by its id. On the public demo, anyone may sign up
// and the model calls are real, so an idea of one's own asks for a session
// signed in with a passkey: `forbidden`, reason `passkey_required`.
export const create = workspace.mutation({
  args: { idea: v.optional(v.string()), ideaId: v.optional(v.string()) },
  handler: async (ctx, { idea, ideaId }) => {
    if ((idea === undefined) === (ideaId === undefined)) throw backendError('invalid_input', { field: 'idea', reason: 'idea_or_ideaId' })
    let text: string
    if (ideaId !== undefined) {
      const canned = cannedIdea(ideaId)
      if (!canned) throw backendError('invalid_input', { field: 'ideaId', reason: 'unknown_idea' })
      text = canned.idea
    }
    else {
      if (isDemo() && ctx.user.signInMethod !== 'passkey') throw backendError('forbidden', { reason: 'passkey_required' })
      text = idea!.trim()
      if (text.length < 3 || text.length > 200) throw backendError('invalid_input', { field: 'idea', reason: 'idea_length' })
    }
    return ctx.db.insert('strips', {
      workspaceId: ctx.workspace.id,
      authorId: ctx.user.id,
      authorEmail: ctx.user.email,
      idea: text,
      ...(ideaId === undefined ? {} : { ideaId }),
      status: 'draft',
      panels: [],
    })
  },
})

// A photo is unclaimed until this keeps it: claiming checks the file and the
// quota, and ties the file to its owner, so an export or an erasure finds it.
export const keepPhoto = internalMutation({
  args: { id: v.id('strips'), photoId: v.string(), userId: v.string(), workspaceId: v.string() },
  handler: async (ctx, { id, photoId, userId, workspaceId }) => {
    const strip = ownStrip(await ctx.db.get('strips', id), workspaceId)
    await storage.claim(ctx, photoId, { userId, workspaceId })
    if (strip.photoId) await storage.release(ctx, strip.photoId)
    await ctx.db.patch('strips', id, { photoId })
  },
})

// What the page calls with a new upload. A photo the safety classifier flags
// is refused with `invalid_input`, reason `content_blocked`, and never
// claimed. When the upload itself is refused, by the classifier or the
// claim (`invalid_input`: its type or size; `quota_exceeded`),
// `storage.discard` deletes it at once rather than leaving it for the daily
// sweep of unclaimed files. Any other failure (another workspace's strip,
// a provider down) says nothing about the file, so it stays for a retry.
export const attachPhoto = workspace.action({
  args: { id: v.id('strips'), photoId: v.string() },
  handler: async (ctx, { id, photoId }) => {
    try {
      await ai.requireSafe(ctx, { images: [photoId] })
      await ctx.runMutation(internal.strips.keepPhoto, {
        id,
        photoId,
        userId: ctx.user.id,
        workspaceId: ctx.workspace.id,
      })
    }
    catch (error) {
      const code = getBackendError(error)?.code
      if (code === 'invalid_input' || code === 'quota_exceeded') await storage.discard(ctx, photoId)
      throw error
    }
  },
})

// The job that draws a strip: DRAW_COST credits from the `credits` meter, held
// while it waits, charged when it starts, refunded if it fails. The handler
// only orders the steps: reads and model calls happen inside them, so a
// replay after a restart makes the same calls in the same order.
export const draw = jobs.define({
  meter: 'credits',
  cost: DRAW_COST,
  args: { stripId: v.id('strips') },
  handler: async (job, { stripId }) => {
    const captions = await job.run(internal.strips.writeCaptions, { stripId })
    for (const [index, caption] of captions.entries()) {
      const last = index === captions.length - 1
      await job.run(internal.strips.drawPanel, { stripId, caption, index, last })
      await job.progress({ done: index + 1, total: captions.length, label: caption })
    }
  },
})

/** The captions a model writes for an idea, one per panel. The demo's seed job (demo.ts) asks the same. */
export async function captionsFor(model: LanguageModel, idea: string): Promise<string[]> {
  const { text } = await generateText({
    model,
    prompt: `Write ${PANELS} short captions, one per line, for a comic strip about: ${idea}`,
  })
  const captions = text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, PANELS)
  // No caption, no panel to draw: the job fails, its credits are refunded,
  // and the strip offers to try again (strips.retry).
  if (captions.length === 0) throw new Error('The model wrote no captions')
  return captions
}

/** One panel drawn for a caption, from the strip's photo when it has one. */
export async function panelFor(model: LanguageModel, caption: string, photo: string | null) {
  const { files } = await generateText({
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `Draw one comic panel in ink and flat colour: ${caption}` },
        ...(photo ? [{ type: 'file' as const, mediaType: 'image', data: new URL(photo) }] : []),
      ],
    }],
  })
  const image = files.find(file => file.mediaType.startsWith('image/'))
  if (!image) throw new Error('The model returned no image')
  return image
}

// A step takes a turn from its model's limit before it runs, and
// `ctx.model()` returns that model through the AI gateway.
export const writeCaptions = jobs.step({
  model: 'openai/gpt-5-mini',
  args: { stripId: v.id('strips') },
  handler: async (ctx, { stripId }) => {
    const strip: Doc<'strips'> = await ctx.runQuery(internal.strips.read, { id: stripId })
    return captionsFor(ctx.model(), strip.idea)
  },
})

export const drawPanel = jobs.step({
  model: 'google/gemini-2.5-flash-image',
  args: { stripId: v.id('strips'), caption: v.string(), index: v.number(), last: v.boolean() },
  handler: async (ctx, { stripId, caption, index, last }) => {
    const strip: Doc<'strips'> = await ctx.runQuery(internal.strips.read, { id: stripId })
    // The photo is in the package's storage: its URL, read by the app itself.
    const photo = strip.photoId ? await storage.fileUrl(ctx, strip.photoId) : null
    const image = await panelFor(ctx.model(), caption, photo)
    // Saves the file with its content credentials in the package's storage,
    // as the workspace's (the job's owner), and records the strip it came
    // from on the job's provenance.
    const imageId = await ctx.storeImage(image, { inputs: [stripId] })
    await ctx.runMutation(internal.strips.savePanel, { stripId, jobId: ctx.job.id, imageId, caption, index, last })
  },
})

export const read = internalQuery({
  args: { id: v.id('strips') },
  handler: async (ctx, { id }) => {
    const strip = await ctx.db.get('strips', id)
    if (!strip) throw new Error('The strip is gone')
    return strip
  },
})

// A finished strip tells its author: the backend event recorded here
// becomes a notification (notifications.ts), in the inbox, by email and as
// a push, on each channel the author left on. Its link goes through routes.ts.
async function announceReady(ctx: MutationCtx, strip: Doc<'strips'>) {
  await audit.recordBackendEvent(ctx, {
    type: 'app.strip_ready',
    subjectId: strip.authorId,
    entityId: strip.workspaceId,
    targetId: strip._id,
  })
}

// Saves a panel in its place. The last one makes the strip ready, however
// many captions the model wrote, and announces it. A step can run twice (a
// retry after a restart), so a panel already in its place is kept and the
// new image dropped: one panel, and one announcement.
export const savePanel = internalMutation({
  args: { stripId: v.id('strips'), jobId: v.string(), imageId: v.string(), caption: v.string(), index: v.number(), last: v.boolean() },
  handler: async (ctx, { stripId, jobId, imageId, caption, index, last }) => {
    const strip = await ctx.db.get('strips', stripId)
    // Deleted while it drew (the demo's nightly reset), drawn by a job the
    // strip let go of (strips.retry), or a panel saved already: this image
    // is no panel of the strip's.
    if (strip?.jobId !== jobId || strip.status !== 'queued' || index < strip.panels.length) {
      await storage.release(ctx, imageId)
      return
    }
    if (index > strip.panels.length) throw new Error(`Panel ${index} came before panel ${strip.panels.length}`)
    await ctx.db.patch('strips', stripId, { panels: [...strip.panels, { imageId, caption }], status: last ? 'ready' : 'queued' })
    if (last) await announceReady(ctx, strip)
  },
})

// Puts the job in line. Before it does, `jobs.enqueue` checks what every
// metered call checks: a signed-in member, the `pause_ai` switch off, room
// in the `ai` rate limit and enough credits. A refusal rolls the whole
// mutation back. On the demo a canned idea is copied from the cache
// instead: no job, no model call and no credits, and until the seed job
// drew it, nothing at all (`not_ready`, reason `idea_not_drawn`). The copy
// is the cache's panels, so a photo on the strip plays no part in it.
export const generate = workspace.mutation({
  args: { id: v.id('strips') },
  handler: async (ctx, { id }) => {
    const strip = ownStrip(await ctx.db.get('strips', id), ctx.workspace.id)
    if (strip.status !== 'draft') throw backendError('invalid_input', { field: 'id', reason: 'already_generated' })
    if (isDemo() && strip.ideaId !== undefined) {
      const canned = await cannedPanels(ctx, strip.ideaId)
      if (!canned) throw backendError('not_ready', { reason: 'idea_not_drawn' })
      await ctx.db.patch('strips', id, { panels: canned, cached: true, status: 'ready' })
      await announceReady(ctx, strip)
      return
    }
    const { jobId } = await jobs.enqueue(ctx, internal.strips.draw, { stripId: id })
    await ctx.db.patch('strips', id, { jobId, status: 'queued' })
  },
})

// A job that failed or was canceled leaves its strip queued: this lets the
// strip go back to a draft, to be drawn again. The package refunded a
// failed job's credits, and gave back a canceled job's hold. The panels the
// job drew before it stopped go with it. While the job still runs, or once
// it is done, there is nothing to retry (`invalid_input`, reason `not_stopped`).
export const retry = workspace.mutation({
  args: { id: v.id('strips') },
  handler: async (ctx, { id }) => {
    const strip = ownStrip(await ctx.db.get('strips', id), ctx.workspace.id)
    const job = strip.status === 'queued' && strip.jobId ? await ctx.runQuery(api.jobs.getJob, { jobId: strip.jobId }) : null
    if (job?.status !== 'failed' && job?.status !== 'canceled') throw backendError('invalid_input', { field: 'id', reason: 'not_stopped' })
    for (const panel of strip.panels) await storage.release(ctx, panel.imageId)
    await ctx.db.patch('strips', id, { status: 'draft', panels: [], jobId: undefined })
  },
})

// The public page's read: a strip by its share link's token. It runs without
// a signed-in user, and returns only what the page shows.
export const shared = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const link = await storage.resolveShareLink(ctx, 'strips', token)
    const id = link && ctx.db.normalizeId('strips', link.id)
    const strip = id ? await ctx.db.get('strips', id) : null
    if (!strip || strip.status !== 'ready' || strip.hidden) return null
    const panels = await withUrls(ctx, strip.panels)
    return { idea: strip.idea, panels: panels.map(({ caption, url }) => ({ caption, url })) }
  },
})

/**
 * Delete a strip with what hangs off it, in the caller's transaction: its
 * photo, its panels (unless they are the demo cache's), its share link, and
 * the strip-ready notifications that link to it. The demo's nightly reset
 * (demo.ts) runs it for each old strip.
 */
export async function deleteStrip(ctx: MutationCtx, strip: Doc<'strips'>) {
  await storage.release(ctx, strip.photoId)
  if (!strip.cached) {
    for (const panel of strip.panels) await storage.release(ctx, panel.imageId)
  }
  await storage.revokeShareLink(ctx, 'strips', strip._id)
  // A strip notifies its author alone: one call, of up to 200, forgets it.
  await notifications.forget(ctx, { kind: 'app.strip_ready', target: strip._id })
}

// An account's strips join its export and its erasure (account.ts): the
// export lists what each strip holds, and the erasure deletes the strips
// the account started, with their photos, panels, share links and
// notifications (deleteStrip). Deleted, not anonymised: the idea is the
// author's own words and the panels were drawn from their photo, so a
// strip without its author would still be theirs.
export const exportFor = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const strips = await ctx.db.query('strips').withIndex('by_author', q => q.eq('authorId', userId)).take(1000)
    return strips.map(strip => ({
      id: strip._id,
      createdAt: new Date(strip._creationTime).toISOString(),
      workspaceId: strip.workspaceId,
      idea: strip.idea,
      status: strip.status,
      photoId: strip.photoId ?? null,
      panels: strip.panels,
    }))
  },
})

export const forgetFor = internalMutation({
  args: { userId: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, { userId }) => {
    // A strip has an author's account: an address alone started none.
    if (userId === undefined) return { done: true }
    const strips = await ctx.db.query('strips').withIndex('by_author', q => q.eq('authorId', userId)).take(50)
    for (const strip of strips) {
      await deleteStrip(ctx, strip)
      await ctx.db.delete('strips', strip._id)
    }
    return { done: strips.length < 50 }
  },
})
