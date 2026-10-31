/**
 * Reference › Configuration: the environment variables (src/env-registry.ts
 * and the `.env.example` `init` writes), the app config keys
 * (BACKEND_APP_CONFIG_KEYS), every label (LABELS), the project files the
 * scaffold writes (BACKEND_FILE_TEMPLATES and the function contract), and the
 * billing catalog's fields (src/convex/catalog.ts). Also the agent skills
 * `init` copies into a project (AGENT_SKILLS), for the Agents tab.
 */
import { ENV_EXAMPLE } from '../../src/setup.ts'
import { REQUIRED_FUNCTION_EXPORTS } from '../../src/contract.ts'
import { LABELS } from '../../src/convex/labels.ts'
import { BACKEND_ENV } from '../../src/env-registry.ts'
import { AGENT_SKILLS } from '../../src/guidance/skills.ts'
import { capabilityOfEnv } from '../../src/capabilities/index.ts'
import { BACKEND_APP_CONFIG_KEYS, backendAppConfigDefaults } from '../../src/runtime/config.ts'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates.ts'
import { blocks, code, codes, link, table } from './markdown.mjs'
import { diagnosticsLink } from './paths.mjs'
import { textExports } from '../lib/surface.mjs'
import { docText, firstSentence, interfaceFields, membersOf, readText, sourceOf, ts } from './source.mjs'

// --- Environment variables ---------------------------------------------------

const SIDE = { deployment: 'Deployment', app: 'Nuxt app', both: 'Deployment and the app\'s server' }

/** Whether a deploy needs it, and who may set it. */
function requirement(entry) {
  if (entry.required) return 'Required'
  if (entry.tooling) return 'Dev only, set by the tooling'
  if (entry.devOnly) return 'Dev only'
  return 'Optional'
}

/**
 * One variable as the env table states it: its capability, where it is read,
 * whether a deploy needs it, what it takes, an example, what happens without
 * it and the findings that check it. The docs MCP's `get-env-var` answers
 * with the same record (docs-mcp.mjs).
 */
export function envFacts(name) {
  const entry = BACKEND_ENV[name]
  if (!entry) throw new Error(`${name} is not in src/env-registry.ts`)
  return {
    capability: capabilityOfEnv(name),
    readOn: SIDE[entry.side],
    required: requirement(entry),
    takes: entry.webhook ? `${entry.values}; it verifies ${code(entry.webhook)}` : entry.values,
    ...(entry.example ? { example: entry.example } : {}),
    without: entry.without,
    checkedBy: [...entry.findings],
  }
}

/** The env table: one row per name, in registry order. */
export function envTable() {
  return table(
    ['Variable', 'Capability', 'Read on', 'Required', 'Takes', 'Example', 'Without it', 'Checked by'],
    Object.keys(BACKEND_ENV).map((name) => {
      const facts = envFacts(name)
      return [
        code(name),
        link(code(facts.capability), `/docs/reference/capabilities#${facts.capability}`),
        facts.readOn,
        facts.required,
        facts.takes,
        facts.example ? code(facts.example) : '',
        facts.without,
        facts.checkedBy.length ? facts.checkedBy.map(diagnosticsLink).join(', ') : 'none',
      ]
    }),
  )
}

/** The `.env.example` `npx nuxt-backend init` writes, as it writes it. */
export function envExample() {
  return `\`\`\`dotenv [.env.example]\n${ENV_EXAMPLE.trimEnd()}\n\`\`\``
}

// --- App config --------------------------------------------------------------

const CONFIG_FILE = 'src/runtime/config.ts'

/** The member of `BackendAppConfig` at a dotted path (`billing.plans`). */
function appConfigField(path) {
  const [group, key] = path.split('.')
  const parent = interfaceFields(CONFIG_FILE, 'BackendAppConfig').find(field => field.name === group)
  if (!parent || !ts.isTypeLiteralNode(parent.typeNode)) return undefined
  return membersOf(parent.typeNode.members).find(field => field.name === key)
}

/** A default value as the table shows it. */
function shownDefault(path) {
  const value = path.split('.').reduce((node, key) => node?.[key], backendAppConfigDefaults)
  if (path.startsWith('labels.')) return 'the English labels'
  return value === undefined ? 'none' : code(JSON.stringify(value))
}

/** One row per `appConfig.backend` key: its type, default and what it does. */
export function appConfigTable() {
  return table(['Key', 'Type', 'Default', 'What it does'], BACKEND_APP_CONFIG_KEYS.map((path) => {
    if (path.startsWith('labels.')) {
      const group = path.slice('labels.'.length)
      return [code(path), `overrides of the ${code(group)} labels`, shownDefault(path), `Words for the ${link(code(group), `/docs/reference/configuration/labels#${group.toLowerCase()}`)} group, key by key.`]
    }
    const field = appConfigField(path)
    if (!field) throw new Error(`${CONFIG_FILE}: BackendAppConfig has no ${path}`)
    return [code(path), code(field.type), shownDefault(path), firstSentence(field.doc) || 'See the type.']
  }))
}

// --- Labels ------------------------------------------------------------------

/** `AGENT` → `agents`, `ERROR` → `errors`, `AUTH` → `auth`, `CANCEL_FLOW` → `cancelFlow`: the group a label constant fills. */
function toGroup(constant) {
  const name = constant.toLowerCase().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  return Object.hasOwn(LABELS, name) ? name : `${name}s`
}

/** Each label group's doc comment in src/convex/label-groups/<group>.ts (the comment over its `const`), by group. */
function groupDocs() {
  const text = Object.keys(LABELS).map(group => readText(`src/convex/label-groups/${group}.ts`)).join('\n')
  const docs = Object.fromEntries([...text.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*const (\w+)_LABELS = \{/g)]
    .map(([, doc, constant]) => [toGroup(constant), firstSentence(doc.split('\n').map(line => line.replace(/^\s*\* ?/, '')).join('\n').trim())]))
  const missing = Object.keys(LABELS).filter(group => !docs[group])
  if (missing.length) throw new Error(`src/convex/label-groups: read no doc comment over the label groups ${missing.join(', ')}`)
  return docs
}

/** A key's path as a message name: dots between plain words, brackets around the rest. */
const messageName = path => path.reduce((name, key) => /^\w+$/.test(key) ? `${name}.${key}` : `${name}['${key}']`, 'backend')

/** Every leaf of a label tree, as its path and its message. */
function leaves(tree, path = []) {
  return Object.entries(tree).flatMap(([key, value]) => typeof value === 'string' ? [{ path: [...path, key], message: value }] : leaves(value, [...path, key]))
}

/** One section per label group: its keys, English defaults, parameters and plural forms. */
export function labelGroups() {
  const docs = groupDocs()
  return blocks(Object.entries(LABELS).map(([group, tree]) => blocks(
    `### \`${group}\``,
    docs[group],
    table(['Message', 'English', 'Params', 'Forms'], leaves(tree, [group]).map(({ path, message }) => {
      const params = [...new Set([...message.matchAll(/\{(\w+)\}/g)].map(([, name]) => name))]
      const forms = message.split('|').length
      return [code(messageName(path)), code(message), codes(params, ''), forms > 1 ? String(forms) : '']
    })),
  )))
}

// --- Project files -----------------------------------------------------------

/** Who writes a scaffolded file after the first time. */
export const REGENERATED = { 'billing.generated.ts': '`npx nuxt-backend billing sync` rewrites it' }

/** The project files outside the functions directory, and the one the platform writes inside it. */
const OTHER_FILES = [
  ['`backend/_generated/`', 'The platform\'s codegen: `npx convex dev` (and `nuxt-backend dev`) rewrites it', 'none', '`convex-codegen` checks it exists'],
  ['`.env.example`', 'Yours: `init` writes it once, `--force` rewrites it', 'none', 'none'],
  ['`AGENTS.md`', 'Yours, but for the `nuxt-backend` section between its markers, which `init` keeps current', 'none', 'none'],
  ['`.mcp.json`', 'Yours: `init` adds the developer MCP server (`nuxt-backend`) once', 'none', 'none'],
  ['`.agents/skills/nuxt-backend*/`', 'The package\'s: `init` copies the agent skills of the installed version, `init --agents` (or `--force`) refreshes them; one the project\'s `skills-lock.json` lists is the skills CLI\'s', 'none', `${diagnosticsLink('agent-files')} checks they match the installed version`],
]

/** One row per scaffolded file: who owns it, what it exports, and which exports `doctor` holds it to. */
export function projectFilesTable() {
  const rows = Object.entries(BACKEND_FILE_TEMPLATES).map(([file, text]) => {
    const module = file.replace(/\.ts$/, '')
    const contract = REQUIRED_FUNCTION_EXPORTS[module] ?? []
    return [
      code(`backend/${file}`),
      REGENERATED[file] ? `Regenerated: ${REGENERATED[file]}` : 'Yours: written once, never overwritten without `--force`',
      codes(textExports(text)),
      contract.length ? `${diagnosticsLink('function-contract')}: ${codes(contract)}` : 'none',
    ]
  })
  return table(['File', 'Who writes it', 'Exports', 'Held to'], [...rows, ...OTHER_FILES])
}

/** The scaffold as a tree, in the order `init` writes it. */
export function projectTree() {
  const files = Object.keys(BACKEND_FILE_TEMPLATES)
  const lines = ['backend/', ...files.map((file, index) => `${index === files.length - 1 ? '└─' : '├─'} ${file}`)]
  return `\`\`\`text\n${lines.join('\n')}\n\`\`\``
}

// --- Catalog files -----------------------------------------------------------

const CATALOG = 'src/convex/catalog.ts'

/** The catalog's types, in the order a catalog file nests them. */
const CATALOG_TYPES = ['BillingCatalog', 'CatalogMeter', 'CatalogPlan', 'CatalogPack', 'CatalogCreditGrant', 'CatalogTrial', 'CatalogUsagePrice', 'CatalogFeature', 'CatalogQuota', 'CatalogCustomField']

/** A field table for one interface. */
function fieldTable(file, name) {
  return table(['Field', 'Type', 'Required', 'What it is'], interfaceFields(file, name).map(field => [
    code(field.name),
    code(field.type),
    field.optional ? 'no' : 'yes',
    firstSentence(field.doc),
  ]))
}

/** The doc comment over one of the catalog's types. */
function typeDoc(name) {
  const statement = sourceOf(CATALOG).statements.find(candidate =>
    (ts.isInterfaceDeclaration(candidate) || ts.isTypeAliasDeclaration(candidate)) && candidate.name.text === name)
  return statement ? firstSentence(docText(statement)) : ''
}

/** A section per catalog type, in the order a catalog file nests them. */
export function catalogTypes() {
  return blocks(CATALOG_TYPES.map(name => blocks(`### \`${name}\``, typeDoc(name), fieldTable(CATALOG, name))))
}

/** The id map `billing sync` writes to `billing.generated.ts`, per environment. */
export function catalogIds() {
  return fieldTable('src/convex/integrations/billing/types/records.ts', 'BillingCatalogIds')
}

// --- Agent skills ------------------------------------------------------------

/** The agent skills the package ships, the core first, each with what it covers. */
export function agentSkillsTable() {
  return table(['Skill', 'What it covers'], AGENT_SKILLS.map(skill => [code(skill.name), skill.covers.replace(/^\w/, letter => letter.toUpperCase())]))
}
