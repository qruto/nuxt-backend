/**
 * The seed registry: how each persona of `personas.mjs` gets its state on
 * the local deployment. Every step claims the persona fields it reads and
 * runs over the personas that have them, in this order. Accounts go through
 * the website's `personas:*` functions. A workspace with no plan of its own
 * is put on the catalog's free plan by the package itself, through the
 * backfill's function: a subscription made without a checkout, at the
 * billing provider's sandbox.
 *
 * What costs a payment (a paid plan, a credit pack, the payment of a gift)
 * is never faked: Polar's sandbox takes a payment only at its checkout, so
 * the kit leaves it to whoever walks the guide and says which persona needs
 * which purchase, with the test card.
 *
 * Beside the personas, the kit fills Panels' canned-idea cache through
 * its internal entry (`demo:seedInternal`), as the admin console's Demo tab
 * does: one free job per idea, the app's own, drawn by real models through
 * the AI gateway, so only when the deployment holds a gateway key.
 *
 * A step is idempotent: a second `pnpm try` finds the state in place and
 * changes nothing twice.
 */
import { readFileSync } from 'node:fs'
import { PERSONAS } from './personas.mjs'

/** A persona's account fields, which the accounts step sends to the deployment. */
const ACCOUNT_FIELDS = ['key', 'email', 'name', 'role', 'passkeyOnly', 'locale', 'workspace', 'joins']

/** The fixture panels a ready strip is drawn with, as base64 PNG images: small files committed beside the kit. */
export function fixturePanels() {
  return [1, 2, 3].map(index => readFileSync(new URL(`./fixtures/panel-${index}.png`, import.meta.url)).toString('base64'))
}

/**
 * Personas in seeding order: one that joins another's workspace after the
 * one it joins, the rest as listed. Throws on a persona joining one that
 * does not exist, or a loop.
 */
export function seedOrder(personas) {
  const byKey = new Map(personas.map(persona => [persona.key, persona]))
  const ordered = []
  const visiting = new Set()
  const visit = (persona) => {
    if (ordered.includes(persona)) return
    if (visiting.has(persona.key)) throw new Error(`Persona ${persona.key} joins a workspace in a loop.`)
    visiting.add(persona.key)
    if (persona.joins) {
      const host = byKey.get(persona.joins.persona)
      if (!host) throw new Error(`Persona ${persona.key} joins ${persona.joins.persona}, which is no persona.`)
      visit(host)
    }
    visiting.delete(persona.key)
    ordered.push(persona)
  }
  for (const persona of personas) visit(persona)
  return ordered
}

async function seedAccounts(personas, context, accounts) {
  const seeded = await context.convexRun('personas:seed', {
    personas: personas.map(persona => Object.fromEntries(ACCOUNT_FIELDS.filter(field => persona[field] !== undefined).map(field => [field, persona[field]]))),
  })
  for (const account of seeded) {
    accounts.set(account.key, account)
    if (account.created) context.log(`Persona ${account.key}: account created`)
  }
}

/**
 * Put each persona's own workspace on the catalog's free plan through
 * `billing:startFreePlan`, the package's own start (the backfill's
 * function): the seeded accounts are written outside the auth routes, so
 * nothing queued it. It makes the workspace's customer as the package
 * does, leaves one on a plan as it is, and starts none without a free plan
 * in the catalog (or without the sandbox's catalog synced).
 */
async function startFreePlans(personas, context, accounts) {
  if (!context.catalog?.free) return
  for (const persona of personas) {
    const account = accounts.get(persona.key)
    const started = await context.convexRun('billing:startFreePlan', { entityId: account.workspaceId })
    if (started === 'started') context.log(`Persona ${persona.key}: on the free plan`)
  }
}

/** What a persona's billing state costs, in words: the purchase that gives it. */
export function purchaseOf(persona) {
  if (persona.plan) return `subscribe its workspace to ${persona.plan} on /playground/pricing`
  if (persona.gift) return `buy ${persona.gift.pack} and give it to ${persona.gift.to} on /playground/gifts`
  return `buy ${persona.pack} on /playground/pricing`
}

/**
 * The purchases the kit leaves to you: say which persona needs which, once.
 * Polar's sandbox takes a payment at its checkout only (test card
 * 4242 4242 4242 4242), so nothing here pays for anyone.
 */
async function listPurchases(personas, context) {
  for (const persona of personas) context.log(`Persona ${persona.key}: ${purchaseOf(persona)} with the test card to give it its state`)
}

/**
 * Give the personas their strips, in one call: each in its author's
 * workspace, a ready one drawn with the fixture panels and announced, a
 * reported one reported by the persona it names.
 */
async function seedStrips(personas, context, accounts) {
  const strips = personas.flatMap((persona) => {
    const { userId, workspaceId } = accounts.get(persona.key)
    return persona.strips.map(({ idea, status, captions, reportedBy }) => ({
      authorId: userId,
      authorEmail: persona.email,
      workspaceId,
      idea,
      status,
      ...(captions ? { captions } : {}),
      ...(reportedBy ? { reporterId: accounts.get(reportedBy).userId } : {}),
    }))
  })
  const created = await context.convexRun('personas:seedStrips', { strips, panels: context.panels ?? fixturePanels() })
  for (const idea of created) context.log(`Strip "${idea}" seeded`)
}

/** Put each persona in its experiments; one already in an experiment stays on its variant. */
async function assignExperiments(personas, context, accounts) {
  for (const persona of personas) {
    const { userId } = accounts.get(persona.key)
    const assigned = await context.convexRun('personas:seedExperiments', { userId, keys: persona.experiments })
    for (const { key, variant } of assigned) context.log(`Persona ${persona.key}: ${key} reads ${variant}`)
  }
}

/** Keep each persona's answer to "How did you hear about us?"; an earlier answer stays. */
async function answerSource(personas, context, accounts) {
  for (const persona of personas) {
    const { userId } = accounts.get(persona.key)
    await context.convexRun('personas:seedSource', { userId, answer: persona.source })
  }
}

/**
 * The seed registry, in the order its steps run. `fields` are the persona
 * fields a step reads: every field a persona carries is claimed by one step
 * (test/unit/try-personas.test.ts).
 */
export const SEEDS = [
  { name: 'accounts', fields: ['key', 'label', 'name', 'email', 'summary', 'role', 'passkeyOnly', 'locale', 'workspace', 'joins'], applies: () => true, run: seedAccounts },
  // Every workspace of its own starts on the free plan, a paid persona's too: its purchase moves it off.
  { name: 'free plan', fields: [], applies: persona => !persona.joins, run: startFreePlans },
  { name: 'purchases', fields: ['plan', 'pack', 'gift'], applies: persona => Boolean(persona.plan || persona.pack || persona.gift), run: listPurchases },
  { name: 'strips', fields: ['strips'], applies: persona => Boolean(persona.strips?.length), run: seedStrips },
  { name: 'experiments', fields: ['experiments'], applies: persona => Boolean(persona.experiments?.length), run: assignExperiments },
  { name: 'source', fields: ['source'], applies: persona => Boolean(persona.source), run: answerSource },
]

/**
 * Fill Panels' canned-idea cache through its internal entry, as the admin
 * console's Demo tab does: a free job per idea not drawn yet, the app's own.
 * Its models are real, so it runs only when the deployment holds an AI
 * gateway key; a refusal (the `pause_ai` switch, the spend limit) is said
 * and leaves the rest seeded.
 */
async function fillCannedCache(context) {
  if (!context.ai) {
    context.log('Canned ideas: not drawn, with no AI_GATEWAY_API_KEY. Add one to the root .env.local, or draw them later from the admin console\'s Demo tab.')
    return
  }
  try {
    const { queued } = await context.convexRun('demo:seedInternal', {})
    if (queued) context.log(`Canned ideas: ${queued} queued to draw, the app's own jobs`)
  }
  catch (error) {
    context.log(`Canned ideas: not drawn — ${error.message.split('\n')[0]}`)
  }
}

/**
 * Seed every persona: each step over the personas it applies to, in
 * registry order, then the canned-idea cache. `context` gives
 * `convexRun(fn, args)`, the sandbox `catalog` ids (`billing.generated.ts`,
 * absent while billing is missing), `ai` (the deployment holds an AI gateway
 * key), the fixture `panels` (read from `fixtures/` when absent) and `log`.
 * Resolves with the seeded accounts by persona key.
 */
export async function seedPersonas(context, personas = PERSONAS) {
  const ordered = seedOrder(personas)
  const accounts = new Map()
  // A wiped deployment lost its products: load them from the sandbox again.
  if (context.catalog) await context.convexRun('billing:syncProducts', {})
  for (const step of SEEDS) {
    const applies = ordered.filter(step.applies)
    if (applies.length > 0) await step.run(applies, context, accounts)
  }
  await fillCannedCache(context)
  return accounts
}
