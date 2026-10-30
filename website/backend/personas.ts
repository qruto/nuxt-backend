import { flagBucket } from 'nuxt-backend/flags'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { env, internalMutation, type MutationCtx } from './_generated/server'
import { audit } from './audit'
import { flags } from './flags'

/**
 * The try kit's personas (`pnpm try`, scripts/try/personas.mjs): accounts in
 * the states a feature of Panels is for, seeded on a local deployment so each
 * can be clicked through by signing in as them. The kit calls these with
 * `convex run`; billing state that costs a payment (a plan, a pack, a gift)
 * is bought at the provider's sandbox checkout, never faked here.
 *
 * The accounts, their workspaces and memberships are written through the
 * auth component's adapter, as fixtures, not through a sign-up: a persona's
 * first sign-in finds its workspace and creates nothing. The personal
 * workspace follows the rule the session hook writes one by
 * (`personal-<userId>`, the owner its only member).
 *
 * Internal, so only an admin key reaches them, and refused anywhere but a
 * local deployment (`localDeploymentRefusal`): they write accounts and
 * strips outside every sign-in check, which only a throwaway local
 * deployment may hold. This file is the site's own (scripts/sync-panels.mjs
 * never writes it): Panels, the template, knows nothing of the kit.
 */

/** The marker the try kit (`pnpm try`) sets on the local deployment it seeds, and on no other. */
const LOCAL_MARKER = 'TRY_KIT_LOCAL'

/**
 * Why these functions refuse to run here, or `null` on a local deployment:
 * one serving from a loopback address that the kit marked local. A
 * loopback URL alone is no proof (a self-hosted backend serves from
 * `127.0.0.1` unless its operator says otherwise), so the marker must be
 * there too.
 */
export function localDeploymentRefusal(vars: Readonly<Record<string, string | undefined>>): string | null {
  let host = ''
  try {
    host = new URL(vars.CONVEX_CLOUD_URL ?? '').hostname
  }
  catch { /* no URL: refused below */ }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return 'The try kit seeds local deployments only: this one does not serve from a loopback address.'
  if (vars[LOCAL_MARKER] !== '1') return `The try kit seeds local deployments only: this one lacks the ${LOCAL_MARKER} marker the try kit sets on its local deployment.`
  return null
}

// The deployment's env, typed (`./_generated/server`). The marker is not
// declared in convex.config.ts, which is Panels' own file: the kit sets it
// on its local deployment, and reading a name the app does not declare
// gives its value, or nothing.
function requireLocalDeployment(): void {
  const refusal = localDeploymentRefusal(env)
  if (refusal) throw new Error(refusal)
}

const vPersona = v.object({
  key: v.string(),
  email: v.string(),
  name: v.string(),
  role: v.optional(v.literal('admin')),
  passkeyOnly: v.optional(v.boolean()),
  locale: v.optional(v.string()),
  workspace: v.optional(v.string()),
  joins: v.optional(v.object({ persona: v.string(), role: v.union(v.literal('member'), v.literal('admin')) })),
})

const vSeeded = v.object({
  key: v.string(),
  userId: v.string(),
  // The workspace the persona's sessions open in: the one billing and its strips are for.
  workspaceId: v.string(),
  created: v.boolean(),
})

type Persona = typeof vPersona.type

const adapter = components.backend.adapter

async function findOne(ctx: MutationCtx, model: string, field: string, value: string): Promise<({ _id: string } & Record<string, unknown>) | null> {
  return await ctx.runQuery(adapter.findOne, { model: model as never, where: [{ field, value }] }) as ({ _id: string } & Record<string, unknown>) | null
}

async function create(ctx: MutationCtx, model: string, data: Record<string, unknown>): Promise<string> {
  const row = await ctx.runMutation(adapter.create, { input: { model: model as never, data: data as never } }) as { _id: string }
  return row._id
}

/** The account fields a persona sets beyond its name and address, which an account seeded before them gets on the next seed. */
function accountFields(persona: Persona): Record<string, unknown> {
  return {
    ...(persona.role ? { role: persona.role } : {}),
    // Signs in with a passkey only: a code asked for it is never sent, and the dev inbox never shows its mail.
    ...(persona.passkeyOnly ? { passkeyOnly: true } : {}),
    // The language a sign-up records from the browser; its emails are written in it.
    ...(persona.locale ? { locale: persona.locale } : {}),
  }
}

/** The persona's account, by its email; created when it has none, with the fields the persona sets kept as it says. */
async function ensureUser(ctx: MutationCtx, persona: Persona, now: number): Promise<{ userId: string, created: boolean }> {
  const found = await findOne(ctx, 'user', 'email', persona.email)
  if (found) {
    const update = Object.fromEntries(Object.entries(accountFields(persona)).filter(([field, value]) => found[field] !== value))
    if (Object.keys(update).length > 0) {
      await ctx.runMutation(adapter.updateOne, { input: { model: 'user', where: [{ field: '_id', value: found._id }], update } })
    }
    return { userId: found._id, created: false }
  }
  const userId = await create(ctx, 'user', { name: persona.name, email: persona.email, emailVerified: true, createdAt: now, updatedAt: now, ...accountFields(persona) })
  return { userId, created: true }
}

/** A workspace by its slug, created with the given name when there is none. */
async function ensureWorkspace(ctx: MutationCtx, slug: string, name: string, now: number): Promise<{ workspaceId: string, created: boolean }> {
  const found = await findOne(ctx, 'organization', 'slug', slug)
  return found ? { workspaceId: found._id, created: false } : { workspaceId: await create(ctx, 'organization', { name, slug, createdAt: now }), created: true }
}

/** The membership, created when the user has none in the workspace; its id when it was. */
async function ensureMember(ctx: MutationCtx, organizationId: string, userId: string, role: string, now: number): Promise<string | null> {
  const members = await ctx.runQuery(adapter.findMany, {
    model: 'member',
    where: [{ field: 'organizationId', value: organizationId }, { field: 'userId', value: userId }],
    paginationOpts: { numItems: 1, cursor: null },
  }) as { page: unknown[] }
  return members.page.length === 0 ? await create(ctx, 'member', { organizationId, userId, role, createdAt: now }) : null
}

/**
 * Seed the personas' accounts, in order: a persona that joins another's
 * workspace comes after it. Each gets the workspace a sign-up would (a
 * personal one), a team workspace it owns (`workspace`), or a membership in
 * another persona's (`joins`). A team workspace and a membership made here
 * leave the activity the real flows would on the workspace's trail.
 * Idempotent: an account that exists is kept, and only what it lacks is
 * added.
 */
export const seed = internalMutation({
  args: { personas: v.array(vPersona) },
  returns: v.array(vSeeded),
  handler: async (ctx, { personas }) => {
    requireLocalDeployment()
    const now = Date.now()
    const seeded = new Map<string, typeof vSeeded.type>()
    for (const persona of personas) {
      const { userId, created } = await ensureUser(ctx, persona, now)
      let workspaceId: string
      if (persona.joins) {
        const host = seeded.get(persona.joins.persona)
        if (!host) throw new Error(`Persona ${persona.key} joins ${persona.joins.persona}, which is not seeded before it.`)
        workspaceId = host.workspaceId
        const memberId = await ensureMember(ctx, workspaceId, userId, persona.joins.role, now)
        // The activity a real invitation leaves on the workspace's trail.
        if (memberId) {
          await audit.recordBackendEvent(ctx, { type: 'workspace.member_invited', actor: { userId: host.userId }, entityId: workspaceId, data: { role: persona.joins.role } })
          await audit.recordBackendEvent(ctx, { type: 'workspace.invitation_accepted', actor: { userId }, entityId: workspaceId, data: { role: persona.joins.role } })
        }
      }
      else {
        // A team workspace by the persona's key, or the personal one a sign-up gets.
        const workspace = persona.workspace
          ? await ensureWorkspace(ctx, `try-${persona.key}`, persona.workspace, now)
          : await ensureWorkspace(ctx, `personal-${userId.toLowerCase()}`, `${persona.name}'s workspace`, now)
        workspaceId = workspace.workspaceId
        await ensureMember(ctx, workspaceId, userId, 'owner', now)
        if (workspace.created && persona.workspace) await audit.recordBackendEvent(ctx, { type: 'workspace.created', actor: { userId }, entityId: workspaceId })
      }
      seeded.set(persona.key, { key: persona.key, userId, workspaceId, created })
    }
    return [...seeded.values()]
  },
})

const vStrip = v.object({
  authorId: v.string(),
  authorEmail: v.string(),
  workspaceId: v.string(),
  idea: v.string(),
  status: v.union(v.literal('ready'), v.literal('queued')),
  // A ready strip's panels: one per caption, each drawn by the fixture image in its place.
  captions: v.optional(v.array(v.string())),
  // Someone who reported it, as the strip page's report button does.
  reporterId: v.optional(v.string()),
})

/** Base64 to the bytes the component's storage keeps. */
function bytesOf(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

/**
 * Give the personas their strips, each in the workspace its author's
 * sessions open in. A ready strip gets the fixture panels (base64 PNG images,
 * from the kit's scripts/try/fixtures/), stored in the package's storage as
 * a drawing job stores its images (`ctx.storeImage`): the workspace's files,
 * counted in its quota, with a provenance record naming the strip. Its
 * author then hears it is ready through Panels' own `app.strip_ready` kind
 * (notifications.ts), as `strips.generate` announces one. A queued strip is
 * in line with no job behind it: only a signed-in member puts a metered job
 * in line. A reported strip has an open report in the admin console's
 * Reports tab. Idempotent: a strip whose author has one with that idea in
 * the workspace already is kept. Returns the ideas it created.
 */
export const seedStrips = internalMutation({
  args: { strips: v.array(vStrip), panels: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { strips, panels }) => {
    requireLocalDeployment()
    const created: string[] = []
    for (const strip of strips) {
      const existing = await ctx.db.query('strips').withIndex('by_workspace', q => q.eq('workspaceId', strip.workspaceId)).take(100)
      if (existing.some(row => row.authorId === strip.authorId && row.idea === strip.idea)) continue
      const id = await ctx.db.insert('strips', { workspaceId: strip.workspaceId, authorId: strip.authorId, authorEmail: strip.authorEmail, idea: strip.idea, status: strip.status, panels: [] })
      if (strip.status === 'ready') {
        const drawn = []
        for (const [index, caption] of (strip.captions ?? []).entries()) {
          const imageId = await ctx.runMutation(components.backend.ai.storeImage, {
            bytes: bytesOf(panels[index % panels.length]!),
            contentType: 'image/png',
            owner: strip.workspaceId,
            userId: strip.authorId,
            models: [],
            inputs: [id],
            sourceType: 'trainedAlgorithmicMedia',
          })
          drawn.push({ imageId, caption })
        }
        await ctx.db.patch('strips', id, { panels: drawn })
        await audit.recordBackendEvent(ctx, { type: 'app.strip_ready', subjectId: strip.authorId, entityId: strip.workspaceId, targetId: id })
      }
      if (strip.reporterId) {
        await ctx.runMutation(components.backend.reports.fileReport, { subject: { table: 'strips', id }, reporterId: strip.reporterId, reason: 'abuse' })
      }
      created.push(strip.idea)
    }
    return created
  },
})

/** How finely a variant split is cut, as `flagBucket` cuts it. */
const VARIANT_BUCKETS = 10_000

/** The variant an account's bucket lands in, by the weights (equal when none): the one `useExperiment` reads for it. */
function variantOf(key: string, userId: string, variants: readonly string[], weights: readonly number[] | undefined): string {
  const shares = weights ?? variants.map(() => 1)
  const total = shares.reduce((sum, weight) => sum + weight, 0)
  const bucket = flagBucket(`${key}:variant`, userId)
  let edge = 0
  for (const [index, variant] of variants.entries()) {
    edge += (shares[index]! / total) * VARIANT_BUCKETS
    if (bucket < edge) return variant
  }
  return variants.at(-1)!
}

/**
 * Put one persona's account in the app's experiments (flags with
 * variants, by account), as an administrator's account target and the
 * account's first read would: the account joins each flag's targets, so the
 * experiment runs for it, and its variant is recorded as exposed, with the
 * `experiment.exposed` event a first `useExperiment` read records. The
 * variant is the one the flag's hash gives the account, so the page shows
 * the same. Returns the experiments it assigned, so a second run adds none.
 */
export const seedExperiments = internalMutation({
  args: { userId: v.string(), keys: v.array(v.string()) },
  returns: v.array(v.object({ key: v.string(), variant: v.string() })),
  handler: async (ctx, { userId, keys }) => {
    requireLocalDeployment()
    const definitions: Record<string, { variants?: readonly string[], weights?: readonly number[], by?: string, goal?: string, guardrails?: readonly string[] }> = flags.definitions
    const assigned: Array<{ key: string, variant: string }> = []
    for (const key of keys) {
      const definition = definitions[key]
      if (!definition?.variants?.length || definition.by === 'workspace') throw new Error(`${key} is no experiment by account in backend/flags.ts.`)
      const override = (await ctx.runQuery(components.backend.flags.get, { key }))?.override ?? {}
      if (!override.users?.includes(userId)) {
        await ctx.runMutation(components.backend.flags.set, { key, override: { ...override, users: [...override.users ?? [], userId] } })
      }
      const exposure = await ctx.runMutation(components.backend.funnel.expose, {
        experiment: key,
        subject: userId,
        userId,
        variant: variantOf(key, userId, definition.variants, definition.weights),
        variants: [...definition.variants],
        by: 'user',
        ...(definition.goal ? { goal: definition.goal } : {}),
        guardrails: [...definition.guardrails ?? []],
      })
      if (!exposure.exposed) continue
      await audit.recordBackendEvent(ctx, { type: 'experiment.exposed', actor: { userId }, data: { experiment: key, variant: exposure.variant } })
      assigned.push({ key, variant: exposure.variant })
    }
    return assigned
  },
})

/**
 * Keep one persona's answer to "How did you hear about us?", as the first
 * run's <HowDidYouHear> step does: the Analytics tab's growth funnel breaks
 * sign-ups down by it, and the question is not asked again. Returns the
 * answer kept (an earlier one stays).
 */
export const seedSource = internalMutation({
  args: { userId: v.string(), answer: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId, answer }) => {
    requireLocalDeployment()
    const source = await ctx.runMutation(components.backend.funnel.recordSource, { userId, answer })
    return source.answer
  },
})
