import { describe, expect, it } from 'vitest'
import { PERSONAS, type TryPersona } from '../../scripts/try/personas.mjs'
import { fixturePanels, purchaseOf, type SeedContext, SEEDS, seedOrder, seedPersonas } from '../../scripts/try/seeds.mjs'
import { SOURCE_ANSWERS } from '../../src/convex/funnel-rules'
import declared from '../../website/backend/billing.catalog'
import { flags } from '../../website/backend/flags'
import { localDeploymentRefusal } from '../../website/backend/personas'
import { isSandboxIdentity } from '../../website/utils/testEmail'

// The try kit's seed registry: the personas `pnpm try` seeds, and the steps
// that give each its state on Panels, the app the site serves under
// /playground. A feature that needs a new persona adds it and the step for
// its fields; this holds the registry whole. Billing runs in Polar's
// sandbox, which takes a payment at its checkout only, so a paid state is a
// purchase the kit lists, never one it fakes.

/** Panels' catalog as plain keys: its plans and packs by name. */
const billingCatalog = declared as { plans?: Record<string, unknown>, packs?: Record<string, unknown> }

const byKey = new Map(PERSONAS.map(persona => [persona.key, persona]))

/** The PNG signature every fixture panel starts with. */
const PNG = [0x89, 0x50, 0x4E, 0x47]

describe('the personas', () => {
  it('each have a unique key and a unique test identity to sign in with', () => {
    expect(new Set(PERSONAS.map(persona => persona.key)).size).toBe(PERSONAS.length)
    expect(new Set(PERSONAS.map(persona => persona.email)).size).toBe(PERSONAS.length)
    for (const persona of PERSONAS) expect(isSandboxIdentity(persona.email), persona.email).toBe(true)
  })

  it('cover the accounts every feature is tried as', () => {
    expect(byKey.get('admin')?.role).toBe('admin')
    expect(byKey.get('passkeyAdmin')).toMatchObject({ role: 'admin', passkeyOnly: true })
    expect(byKey.get('owner')).toMatchObject({ workspace: expect.any(String), plan: expect.any(String) })
    expect(byKey.get('member')?.joins).toEqual({ persona: 'owner', role: 'member' })
    // On the catalog's free plan, which the seed starts for a workspace with no plan of its own.
    const free = byKey.get('free')!
    expect(free.plan ?? free.pack ?? free.gift ?? free.role ?? free.joins).toBeUndefined()
    expect(billingCatalog.plans?.free).toBeDefined()
    expect(byKey.get('purchaser')).toMatchObject({ pack: expect.any(String), gift: { to: 'recipient' } })
    expect(byKey.has('recipient')).toBe(true)
  })

  it('start Panels in each state a strip has: drawn, waiting in line, and reported', () => {
    const strips = PERSONAS.flatMap(persona => persona.strips ?? [])
    expect(strips.map(strip => strip.status).sort()).toEqual(['queued', 'ready', 'ready'])
    // A drawn strip has a caption for each of the three panels Panels draws.
    for (const strip of strips.filter(each => each.status === 'ready')) expect(strip.captions, strip.idea).toHaveLength(3)
    expect(strips.filter(strip => strip.reportedBy)).toHaveLength(1)
  })

  it('name only personas that exist, and plans, packs, experiments and answers Panels declares', () => {
    const definitions = flags.definitions as Record<string, { variants?: readonly string[], by?: string }>
    for (const persona of PERSONAS) {
      if (persona.joins) expect(byKey.has(persona.joins.persona), persona.key).toBe(true)
      if (persona.gift) {
        expect(byKey.has(persona.gift.to), persona.key).toBe(true)
        expect(persona.gift.to).not.toBe(persona.key)
        expect(billingCatalog.packs?.[persona.gift.pack], persona.gift.pack).toBeDefined()
      }
      if (persona.plan) expect(billingCatalog.plans?.[persona.plan], persona.plan).toBeDefined()
      if (persona.pack) expect(billingCatalog.packs?.[persona.pack], persona.pack).toBeDefined()
      for (const strip of persona.strips ?? []) {
        if (strip.reportedBy) expect([byKey.has(strip.reportedBy), strip.reportedBy === persona.key], strip.idea).toEqual([true, false])
      }
      // An experiment is a flag with variants, read by account.
      for (const key of persona.experiments ?? []) expect([definitions[key]?.variants?.length ?? 0, definitions[key]?.by ?? 'user'], key).toEqual([2, 'user'])
      if (persona.source) expect(SOURCE_ANSWERS).toContain(persona.source)
    }
  })

  it('draw a ready strip with the committed fixture panels', () => {
    const panels = fixturePanels()
    expect(panels).toHaveLength(3)
    for (const panel of panels) {
      const bytes = Buffer.from(panel, 'base64')
      expect([...bytes.subarray(0, 4)]).toEqual(PNG)
      // Small enough to pass to `convex run` with the rest of the seed.
      expect(bytes.length).toBeLessThan(4096)
    }
  })
})

describe('the seed registry', () => {
  it('claims every field a persona carries in exactly one step', () => {
    const claims = SEEDS.flatMap(step => step.fields.map(field => [field, step.name] as const))
    const owner = new Map<string, string[]>()
    for (const [field, step] of claims) owner.set(field, [...owner.get(field) ?? [], step])
    for (const persona of PERSONAS) {
      for (const field of Object.keys(persona)) expect(owner.get(field), `${persona.key}.${field}`).toHaveLength(1)
    }
  })

  it('seeds a persona after the one whose workspace it joins, and refuses a loop or a stranger', () => {
    const ordered = seedOrder([byKey.get('member')!, byKey.get('owner')!])
    expect(ordered.map(persona => persona.key)).toEqual(['owner', 'member'])
    const loop: TryPersona[] = [
      { key: 'a', label: 'A', name: 'A', email: 'a', summary: '', joins: { persona: 'b', role: 'member' } },
      { key: 'b', label: 'B', name: 'B', email: 'b', summary: '', joins: { persona: 'a', role: 'member' } },
    ]
    expect(() => seedOrder(loop)).toThrow(/loop/)
    expect(() => seedOrder([loop[0]!])).toThrow(/no persona/)
  })
})

/** The deployment the seeding talks to, in memory. */
function fakeWorld(options: { ai?: boolean, cache?: () => unknown } = {}) {
  const calls: Array<[string, Record<string, unknown>]> = []
  const lines: string[] = []
  // The workspaces the package's own free-plan start put on the plan: it answers `subscribed` for one already on it.
  const onFreePlan = new Set<string>()
  const convexRun: SeedContext['convexRun'] = async (fn, args) => {
    calls.push([fn, args])
    if (fn === 'personas:seed') {
      return (args.personas as Array<{ key: string }>).map(({ key }) => ({ key, userId: `user_${key}`, workspaceId: key === 'member' ? 'ws_owner' : `ws_${key}`, created: true }))
    }
    if (fn === 'personas:seedStrips') return (args.strips as Array<{ idea: string }>).map(strip => strip.idea)
    if (fn === 'personas:seedExperiments') return (args.keys as string[]).map(key => ({ key, variant: 'examples' }))
    if (fn === 'personas:seedSource') return args.answer
    if (fn === 'demo:seedInternal') return options.cache ? options.cache() : { queued: 4 }
    if (fn === 'billing:syncProducts') return null
    if (fn === 'billing:startFreePlan') {
      const entityId = args.entityId as string
      if (onFreePlan.has(entityId)) return 'subscribed'
      onFreePlan.add(entityId)
      return 'started'
    }
    throw new Error(`unexpected ${fn}`)
  }
  const context: SeedContext = { convexRun, catalog: { free: 'free', products: { studio: 'studio-id' } }, ai: options.ai ?? true, panels: ['cGFuZWw='], log: line => lines.push(line) }
  return { context, calls, lines, args: (fn: string) => calls.filter(([name]) => name === fn).map(([, body]) => body) }
}

describe('the persona functions\' guard', () => {
  const LOCAL = { CONVEX_CLOUD_URL: 'http://127.0.0.1:3210', TRY_KIT_LOCAL: '1' }

  it('runs on a local deployment only: a loopback URL that the try kit marked local', () => {
    expect(localDeploymentRefusal(LOCAL)).toBeNull()
    expect(localDeploymentRefusal({ ...LOCAL, CONVEX_CLOUD_URL: 'http://localhost:3230' })).toBeNull()
  })

  it('refuses a cloud deployment, and a loopback one without the marker (a self-hosted backend)', () => {
    expect(localDeploymentRefusal({ ...LOCAL, CONVEX_CLOUD_URL: 'https://happy-otter-123.convex.cloud' })).toMatch(/loopback/)
    expect(localDeploymentRefusal({ TRY_KIT_LOCAL: '1' })).toMatch(/loopback/)
    expect(localDeploymentRefusal({ CONVEX_CLOUD_URL: 'http://127.0.0.1:3210' })).toMatch(/marker/)
    expect(localDeploymentRefusal({ ...LOCAL, TRY_KIT_LOCAL: '0' })).toMatch(/marker/)
  })
})

describe('seedPersonas', () => {
  it('seeds the accounts, starts every workspace of its own on the free plan, then the strips, the experiment and the answer', async () => {
    const { context, calls, args } = fakeWorld()
    await seedPersonas(context)
    const [seeded] = args('personas:seed') as Array<{ personas: Array<Record<string, unknown>> }>
    // Only the account fields reach the deployment: what costs a payment is bought at the sandbox checkout.
    expect(seeded!.personas.map(persona => persona.key)).toEqual(['admin', 'passkeyAdmin', 'owner', 'member', 'free', 'purchaser', 'recipient', 'leaving'])
    for (const persona of seeded!.personas) expect(Object.keys(persona).every(field => ['key', 'email', 'name', 'role', 'passkeyOnly', 'locale', 'workspace', 'joins'].includes(field))).toBe(true)
    expect(seeded!.personas[1]).toMatchObject({ role: 'admin', passkeyOnly: true })

    // Every workspace of its own, a paid persona's too, starts on the free plan through the package's own start.
    expect(args('billing:startFreePlan')).toEqual(['ws_admin', 'ws_passkeyAdmin', 'ws_owner', 'ws_free', 'ws_purchaser', 'ws_recipient', 'ws_leaving'].map(entityId => ({ entityId })))
    // The strips, in one call, each in its author's workspace: the member's in Acme, the free user's reported by the owner.
    expect(args('personas:seedStrips')).toEqual([{
      panels: ['cGFuZWw='],
      strips: [
        expect.objectContaining({ authorId: 'user_owner', workspaceId: 'ws_owner', status: 'ready', captions: expect.any(Array) }),
        { authorId: 'user_member', authorEmail: 'delivered+tryworkspacemember@resend.dev', workspaceId: 'ws_owner', idea: 'The office plant plots a takeover', status: 'queued' },
        expect.objectContaining({ authorId: 'user_free', workspaceId: 'ws_free', status: 'ready', reporterId: 'user_owner' }),
      ],
    }])
    expect(args('personas:seedExperiments')).toEqual([{ userId: 'user_free', keys: ['ideaExamples'] }])
    expect(args('personas:seedSource')).toEqual([{ userId: 'user_free', answer: 'podcast' }])
    // A wiped deployment lost its products: they load from the sandbox again, before anything else reads them.
    expect(calls[0]![0]).toBe('billing:syncProducts')
    // The canned ideas come last, through Panels' internal entry.
    expect(calls.at(-1)![0]).toBe('demo:seedInternal')
  })

  it('pays for nobody: it says which persona needs which purchase', async () => {
    const { context, calls, lines } = fakeWorld()
    await seedPersonas(context)
    expect(calls.map(([fn]) => fn)).not.toContain('personas:seedGift')
    const needs = PERSONAS.filter(persona => persona.plan || persona.pack || persona.gift)
    expect(needs.map(persona => persona.key)).toEqual(['owner', 'purchaser'])
    for (const persona of needs) expect(lines.join('\n')).toContain(`Persona ${persona.key}: ${purchaseOf(persona)}`)
    expect(purchaseOf(byKey.get('owner')!)).toBe('subscribe its workspace to studio on /playground/pricing')
    expect(purchaseOf(byKey.get('purchaser')!)).toBe('buy credits100 and give it to recipient on /playground/gifts')
  })

  it('starts no plan and loads no product while billing is missing: no sandbox catalog', async () => {
    const { context, calls } = fakeWorld()
    await seedPersonas({ ...context, catalog: undefined })
    expect(calls.map(([fn]) => fn)).toEqual(['personas:seed', 'personas:seedStrips', 'personas:seedExperiments', 'personas:seedSource', 'demo:seedInternal'])
  })

  it('draws no canned idea without an AI gateway key, and says so', async () => {
    const { context, calls, lines } = fakeWorld({ ai: false })
    await seedPersonas(context)
    expect(calls.map(([fn]) => fn)).not.toContain('demo:seedInternal')
    expect(lines.join('\n')).toMatch(/Canned ideas: not drawn, with no AI_GATEWAY_API_KEY/)
  })

  it('leaves the personas seeded when the canned ideas are refused', async () => {
    const { context, lines } = fakeWorld({ cache: () => Promise.reject(new Error('convex run failed: AI is paused\nmore')) })
    await expect(seedPersonas(context)).resolves.toHaveProperty('size', PERSONAS.length)
    expect(lines.at(-1)).toBe('Canned ideas: not drawn — convex run failed: AI is paused')
  })

  it('starts nothing twice on a second run: the package leaves a workspace on its plan as it is', async () => {
    const { context, args } = fakeWorld()
    await seedPersonas(context)
    await seedPersonas(context)
    expect(args('billing:startFreePlan')).toHaveLength(14)
  })
})
