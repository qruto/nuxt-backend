/**
 * The `provider/model` ids an app's backend names: what `doctor` reads to
 * tell which route they take (the Convex AI Gateway, or the Vercel AI Gateway
 * with `AI_GATEWAY_API_KEY`) and whether one is ready. A model is named in
 * a `model` option (`setupAi`, an action, a stream) or a `ctx.model()` call,
 * as a string literal; a model object of the app's own carries its provider's
 * key and needs none.
 *
 * A read of the source rather than of the deployment: a deployed function
 * cannot be asked which model it would call without calling it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
// `model: 'openai/gpt-5-mini'` or `model('openai/gpt-5-mini')`, with the
// runtime's own id pattern: an id it accepts is one read here.
import { NAMED_MODEL } from './convex/integrations/ai/model-id'
import { resolveFunctionsDir } from './scaffold'

/**
 * A string literal or a comment, whichever starts first: strings are read
 * whole, so a `//` or `/*` inside one (a URL, a glob) starts no comment.
 */
const STRINGS_AND_COMMENTS = /(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g

/** The source files of a functions directory, codegen left out. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(file => /\.[cm]?[jt]s$/.test(file) && !file.endsWith('.d.ts') && !file.split(/[\\/]/).includes('_generated'))
    .map(file => join(dir, file))
}

/** The model ids `code` names, comments left out. */
export function modelIdsIn(code: string): string[] {
  const uncommented = code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? '' : token)
  return [...uncommented.matchAll(NAMED_MODEL)].map(([, , id]) => id!)
}

/** The source of each file of the backend in `rootDir`. */
function backendSources(rootDir: string): string[] {
  const dir = join(rootDir, resolveFunctionsDir(rootDir))
  if (!existsSync(dir)) return []
  return sourceFiles(dir).map(file => readFileSync(file, 'utf8'))
}

/** Every `provider/model` id the backend in `rootDir` names, once each, sorted. */
export function namedModels(rootDir: string): string[] {
  const ids = new Set(backendSources(rootDir).flatMap(modelIdsIn))
  return [...ids].sort()
}

/** `setupAi({ inferenceRegion: 'eu' })`, as a literal: the region every call is pinned to. */
const INFERENCE_REGION = /\binferenceRegion\s*:\s*(['"`])([a-z]+)\1/

/** The inference region the backend in `rootDir` pins its model calls to, when it names one. */
export function pinnedRegion(rootDir: string): string | undefined {
  for (const code of backendSources(rootDir)) {
    const match = INFERENCE_REGION.exec(code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? '' : token))
    if (match) return match[2]
  }
  return undefined
}

/** A gateway `setupAi({ gateway })` may name. */
export type NamedGateway = 'convex' | 'vercel'

/**
 * `setupAi({ gateway: 'vercel' })` or `gateway: ['vercel', 'convex']`, as a
 * literal. The object `providerOptions: { gateway: { … } }` takes is never
 * one: it starts with a brace.
 */
const GATEWAY_ORDER = /\bgateway\s*:\s*(?:(['"`])(convex|vercel)\1|\[([^\]]*)\])/
/** What a list of gateways holds: quoted names, and commas between them. */
const GATEWAY_LIST = /^\s*(?:(['"`])(?:convex|vercel)\1\s*(?:,\s*)?)+$/
const GATEWAY_NAME = /['"`](convex|vercel)['"`]/g

/**
 * The gateways the backend in `rootDir` sends its model ids through, in
 * order, when it names them as a literal; `undefined` when it names none or
 * builds the order at run time, read as the default order.
 */
export function chosenGateways(rootDir: string): NamedGateway[] | undefined {
  for (const code of backendSources(rootDir)) {
    const match = GATEWAY_ORDER.exec(code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? '' : token))
    if (!match || (match[3] !== undefined && !GATEWAY_LIST.test(match[3]))) continue
    const names = match[2] ? [match[2]] : [...match[3]!.matchAll(GATEWAY_NAME)].map(([, name]) => name!)
    return [...new Set(names as NamedGateway[])]
  }
  return undefined
}

/** `routes: { … }` with no object inside it: a literal map of model ids or patterns to gateways. */
const ROUTES_MAP = /\broutes\s*:\s*\{([^{}]*)\}/
/** One route: a quoted id or pattern, and a quoted gateway or a list of them. */
const ROUTE_ENTRY = /\s*(['"`])([^'"`/]+\/[^'"`]+)\1\s*:\s*(?:(['"`])(convex|vercel)\3|\[([^\]]*)\])\s*(?:,|$)/y

/** A routes map's entries, when it holds nothing but literal routes. */
function routeEntries(body: string): Record<string, NamedGateway[]> | undefined {
  const routes: Record<string, NamedGateway[]> = {}
  ROUTE_ENTRY.lastIndex = 0
  while (ROUTE_ENTRY.lastIndex < body.length && body.slice(ROUTE_ENTRY.lastIndex).trim() !== '') {
    const at = ROUTE_ENTRY.lastIndex
    const match = ROUTE_ENTRY.exec(body)
    if (!match || match.index !== at || (match[5] !== undefined && !GATEWAY_LIST.test(match[5]))) return undefined
    const names = match[4] ? [match[4]] : [...match[5]!.matchAll(GATEWAY_NAME)].map(([, name]) => name!)
    routes[match[2]!] = [...new Set(names as NamedGateway[])]
  }
  return Object.keys(routes).length === 0 ? undefined : routes
}

/**
 * The gateway orders the backend in `rootDir` gives some models
 * (`setupAi({ routes })`), when it names them as a literal map;
 * `undefined` when it names none, or builds them at run time.
 */
export function chosenRoutes(rootDir: string): Record<string, NamedGateway[]> | undefined {
  for (const code of backendSources(rootDir)) {
    const match = ROUTES_MAP.exec(code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? '' : token))
    const routes = match ? routeEntries(match[1]!) : undefined
    if (routes) return routes
  }
  return undefined
}

/** `setupAi({ provenance })` turned on (anything but `false`), or a `ctx.storeImage(…)` call. */
const PROVENANCE_ON = /\bprovenance\s*:(?!\s*(?:false|undefined)\b)|\.storeImage\s*\(/

/** Whether the backend in `rootDir` writes content credentials: what `env push` generates a signing key for, and `doctor` checks. */
export function usesProvenance(rootDir: string): boolean {
  return backendSources(rootDir).some(code => PROVENANCE_ON.test(code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? '' : token)))
}

/** `setupAi(...)`, and the `spendLimit` option of one. */
const SETUP_AI_CALL = /\bsetupAi\s*\(/
const SPEND_LIMIT = /\bspendLimit\s*:/

/** `ai.chat(...)` / `ai.knowledge(...)`: the calls that need Convex's Agent and RAG components mounted. */
const CHAT_CALL = /\.chat\s*\(\s*\{/
const KNOWLEDGE_CALL = /\.knowledge\s*\(\s*\{/
/** A job kind or queue open to signed-out visitors: `guest: true`, or `guest: { perVisitor }`. */
const GUEST_JOBS = /\bguest\s*:\s*(?:true\b|\{)/

/**
 * What the backend in `rootDir` declares that needs more than the backend
 * component: chats, knowledge stores, guest jobs; and whether it calls
 * `setupAi` with a daily `spendLimit`, which a sandbox needs before it makes
 * model calls.
 */
export function aiFeatures(rootDir: string): { chat: boolean, knowledge: boolean, guestJobs: boolean, setupAi: boolean, spendLimit: boolean } {
  const sources = backendSources(rootDir).map(code => code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? '' : token))
  return {
    chat: sources.some(code => CHAT_CALL.test(code)),
    knowledge: sources.some(code => KNOWLEDGE_CALL.test(code)),
    guestJobs: sources.some(code => GUEST_JOBS.test(code)),
    setupAi: sources.some(code => SETUP_AI_CALL.test(code)),
    spendLimit: sources.some(code => SPEND_LIMIT.test(code)),
  }
}

/**
 * Whether the app's `convex.config.ts` mounts a component: it imports the
 * package's `convex.config` by name and passes that name to `app.use`.
 */
export function mountsComponent(rootDir: string, pkg: '@convex-dev/agent' | '@convex-dev/rag'): boolean {
  const path = join(rootDir, resolveFunctionsDir(rootDir), 'convex.config.ts')
  if (!existsSync(path)) return false
  const code = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
  const imported = COMPONENT_IMPORT[pkg].exec(code)?.[1]
  return imported !== undefined && [...code.matchAll(USE_CALL)].some(([, name]) => name === imported)
}

/** `import agent from '@convex-dev/agent/convex.config'`, and the RAG component's: the name each is imported by. */
const COMPONENT_IMPORT = {
  '@convex-dev/agent': /import\s+(\w+)\s+from\s+['"]@convex-dev\/agent\/convex\.config(?:\.js)?['"]/,
  '@convex-dev/rag': /import\s+(\w+)\s+from\s+['"]@convex-dev\/rag\/convex\.config(?:\.js)?['"]/,
} as const

/** `app.use(name`: each component the config mounts, by the name it was imported by. */
const USE_CALL = /\.use\(\s*(\w+)\b/g
