/**
 * Reference › Backend › Hooks and guarantees: every function an app hands a
 * setup helper for the package to call, read from the helpers' option
 * types, with what the package promises about each call: the `@guarantee`
 * tag on the option's own doc comment, beside the code that keeps it. A hook
 * without a description, the tag, or one of its five items fails the lookup.
 */
import { blocks, table } from './markdown.mjs'
import { firstSentence, interfaceFields, tagItems, ts } from './source.mjs'

/** The option types that carry hooks: the helper, the file, the interface and the prefix its members take. */
const HOOK_SOURCES = [
  ['setupAuth', 'src/convex/client/auth-types.ts', 'AuthIntegrations', ''],
  ['setupBilling', 'src/convex/integrations/billing/types/setup.ts', 'SetupBillingConfig', ''],
  ['setupEmail', 'src/convex/integrations/email.ts', 'SetupEmailOptions', ''],
  ['setupEmail', 'src/convex/integrations/inbound.ts', 'InboundOptions', 'inbound.'],
  ['setupAi', 'src/convex/integrations/ai/config.ts', 'AiCreditsConfig', 'credits.'],
  ['setupAudit', 'src/convex/integrations/audit.ts', 'SetupAuditOptions', ''],
]

/** The items every `@guarantee` tag states, in the order the page shows them. */
const ITEMS = ['Runs', 'Delivery', 'Order', 'When it throws', 'Idempotency']

/** Whether an option is a hook: a function, a handler map, or a named `On…`/`Can…` function type. */
function isHook(field) {
  const node = field.typeNode
  if (!node) return false
  if (ts.isFunctionTypeNode(node) || (ts.isParenthesizedTypeNode(node) && ts.isFunctionTypeNode(node.type))) return true
  if (ts.isUnionTypeNode(node)) return node.types.some(type => ts.isFunctionTypeNode(type))
  return /(?:^|<)(?:On[A-Z]\w*|Can[A-Z]\w*|\w*Handlers)\b/.test(field.type)
}

/** One hook's description and guarantees; throws when either is missing. */
function hookOf(helper, file, name, prefix, field) {
  const where = `${file}: ${name}.${field.name}`
  const guarantee = tagItems(field.node, 'guarantee')
  if (!guarantee) throw new Error(`${where} is a hook with no @guarantee tag`)
  const missing = ITEMS.filter(item => !guarantee[item])
  if (missing.length) throw new Error(`${where}'s @guarantee lacks ${missing.join(', ')}`)
  if (!field.doc) throw new Error(`${where} is a hook with no description`)
  return { helper, option: `${prefix}${field.name}`, doc: firstSentence(field.doc), guarantee }
}

/** Every hook the setup helpers take, in the order their option types declare them. */
function hooks() {
  return HOOK_SOURCES.flatMap(([helper, file, name, prefix]) => interfaceFields(file, name).filter(isHook).map(field => hookOf(helper, file, name, prefix, field)))
}

/** A guarantee item as a table cell: its first letter raised. */
const sentence = text => text.replace(/^[a-z]/, letter => letter.toUpperCase())

/** One section per hook: what it is for, then what the package promises about each call. */
export function hooksSections() {
  return blocks(hooks().map(({ helper, option, doc, guarantee }) => blocks(
    `### \`${helper}({ ${option} })\``,
    doc,
    table(ITEMS, [ITEMS.map(item => sentence(guarantee[item]))]),
  )))
}
