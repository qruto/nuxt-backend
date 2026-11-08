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

/** What a list of gateways holds: quoted names, and commas between them. */
const GATEWAY_LIST = /^\s*(?:(['"`])(?:convex|vercel)\1\s*(?:,\s*)?)+$/
const GATEWAY_NAME = /['"`](convex|vercel)['"`]/g
/** One quoted gateway name, whole. */
const GATEWAY_LITERAL = /^(['"`])(convex|vercel)\1$/

/**
 * `code` twice, each the same length so an index points at the same
 * character in both: `plain` with comments blanked, `bare` with the
 * insides of strings blanked too, where only the code's structure is left.
 */
function blanked(code: string): { plain: string, bare: string } {
  const spaces = (token: string) => token.replace(/[^\n]/g, ' ')
  const plain = code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? spaces(token) : token)
  const bare = code.replace(STRINGS_AND_COMMENTS, token => token.startsWith('/') ? spaces(token) : token[0] + spaces(token.slice(1, -1)) + token.at(-1))
  return { plain, bare }
}

const OPEN = '([{'
const CLOSE = ')]}'

/** The index of the bracket that closes the one at `at`, in `bare`; `-1` when none does. */
function closing(bare: string, at: number): number {
  let depth = 0
  for (let index = at; index < bare.length; index++) {
    if (OPEN.includes(bare[index]!)) depth++
    else if (CLOSE.includes(bare[index]!) && --depth === 0) return index
  }
  return -1
}

/** The top-level parts of a bracketed span of `bare` (`from` and `to` the brackets), split at its commas. */
function topLevelParts(bare: string, from: number, to: number): Array<[number, number]> {
  const parts: Array<[number, number]> = []
  let depth = 0
  let start = from + 1
  for (let index = from + 1; index < to; index++) {
    const char = bare[index]!
    if (OPEN.includes(char)) depth++
    else if (CLOSE.includes(char)) depth--
    else if (char === ',' && depth === 0) {
      parts.push([start, index])
      start = index + 1
    }
  }
  if (bare.slice(start, to).trim()) parts.push([start, to])
  return parts
}

/** A gateway order as `setupAi` was given it, or `'unread'` when doctor cannot read it as a literal. */
type ReadOrder = NamedGateway[] | 'unread' | undefined

/** The `setupAi` options doctor reads, as a property's key: quoted or not, before its value or alone (the shorthand). */
const OPTION_KEY = {
  gateway: /^(['"`]?)gateway\1\s*(:|$)/,
  routes: /^(['"`]?)routes\1\s*(:|$)/,
} as const

/**
 * One option of a `setupAi(…)` call, as written: its value's source,
 * `undefined` when the options leave it out, or `'unread'` when they are
 * no object literal, spread another object in, or give it as the shorthand
 * (`{ gateway }`).
 */
function optionOfCall(plain: string, bare: string, open: number, name: keyof typeof OPTION_KEY): string | 'unread' | undefined {
  const close = closing(bare, open)
  if (close < 0) return 'unread'
  const options = topLevelParts(bare, open, close)[1]
  if (!options) return undefined
  const start = options[0] + (bare.slice(options[0], options[1]).length - bare.slice(options[0], options[1]).trimStart().length)
  if (bare[start] !== '{') return 'unread'
  const end = closing(bare, start)
  let value: string | undefined
  for (const [from, to] of topLevelParts(bare, start, end)) {
    if (bare.slice(from, to).trim().startsWith('...')) return 'unread'
    // The key read off `plain`, where a quoted key keeps its name.
    const text = plain.slice(from, to).trim()
    const key = OPTION_KEY[name].exec(text)
    if (!key) continue
    if (!key[2]) return 'unread'
    value = text.slice(key[0].length).trim()
  }
  return value
}

/**
 * The order one `setupAi(…)` call names: `undefined` when its options
 * leave `gateway` out, `'unread'` when doctor cannot read them
 * ({@link optionOfCall}) or `gateway` is anything but a quoted name or a
 * list of them (a variable, an empty list).
 */
function orderOfCall(plain: string, bare: string, open: number): ReadOrder {
  const value = optionOfCall(plain, bare, open, 'gateway')
  if (value === undefined || value === 'unread') return value
  const single = GATEWAY_LITERAL.exec(value)
  if (single) return [single[2] as NamedGateway]
  if (value.startsWith('[') && value.endsWith(']') && GATEWAY_LIST.test(value.slice(1, -1))) return [...new Set([...value.matchAll(GATEWAY_NAME)].map(([, name]) => name as NamedGateway))]
  return 'unread'
}

/**
 * The gateways the backend in `rootDir` sends its model ids through, in
 * order, read off its `setupAi(…)` calls: `undefined` when none names one
 * (the default order), `'unread'` when doctor cannot read it as a literal
 * (see {@link orderOfCall}) or two calls name different orders.
 */
export function chosenGateways(rootDir: string): NamedGateway[] | 'unread' | undefined {
  const orders: ReadOrder[] = []
  for (const code of backendSources(rootDir)) {
    const { plain, bare } = blanked(code)
    for (const call of bare.matchAll(/\bsetupAi\s*\(/g)) orders.push(orderOfCall(plain, bare, call.index + call[0].length - 1))
  }
  if (orders.includes('unread')) return 'unread'
  const named = new Set(orders.map(order => (order as NamedGateway[] | undefined)?.join(',') ?? 'convex,vercel'))
  if (named.size > 1) return 'unread'
  return orders.find(order => order !== undefined) as NamedGateway[] | undefined
}

/** The end of the value that starts at `from` in `bare`: the comma or closing bracket at its own depth. */
function valueEnd(bare: string, from: number): number {
  let depth = 0
  for (let index = from; index < bare.length; index++) {
    const char = bare[index]!
    if (OPEN.includes(char)) depth++
    else if (CLOSE.includes(char) && depth-- === 0) return index
    else if (char === ',' && depth === 0) return index
  }
  return bare.length
}

/**
 * Whether the backend in `rootDir` checks images with the safety classifier:
 * `images` inside an `ai.moderate(…)` or `ai.requireSafe(…)` call, or in a
 * `moderate` option of an action, a stream or a job.
 */
export function checksImages(rootDir: string): boolean {
  return backendSources(rootDir).some((code) => {
    const { bare } = blanked(code)
    for (const match of bare.matchAll(/\b(?:moderate|requireSafe)\s*([(:])/g)) {
      const at = match.index + match[0].length - 1
      const end = match[1] === '(' ? closing(bare, at) : valueEnd(bare, at + 1)
      if (/\bimages\b/.test(bare.slice(at, end < 0 ? bare.length : end))) return true
    }
    return false
  })
}

/** Whether the backend in `rootDir` names its own safety classifier: `moderation: { model }` in `setupAi`. */
export function namesModerationModel(rootDir: string): boolean {
  return backendSources(rootDir).some((code) => {
    const { bare } = blanked(code)
    for (const match of bare.matchAll(/\bmoderation\s*:\s*\{/g)) {
      const open = match.index + match[0].length - 1
      if (/\bmodel\b/.test(bare.slice(open, closing(bare, open)))) return true
    }
    return false
  })
}

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

/** The routes of one `setupAi(…)` call: a literal map read, none, or `'unread'`. */
function routesOfCall(plain: string, bare: string, open: number): Record<string, NamedGateway[]> | 'unread' | undefined {
  const value = optionOfCall(plain, bare, open, 'routes')
  if (value === undefined || value === 'unread') return value
  if (!value.startsWith('{') || !value.endsWith('}')) return 'unread'
  const body = value.slice(1, -1)
  if (body.trim() === '') return undefined
  return routeEntries(body) ?? 'unread'
}

/**
 * The gateway orders the backend in `rootDir` gives some models
 * (`setupAi({ routes })`): `undefined` when no `setupAi` call names any,
 * `'unread'` when one names them as anything but a literal map (a
 * constant, the shorthand `{ routes }`, a computed key) or two calls differ.
 */
export function chosenRoutes(rootDir: string): Record<string, NamedGateway[]> | 'unread' | undefined {
  const found: Array<Record<string, NamedGateway[]> | 'unread' | undefined> = []
  for (const code of backendSources(rootDir)) {
    const { plain, bare } = blanked(code)
    for (const call of bare.matchAll(/\bsetupAi\s*\(/g)) found.push(routesOfCall(plain, bare, call.index + call[0].length - 1))
  }
  if (found.includes('unread')) return 'unread'
  const named = found.filter((routes): routes is Record<string, NamedGateway[]> => routes !== undefined)
  if (new Set(named.map(routes => JSON.stringify(routes))).size > 1) return 'unread'
  return named[0]
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
