/**
 * Reference › Components: the contract table (test/nuxt/component-contract.ts,
 * which the contract tests render every component against), one family page
 * per group of components with each component's props read from its source,
 * and the theme tokens (tokens.css and the family stylesheets).
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND_PAGE_DEFS } from '../../src/pages/registry.ts'
import { COMPONENT_CONTRACT } from '../../test/nuxt/component-contract.ts'
import { blocks, code, codes, link, table } from './markdown.mjs'
import { PAGES } from './paths.mjs'
import { UI_ENTRIES, UI_PARTS, uiPath } from '../../src/ui/registry.ts'
import { registeredComponents, summaryOf, tierOf } from './registry.mjs'
import { docOf, docText, readText, root, sourceOf, ts } from './source.mjs'

const COMPONENTS_DIR = 'src/runtime/vue/components'

/** A sentence's first letter lowered, to follow a colon. */
const lowerFirst = text => text.replace(/^([A-Z])(?=[a-z])/, first => first.toLowerCase())

/** The family pages, each with the components it documents, in registry order. */
export const FAMILY_PAGES = {
  account: ['AuthForm', 'WaitlistForm', 'ConsentPrompt', 'ReauthenticateDialog', 'ProfileSettings', 'SecuritySettings', 'AccountData', 'OnboardingFlow', 'ActivationChecklist', 'HowDidYouHear'],
  workspaces: ['WorkspaceSettings', 'AcceptInvitation', 'AuditLog', 'AdminUsers', 'AdminWorkspaces'],
  billing: ['PricingTable', 'BillingCheckoutLink', 'BillingPortalLink', 'BillingHistory', 'UsageHistory', 'UpgradePrompt', 'CancelFlow', 'WithdrawalButton', 'ReferralCard'],
  shell: ['Gate', 'BackendNotices', 'AccessDenied', 'ConnectionStatus', 'UploadField', 'NotificationInbox', 'ContactForm', 'AppShell', 'AiLabel'],

}

/** The family page a component is documented on; throws for one on no page. */
export function familyPageOf(name) {
  const page = Object.entries(FAMILY_PAGES).find(([, names]) => names.includes(name))?.[0]
  if (!page) throw new Error(`<${name}> is on no family page: add it to FAMILY_PAGES in scripts/docs-lookups/components.mjs`)
  return page
}

/** A component's contract row; throws for one the contract does not list. */
function contractOf(name) {
  const row = COMPONENT_CONTRACT[name]
  if (!row) throw new Error(`<${name}> has no row in test/nuxt/component-contract.ts`)
  return row
}

/** A component's tag, linked to its section on its family page. */
const componentLink = name => link(code(`<${name}>`), `${PAGES.components}/${familyPageOf(name)}#${name.toLowerCase()}`)

// --- The contract table ------------------------------------------------------

/** One row per contracted component: its family, labels, slots, events and states. */
export function contractTable() {
  return table(['Component', 'Family', 'Labels', 'Slots', 'Events', 'States'], Object.entries(COMPONENT_CONTRACT).map(([name, row]) => [
    `\`<${name}>\``,
    row.family ? code(`data-${row.family}`) : 'none: only your slots',
    row.labels ? code(row.labels) : row.family ? 'none: the link\'s words are your `default` slot' : 'none',
    codes(row.slots),
    codes(row.emits),
    row.states.join(', '),
  ]))
}

// --- Props -------------------------------------------------------------------

/** The `defineComponent({ … })` options object of an exported component. */
function componentOptions(file, name) {
  let found
  const visit = (node) => {
    if (found) return
    if (ts.isVariableDeclaration(node) && node.name.getText() === name && node.initializer) {
      const call = [node.initializer].find(candidate => ts.isCallExpression(candidate))
      const options = call?.arguments[0]
      if (options && ts.isObjectLiteralExpression(options)) found = options
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceOf(file))
  return found
}

/** A property of an object literal, by name. */
const property = (object, name) => object.properties.find(candidate => ts.isPropertyAssignment(candidate) && candidate.name.getText().replace(/['"]/g, '') === name)

/** A runtime prop constructor as its TypeScript type. */
const CONSTRUCTOR_TYPES = { String: 'string', Boolean: 'boolean', Number: 'number', Object: 'object', Array: 'array', Function: 'function' }

/** A prop's type: its `PropType<…>` when it names one, else its constructor's. */
function propType(definition) {
  const type = definition && ts.isObjectLiteralExpression(definition) ? property(definition, 'type')?.initializer : definition
  if (!type) return 'unknown'
  const text = type.getText()
  const named = text.match(/PropType<([\s\S]+)>$/)?.[1]
  if (named) return named.replace(/\s+/g, ' ')
  return text.replace(/^\[|\]$/g, '').split(',').map(part => CONSTRUCTOR_TYPES[part.trim()] ?? part.trim()).join(' | ')
}

/** A prop's default as written, or none. */
function propDefault(definition) {
  if (!definition || !ts.isObjectLiteralExpression(definition)) return ''
  if (property(definition, 'required')?.initializer.getText() === 'true') return 'required'
  const value = property(definition, 'default')?.initializer.getText()
  return value === undefined || value === 'undefined' ? '' : code(value.replace(/\s+/g, ' '))
}

/** The props a single-file component declares in `defineProps<{ … }>()`, its defaults from `withDefaults`. */
function sfcProps(file) {
  let call
  const visit = (node) => {
    if (call) return
    if (ts.isCallExpression(node) && node.expression.getText() === 'defineProps') call = node
    ts.forEachChild(node, visit)
  }
  visit(sourceOf(file))
  const literal = call?.typeArguments?.[0]
  if (!literal || !ts.isTypeLiteralNode(literal)) return []
  const outer = ts.isCallExpression(call.parent) && call.parent.expression.getText() === 'withDefaults' ? call.parent.arguments[1] : undefined
  const defaults = outer && ts.isObjectLiteralExpression(outer) ? outer : undefined
  return literal.members.filter(ts.isPropertySignature).map((member) => {
    const name = member.name.getText().replace(/['"]/g, '')
    const value = defaults && property(defaults, name)?.initializer.getText().replace(/^\(\) => /, '')
    const optional = Boolean(member.questionToken)
    return {
      name,
      type: member.type ? member.type.getText().replace(/\s+/g, ' ') : 'unknown',
      default: !optional ? 'required' : value === undefined || value === 'undefined' ? '' : code(value.replace(/\s+/g, ' ')),
      doc: docText(member).replace(/\s*\n\s*/g, ' '),
    }
  })
}

/** The props a component declares, with their doc comments. */
function propsOf(file, name) {
  if (file.endsWith('.vue')) return sfcProps(file)
  const options = componentOptions(file, name)
  if (!options) throw new Error(`${file}: found no defineComponent({ … }) for ${name}; update propsOf()`)
  const props = property(options, 'props')?.initializer
  if (!props || !ts.isObjectLiteralExpression(props)) return []
  return props.properties.filter(ts.isPropertyAssignment).map(prop => ({
    name: prop.name.getText().replace(/['"]/g, ''),
    type: propType(prop.initializer),
    default: propDefault(prop.initializer),
    doc: docText(prop).replace(/\s*\n\s*/g, ' '),
  }))
}

// --- Family pages ------------------------------------------------------------

/** Every registered component, part and internal piece, by name, with its `.vue` file. */
const REGISTERED_FILES = new Map(UI_ENTRIES.map(entry => [entry.name, `${COMPONENTS_DIR}/${uiPath(entry)}.vue`]))

/** Whether a template has the tag `<name>`, not merely one that starts with it (`<AuthForm>`, not `<AuthFormCode>`). */
function rendersTag(text, name) {
  for (let at = text.indexOf(`<${name}`); at >= 0; at = text.indexOf(`<${name}`, at + 1)) {
    const next = text[at + name.length + 1]
    if (next === undefined || next === '/' || next === '>' || next.trim() === '') return true
  }
  return false
}

/**
 * The registered names a `.vue` file renders by tag in its template (or
 * resolves by name in its script), and the `.vue` files it imports. A tag
 * named in a doc comment ("`<WaitlistForm>`'s last step") renders nothing.
 */
function rendersOf(file) {
  const text = readText(file)
  const template = text.slice(Math.max(0, text.indexOf('<template>')))
  const names = [...REGISTERED_FILES.keys()].filter(name => rendersTag(template, name) || text.includes(`resolveComponent('${name}')`))
  const dir = file.slice(0, file.lastIndexOf('/'))
  const imported = [...text.matchAll(/from '(\.{1,2}\/[^']+\.vue)'/g)].map(([, from]) => join(dir, from).replace(/\\/g, '/'))
  return { names, imported }
}

/**
 * The components a `.vue` file renders, and the ones those render, by
 * name: the registered components and parts in its template (or resolved
 * by name, the admin console's tabs), and the `.vue` files it imports,
 * followed file by file. `skip` leaves a file out, with what only it reaches.
 */
function reachable(file, skip = new Set()) {
  const names = new Set()
  const seen = new Set(skip)
  const visit = (current) => {
    if (seen.has(current)) return
    seen.add(current)
    const { names: rendered, imported } = rendersOf(current)
    for (const name of rendered) {
      names.add(name)
      visit(REGISTERED_FILES.get(name))
    }
    for (const target of imported) visit(target)
  }
  visit(file)
  return names
}

/** The frame every ready-made page renders through. */
const FRAME = `${COMPONENTS_DIR}/shell/PageFrame.vue`

/**
 * The ready-made pages that render a component: `own`, the pages whose
 * file renders it; `nested`, the pages whose components render it inside,
 * however deep (`<SecuritySettings>` renders `<ReauthenticateDialog>`, the
 * admin console's tabs render `<AdminUsers>`). What the frame renders is
 * the frame's (`frameRenders`), on every page.
 */
function pagesRendering(name) {
  const pagesDir = 'src/runtime/vue/pages'
  const pages = readdirSync(join(root, pagesDir)).map(entry => ({
    def: BACKEND_PAGE_DEFS.find(def => def.file === entry.replace(/\.vue$/, '')),
    file: `${pagesDir}/${entry}`,
  })).filter(page => page.def)
  const own = pages.filter(page => rendersOf(page.file).names.includes(name))
  const nested = pages.filter(page => !own.includes(page) && reachable(page.file, new Set([FRAME])).has(name))
  return { own: own.map(page => page.def), nested: nested.map(page => page.def) }
}

/** The ready-made pages that render a component, as the At-a-glance row names them. */
function renderedBy(name) {
  if (frameRenders(name)) return 'every ready-made page, in the frame around it'
  const { own, nested } = pagesRendering(name)
  const named = pages => pages.map(page => `the ${code(page.defaultPath)} page (${code(`pages.${page.key}`)})`).join(' and ')
  const parts = [
    ...(own.length ? [named(own)] : []),
    ...(nested.length ? [`${named(nested)}, inside ${nested.length > 1 ? 'their components' : 'its component'}`] : []),
  ]
  return parts.length ? parts.join('; ') : 'no ready-made page: place it yourself'
}

/**
 * Whether the frame every ready-made page renders through renders a component
 * in one of its regions: the component itself (a banner of its banner
 * region), or its frame variant (`FrameConnectionStatus` for
 * `<ConnectionStatus>`).
 */
const frameRenders = (name) => {
  const names = reachable(FRAME)
  return names.has(name) || names.has(`Frame${name}`)
}

/** The parts a component is built from, in registry order. */
const partsOf = name => UI_PARTS.filter(part => part.parent === name).map(part => part.name)

/**
 * One component's section: what it is, its contract, its props and its
 * accessibility. The docs MCP's `get-component` answers with it (docs-mcp.mjs).
 */
export function componentSection(name, file) {
  const row = contractOf(name)
  const facts = table(['At a glance', ''], [
    ['Registered from', code(`${file}`)],
    ['Rendered by', renderedBy(name)],
    ['Family', row.family ? code(`data-${row.family}`) : `none: ${lowerFirst(row.why ?? 'it renders only your slots')}`],
    ['Labels', row.labels ? link(code(row.labels), `${PAGES.labels}#${row.labels.toLowerCase()}`) : `none: ${lowerFirst(row.why ?? 'every word is yours')}`],
    ['Slots', codes(row.slots)],
    ['Events', codes(row.emits)],
    ['States', row.states.join(', ')],
    ['Parts', partsOf(name).length ? codes(partsOf(name)) : 'none: swap the whole component'],
    ['Tier', tierOf(name)],
  ])
  const props = propsOf(file, name)
  return blocks(
    `## \`<${name}>\``,
    docOf(file, name).split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' '),
    facts,
    props.length
      ? blocks('**Props**', table(['Prop', 'Type', 'Default', 'What it does'], props.map(prop => [code(prop.name), code(prop.type), prop.default || 'none', prop.doc])))
      : '**Props:** none.',
    `**Accessibility:** ${row.a11y}`,
  )
}

/** A family page's sections, in registry order. */
export function familySections(family) {
  const names = FAMILY_PAGES[family]
  return blocks(registeredComponents().filter(({ name }) => names.includes(name)).map(({ name, file }) => componentSection(name, file)))
}

/** Every family page with the components on it, for the components index. */
export function familyTable() {
  const registered = registeredComponents()
  for (const { name } of registered) familyPageOf(name)
  return table(['Component', 'Page', 'What it is'], registered.map(({ name, file }) => [componentLink(name), FAMILY_TITLES[familyPageOf(name)], summaryOf(file, name)]))
}

/** The family pages' titles. */
const FAMILY_TITLES = { account: 'Account', workspaces: 'Workspaces and admin', billing: 'Billing', shell: 'Shell, gates and notices' }

// --- Theme tokens ------------------------------------------------------------

/** What each shared token is for. A token added to tokens.css needs its line here. */
const TOKEN_ROLES = {
  '--bk-accent': 'Primary actions, links and focus rings',
  '--bk-on-accent': 'Text on accent surfaces',
  '--bk-ink': 'Body text',
  '--bk-muted': 'Secondary text',
  '--bk-edge': 'Borders',
  '--bk-surface': 'Card backgrounds',
  '--bk-error': 'Error messages',
  '--bk-ok': 'Success messages',
  '--bk-warn': 'Warnings',
  '--bk-radius': 'Corners of cards, banners and messages',
  '--bk-radius-control': 'Corners of buttons and inputs',
}

/** The shared tokens tokens.css declares in its first block, with their values. */
function sharedTokens() {
  const css = readText(`${COMPONENTS_DIR}/tokens.css`)
  const at = css.indexOf(':root {')
  const block = css.slice(at + ':root {'.length, css.indexOf('\n  }', at))
  return [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--bk-[\w-]+):([^;]+);/g)].map(([, name, declared]) => {
    const value = declared.trim()
    const pair = value.startsWith('light-dark(') && value.endsWith(')') ? value.slice('light-dark('.length, -1).split(',').map(part => part.trim()) : undefined
    return { name, light: pair ? pair[0] : value, dark: pair ? pair[1] : value }
  })
}

/** The component and part stylesheets: each one's file, the `data-*` families it styles, and the tokens it reads. */
function familyStylesheets() {
  return readdirSync(join(root, COMPONENTS_DIR), { recursive: true })
    .map(file => String(file).replace(/\\/g, '/'))
    .filter(file => file.endsWith('.css') && !['tokens.css', 'shared.css'].includes(file))
    .sort()
    .map((file) => {
      const css = readText(`${COMPONENTS_DIR}/${file}`)
      const families = new Set(Object.values(COMPONENT_CONTRACT).map(row => row.family).filter(family => family && css.includes(`[data-${family}`)))
      return { file, families: [...families], reads: new Set([...css.matchAll(/var\((--bk-[\w-]+)/g)].map(([, token]) => token)) }
    })
}

/** One row per shared token: its role, its light and dark defaults, and the families that read it. */
export function tokensTable() {
  const sheets = familyStylesheets()
  return table(['Token', 'For', 'Light', 'Dark', 'Read by'], sharedTokens().map(({ name, light, dark }) => {
    const role = TOKEN_ROLES[name]
    if (!role) throw new Error(`${name} has no role in TOKEN_ROLES (scripts/docs-lookups/components.mjs)`)
    const families = [...new Set(sheets.filter(sheet => sheet.reads.has(name)).flatMap(sheet => sheet.families))].sort()
    return [code(name), role, code(light), code(dark), codes(families.map(family => `data-${family}`))]
  }))
}

/** One row per `data-*` family: the components that carry it and the stylesheet that styles it. */
export function familiesTable() {
  const sheets = familyStylesheets()
  const families = [...new Set(Object.values(COMPONENT_CONTRACT).map(row => row.family).filter(Boolean))]
  return table(['Family', 'Components', 'Stylesheets', 'Family tokens'], families.map((family) => {
    const components = Object.entries(COMPONENT_CONTRACT).filter(([, row]) => row.family === family).map(([name]) => componentLink(name))
    const files = sheets.filter(candidate => candidate.families.includes(family)).map(sheet => sheet.file)
    const own = [...new Set(files.flatMap(file => [...readText(`${COMPONENTS_DIR}/${file}`).matchAll(/(--[a-z]+-[\w-]+):/g)].map(([, token]) => token)))].filter(token => token.startsWith(`--${family}-`))
    return [code(`data-${family}`), components.join(', '), files.length ? codes(files) : 'none: unstyled', codes(own)]
  }))
}
