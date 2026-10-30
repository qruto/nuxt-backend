/**
 * Reference › Backend: the Convex-side setup helpers (each Convex subpath's
 * `setup*`, `define*`, `create*` and `register*` exports), the component's
 * functions and tables (its generated `ComponentApi` and its schema), the
 * HTTP routes the package mounts, the billing and email events, and the
 * limits and retention windows, each value read from the constant that
 * enforces it.
 */
import { HUMAN_PROOF_ROUTE } from '../../src/convex/proof.ts'
import { DEFAULT_AUTH_ROUTE, DEFAULT_HEALTH_PATH, HEALTH_ROUTE, LOCAL_LOG_ROUTE, VISITOR_IP_ROUTE } from '../../src/convex/constants.ts'
import { PUSH_WORKER_URL } from '../../src/convex/web-push.ts'
import { MANIFEST_ROUTE } from '../../src/installable.ts'
import { BILLING_WEBHOOK_PROVISION_EVENTS } from '../../src/convex/catalog.ts'
import { ALL_BILLING_EVENTS, refreshesEntitlements } from '../../src/convex/integrations/billing/events.ts'
import { ALL_EMAIL_EVENTS } from '../../src/convex/integrations/email.ts'
import { BACKEND_EVENTS, deriveDeliveries, eventReaders } from '../../src/convex/events.ts'
import { ACCOUNT_DATA_SOURCES, NO_PERSONAL_DATA } from '../../src/convex/account-data.ts'
import { BROWSER_STORAGE, dataMap, SUBPROCESSORS } from '../../src/convex/legal.ts'
import { CAPABILITIES } from '../../src/capabilities/registry.ts'
import { DEFAULT_LIMITS } from '../../src/convex/integrations/rate-limit.ts'
import { BACKEND_PAGE_DEFS } from '../../src/pages/registry.ts'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates.ts'
import { HELPER_AREAS, tagOf } from './areas.mjs'
import { code, codes, link, table } from './markdown.mjs'
import { entrypoints } from '../lib/surface.mjs'
import { apiPageOf, pathSlug, areaTitle } from './registry.mjs'
import { declarationOf, docOf, docText, firstSentence, interfaceFields, namedImports, sourceOf, ts, valueExports } from './source.mjs'

// --- Setup helpers -----------------------------------------------------------

/** The scaffold file that imports a helper, if one does. */
function scaffoldFileOf(name, path) {
  return Object.keys(BACKEND_FILE_TEMPLATES).find(file => namedImports(BACKEND_FILE_TEMPLATES[file]).some(entry => entry.from === path && entry.names.includes(name))
    || BACKEND_FILE_TEMPLATES[file].includes(`import ${name} from '${path}'`))
}

/** Every Convex-side helper: a `setup*`, `define*`, `create*` or `register*` export of the package's own. */
export function setupHelpers() {
  const helpers = entrypoints().filter(entry => !entry.typesOnly && entry.built.startsWith('./dist/convex/')).flatMap(({ path, source }) => valueExports(source)
    .filter(name => /^(?:setup|define|create|register)[A-Z]/.test(name) && declarationOf(source, name))
    .map(name => ({ name, source, path })))
  if (helpers.length === 0) throw new Error('read no setup helper from the Convex subpaths')
  return helpers
}

/**
 * What a helper gives you: the first sentence of its doc comment, or of its
 * options interface's when its own holds only an example.
 */
function helperSummary(source, name) {
  const own = firstSentence(docOf(source, name)) || firstSentence(docOf(source, `${name[0].toUpperCase()}${name.slice(1)}Options`))
  return own.replace(/:$/, '.')
}

/** One row per setup helper: where it comes from, the file that calls it, what it gives you. */
export function setupHelpersTable() {
  return table(['Helper', 'Import', 'Scaffold file', 'Tab', 'What it gives you'], setupHelpers().map(({ name, source, path }) => {
    const api = apiPageOf(pathSlug(path))
    const file = scaffoldFileOf(name, path)
    return [
      api ? link(code(name), api) : code(name),
      code(path),
      file ? code(`backend/${file}`) : 'none: call it yourself',
      areaTitle(tagOf(HELPER_AREAS, name, 'the helper')),
      helperSummary(source, name),
    ]
  }))
}

// --- Component API -----------------------------------------------------------

const COMPONENT_API = 'src/convex/components/backend/_generated/component.ts'

/** The functions the component exposes, by module: each one's name and kind, read from its generated `ComponentApi`. */
function componentFunctions() {
  const alias = sourceOf(COMPONENT_API).statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'ComponentApi')
  if (!alias || !ts.isTypeLiteralNode(alias.type)) throw new Error(`${COMPONENT_API}: no ComponentApi type literal`)
  return alias.type.members.filter(ts.isPropertySignature).map(module => ({
    module: module.name.getText(),
    functions: module.type.members.filter(ts.isPropertySignature).map(member => ({
      name: member.name.getText(),
      kind: member.type.typeArguments?.[0]?.getText().replace(/"/g, '') ?? 'unknown',
    })),
  }))
}

/**
 * The component functions an app may call itself, and why: everything else
 * is called through the helper that wraps it.
 */
export const APP_CALLABLE = {
  'email.send': 'from a mutation or a workflow step, which cannot run the helper\'s action',
}

/** One row per component function: its module, kind, and whether app code calls it. */
export function componentFunctionsTable() {
  const rows = componentFunctions().flatMap(({ module, functions }) => functions.map(({ name, kind }) => {
    const callable = APP_CALLABLE[`${module}.${name}`]
    return [code(module), code(name), kind, callable ? `Yes, ${callable}` : 'Through its helper']
  }))
  return table(['Module', 'Function', 'Kind', 'App code calls it'], rows)
}

/** The schema's table groups: the export that holds them, and the module that owns them. */
const TABLE_GROUPS = { tables: 'adapter', billingTables: 'billing and gifts', aiTables: 'ai', webhookTables: 'webhooks', emailTables: 'email', maintenanceTables: 'maintenance', auditTables: 'audit', flagTables: 'flags', accountTables: 'account', consentTables: 'consents', inboundTables: 'inbound', accessTables: 'access', waitlistTables: 'waitlist', referralTables: 'referrals', storageTables: 'storage', jobTables: 'jobs', notificationTables: 'notifications', preferenceTables: 'preferences', announcementTables: 'announcements', lifecycleTables: 'lifecycle', monitoringTables: 'monitoring', reportTables: 'reports', suppressionTables: 'suppressions', deviceTables: 'devices', funnelTables: 'funnel' }

/**
 * The module a schema declaration's tables belong to, or `undefined` for a
 * declaration that holds no table group. A `<name>Tables` export missing
 * from TABLE_GROUPS throws: its tables would go missing from the page
 * without a word.
 */
function tableGroupOf(declaration) {
  const name = declaration.name.getText()
  const group = TABLE_GROUPS[name]
  if (!group && /^\w+Tables$/.test(name)) throw new Error(`the component schema's ${name} has no module in TABLE_GROUPS (scripts/docs-lookups/backend.mjs)`)
  return group && declaration.initializer && ts.isObjectLiteralExpression(declaration.initializer) ? group : undefined
}

/** One row per table of the component's schema: the module that owns it and its indexes. */
export function componentTablesTable() {
  const schema = sourceOf('src/convex/components/backend/schema.ts')
  const declarations = schema.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations)
  const rows = []
  for (const declaration of declarations) {
    const group = tableGroupOf(declaration)
    if (!group) continue
    for (const entry of declaration.initializer.properties.filter(ts.isPropertyAssignment)) {
      const indexes = [...entry.initializer.getText().matchAll(/\.index\('(\w+)'/g)].map(([, index]) => index)
      rows.push([code(entry.name.getText()), group, codes(indexes)])
    }
  }
  if (rows.length === 0) throw new Error('the component schema has no table groups the lookup knows (TABLE_GROUPS)')
  return table(['Table', 'Module', 'Indexes'], rows)
}

// --- HTTP routes -------------------------------------------------------------

const HTTP = 'src/convex/integrations/http.ts'

/** What each route option of `registerBackendRoutes` mounts: methods, who calls it, and what guards it. */
export const DEPLOYMENT_ROUTES = {
  billingPath: ['POST', 'The billing provider', 'A signed webhook: fail-closed without its secret (503), 1 MiB body cap (413), redelivery deduplicated'],
  emailPath: ['POST', 'The email provider', 'A signed webhook: fail-closed without its secret (503), 1 MiB body cap (413), redelivery deduplicated'],
  aiPath: ['POST, OPTIONS', 'The browser, through `useAiStream`', 'A session token; spends credits through the metered stream it starts'],
}

/** The deployment's routes: the auth routes, then one row per route option of `registerBackendRoutes`. */
export function deploymentRoutesTable() {
  const options = interfaceFields(HTTP, 'RegisterBackendRoutesOptions').filter(field => field.name.endsWith('Path'))
  const rows = options.map((field) => {
    const route = DEPLOYMENT_ROUTES[field.name]
    if (!route) throw new Error(`registerBackendRoutes's ${field.name} has no row in DEPLOYMENT_ROUTES (scripts/docs-lookups/backend.mjs)`)
    const fallback = field.doc.match(/Default `([^`]+)`/)?.[1]
    return [code(fallback ?? field.name), route[0], route[1], route[2], code(field.name)]
  })
  return table(['Route', 'Methods', 'Called by', 'Guarded by', 'Moved with'], [
    [code(`${DEFAULT_AUTH_ROUTE}/*`), 'GET, POST', 'The app\'s auth proxy', 'Better Auth: sessions, codes and the route limits `setupAuth` sets', `${code('backend.authRoute')} in nuxt.config, through the paths file`],
    ...rows,
    [code('/storage/<id>'), 'GET', 'Whoever holds a URL `storage.signedUrl` minted', 'A signature under the app\'s secret that expires (an hour by default, seven days at most); mounted with `registerBackendRoutes(http, { storage })`', 'fixed'],
    [code(DEFAULT_HEALTH_PATH), 'GET', `The app's ${code(HEALTH_ROUTE)}, or an uptime check`, 'Public: each capability\'s state only; the detail for a session of `adminRoles`, or on a deployment named `development`', 'fixed'],
  ])
}

/** A ready-made page's doc comment (over its `definePage` in src/pages/), up to the default path it repeats. */
function pageDoc(key) {
  const file = `src/pages/${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}.ts`
  const statement = sourceOf(file).statements.find(ts.isExportAssignment)
  return firstSentence(docText(statement))
}

/** The routes the module adds to the Nuxt app: the auth proxy, the proof, health, visitor-IP, push and manifest routes, the dev log, and the pages. */
export function appRoutesTable() {
  const pages = BACKEND_PAGE_DEFS.map(def => [code(def.defaultPath), 'GET', def.auth ? 'Signed in (`definePageMeta({ auth })`), never cached' : 'Public', pageDoc(def.key), code(`pages.${def.key}`)])
  return table(['Route', 'Methods', 'Access', 'What it is', 'Moved with'], [
    [code(`${DEFAULT_AUTH_ROUTE}/**`), 'GET, POST', 'Public', 'The same-origin proxy to the deployment\'s auth routes', code('authRoute')],
    [code(HUMAN_PROOF_ROUTE), 'POST', 'Public, behind the bot check', 'Signs a short-lived proof for one call that `verifyHuman` checks', 'fixed'],
    [code(HEALTH_ROUTE), 'GET', 'Public: each capability\'s state only; the detail for an admin, or on a deployment named `development`', 'The app\'s [health](/docs/ship/operate/monitoring#the-health-endpoint), for uptime checks', 'fixed'],
    [code(VISITOR_IP_ROUTE), 'GET', 'Public, never cached', 'The caller\'s own IP address as the app\'s server sees it, which a checkout forwards for the billing provider\'s local pricing; nothing keeps it', 'fixed'],
    [code(PUSH_WORKER_URL), 'GET', 'Public', 'The web push service worker: shows a message the deployment sent and opens the app on a click; it caches nothing and controls no page outside its own scope', 'fixed'],
    [code(MANIFEST_ROUTE), 'GET', 'Public', 'The web app manifest, once `public/` holds the icons and app.config names the brand, and the app ships no manifest of its own', 'fixed'],
    [code(LOCAL_LOG_ROUTE), 'GET, POST, DELETE', 'The dev server only, same site; never in a build', 'The local error log the browser reports to under `nuxt dev`', 'fixed'],
    ...pages,
  ])
}

// --- Events ------------------------------------------------------------------

/** What the package does itself on a billing event, beside refreshing entitlements. */
export const BILLING_BUILT_IN = {
  'order.paid': 'Fulfils a paid gift',
  'order.refunded': 'Drops the order\'s credit reservations; marks a refunded gift',
  'benefit.updated': 'Refreshes the benefit\'s cached metadata, and re-syncs the products table so pricing follows a benefit edited in the dashboard',
  'subscription.updated': 'Follows a plan pass: a workspace that paid for the plan keeps it, and the pass ends with its scheduled return cleared; with `lifecycle.renewalReminders`, sends the yearly renewal reminder when one is due',
  'subscription.active': 'Follows a plan pass, as `subscription.updated` does',
  'subscription.revoked': 'Puts the billing entity back on the free plan, when the catalog has one and the entity holds no other plan and still exists',
  'subscription.created': 'Confirms the renewal consent proof its checkout kept',
  'checkout.expired': 'With `lifecycle.abandonedCheckout`, records `billing.checkout_abandoned` once per checkout',
}

/** One row per billing provider event: whether it refreshes entitlements, what else runs, and whether `billing sync` subscribes the endpoint to it. */
export function billingEventsTable() {
  return table(['Event', 'Refreshes entitlements', 'Also', 'Subscribed by `billing sync`'], ALL_BILLING_EVENTS.map(event => [
    code(event),
    refreshesEntitlements(event) ? 'yes' : 'no',
    BILLING_BUILT_IN[event] ?? '',
    BILLING_WEBHOOK_PROVISION_EVENTS.includes(event) ? 'yes' : 'no: not live on the provider yet',
  ]))
}

/** What the package does with an email provider event before your handler, where it does more than the status or the log. */
const EMAIL_BUILT_IN = {
  'email.bounced': 'Updates the email\'s status, which `useEmailStatus` reads, and records `email.bounced` for the account the address belongs to; then your `events` handler',
  'email.suppressed': 'Updates the email\'s status, and marks each recipient suppressed in the deployment\'s copy of the list, which sign-in reads before it sends a code; then your `events` handler',
  'suppression.added': 'Marks the address suppressed in the deployment\'s copy of the list, with why (`bounce`, `complaint`, `manual`); then your `events` handler',
  'suppression.removed': 'Marks the address lifted in the copy, so the next sign-in code goes out; then your `events` handler',
}

/** One row per email provider event: the `email.*` ones move a sent email's status. */
export function emailEventsTable() {
  return table(['Event', 'What the package does'], ALL_EMAIL_EVENTS.map(event => [
    code(event),
    EMAIL_BUILT_IN[event] ?? (event.startsWith('email.') ? 'Updates the email\'s status, which `useEmailStatus` reads; then your `events` handler' : 'Logs the delivery; then your `events` handler'),
  ]))
}

/** Who reads a kind, in words. */
const READERS = { subject: 'the account', workspace: 'its workspace\'s owners and admins', admin: 'administrators' }

/** Who reads a billing entity's kind: the workspace's, or the account's billed on its own. */
const ENTITY_READERS = 'its workspace\'s owners and admins, or the account billed on its own (`billTo: \'user\'`); administrators'

/** One row per kind of the backend's own events: who reads it, what it carries, what it derives and what records it. */
export function backendEventsTable() {
  return table(['Event', 'Read by', 'Data', 'Derives', 'Recorded by'], Object.entries(BACKEND_EVENTS).map(([type, kind]) => {
    const derives = deriveDeliveries(type, 'subject')
    return [
      code(type),
      kind.scope === 'entity' ? ENTITY_READERS : eventReaders(type, kind.scope === 'workspace' ? 'workspace' : undefined).map(reader => READERS[reader]).join(', '),
      codes(Object.entries(kind.data).map(([field, fieldType]) => `${field}: ${fieldType}`)),
      [derives.inApp ? 'in-app' : '', derives.email ? 'email' : ''].filter(Boolean).join(', ') || 'the row alone',
      kind.recordedBy,
    ]
  }))
}

// --- Limits and retention ----------------------------------------------------

const RATE_LIMIT = 'src/convex/integrations/rate-limit.ts'

/** A period in milliseconds, in words. */
function duration(ms) {
  const units = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000], ['second', 1000]]
  const [unit, size] = units.find(([, size]) => ms % size === 0 && ms >= size) ?? ['ms', 1]
  const count = ms / size
  return unit === 'ms' ? `${ms} ms` : `${count} ${unit}${count === 1 ? '' : 's'}`
}

/** The doc comment of one entry of `DEFAULT_LIMITS`. */
function limitDoc(name) {
  const statement = declarationOf(RATE_LIMIT, 'DEFAULT_LIMITS').statement
  let object = statement.declarationList.declarations[0].initializer
  while (!ts.isObjectLiteralExpression(object)) object = object.expression
  const entry = object.properties.find(property => property.name?.getText() === name)
  return entry ? firstSentence(docText(entry)) : ''
}

/** One row per default rate limit: its kind, rate, period and burst. */
export function limitsTable() {
  return table(['Limit', 'Kind', 'Rate', 'Burst', 'What it guards'], Object.entries(DEFAULT_LIMITS).map(([name, limit]) => [
    code(name),
    limit.kind,
    `${limit.rate} per ${duration(limit.period).replace(/^1 /, '')}`,
    limit.capacity === undefined ? '' : String(limit.capacity),
    limitDoc(name),
  ]))
}

/** A top-level `const` of a source file, evaluated: a number, or an object of numbers. */
function constantOf(file, name) {
  const declaration = sourceOf(file).statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations).find(candidate => candidate.name.getText() === name)
  if (!declaration) throw new Error(`${file} has no const ${name}: update RETENTION in scripts/docs-lookups/backend.mjs`)
  const evaluate = (node) => {
    if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ''))
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return evaluate(node.expression)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) return evaluate(node.left) * evaluate(node.right)
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => [property.name.getText(), evaluate(property.initializer)]))
    throw new Error(`${file}: ${name} is not a number the lookup can read`)
  }
  const statement = sourceOf(file).statements.find(candidate => ts.isVariableStatement(candidate) && candidate.declarationList.declarations.includes(declaration))
  return { value: evaluate(declaration.initializer), doc: firstSentence(docText(statement)) }
}

/** A window measured from an event: `1 day after expiry`. */
const after = event => value => `${duration(value)} after ${event}`

const bytes = value => value % 1_048_576 === 0 ? `${value / 1_048_576} MiB` : `${value} bytes`

/** The windows and lifetimes the package enforces: the constant behind each and how to read its value. */
const RETENTION = [
  ['src/convex/integrations/webhook-guard.ts', 'WEBHOOK_BODY_LIMIT', 'Webhook body', bytes],
  ['src/convex/components/backend/webhooks.ts', 'RING_CAP', 'Webhook delivery log', value => `${value} verified deliveries`],
  ['src/convex/components/backend/webhooks.ts', 'TRIM_INTERVAL_MS', 'Webhook log trim', duration],
  ['src/convex/sandbox-inbox.ts', 'SANDBOX_INBOX_WINDOW_MS', 'Dev inbox window', duration],
  ['src/convex/sandbox-inbox.ts', 'SANDBOX_INBOX_LIMIT', 'Dev inbox read', value => `${value} messages`],
  ['src/convex/integrations/ai/context.ts', 'DEFAULT_STREAM_TIMEOUT_MS', 'Metered stream reservation', duration],
  ['src/convex/components/backend/billing.ts', 'PENDING_SPEND_TTL_MS', 'Credit reservation', duration],
  ['src/convex/integrations/billing/entitlements.ts', 'BENEFIT_METADATA_TTL_MS', 'Cached benefit metadata', duration],
  ['src/convex/integrations/billing/checkout.ts', 'DISCOUNT_CODE_REFUSALS', 'Refused discount codes', value => `${value.max} per ${duration(value.windowMs).replace(/^1 /, '')}, per billing entity`],
  ['src/convex/integrations/billing/customers.ts', 'TRIAL_HOLD_MS', 'Trial hold', duration],
  ['src/convex/integrations/billing/purchase.ts', 'MAX_TRIAL_DAYS', 'Longest trial', value => `${value} days`],
  ['src/convex/integrations/billing/gifts.ts', 'GIFT_LIMIT', 'Gifts per purchaser', value => `${value.max} in ${value.days} days`],
  ['src/convex/integrations/billing/gifts.ts', 'OPEN_CHECKOUT_MS', 'Open gift checkout', duration],
  ['src/convex/components/backend/gifts.ts', 'PENDING_TTL_MS', 'Unpaid gift', duration],
  ['src/convex/components/backend/maintenance.ts', 'MAINTENANCE_INTERVAL_MS', 'Maintenance pass', value => `every ${duration(value).replace(/^1 /, '')}`],
  ['src/convex/components/backend/maintenance.ts', 'MAINTENANCE_BATCH', 'Maintenance batch', value => `${value} rows per transaction`],
  ['src/convex/components/backend/maintenance.ts', 'EXPIRED_SESSION_RETENTION_MS', 'Expired session', after('expiry')],
  ['src/convex/components/backend/maintenance.ts', 'EXPIRED_VERIFICATION_RETENTION_MS', 'Expired code or verification', after('expiry')],
  ['src/convex/components/backend/maintenance.ts', 'IDLE_RATE_LIMIT_RETENTION_MS', 'Idle auth rate-limit counter', after('the last request')],
  ['src/convex/components/backend/maintenance.ts', 'FINISHED_AI_REQUEST_RETENTION_MS', 'Finished AI request', after('it was created, once settled or released')],
  ['src/convex/components/backend/maintenance.ts', 'STUCK_AI_REQUEST_RETENTION_MS', 'AI request stuck in reserved', after('it was created')],
  ['src/convex/components/backend/maintenance.ts', 'EMAIL_RECORD_RETENTION_MS', 'Email record', value => `${after('its final status')(value)}, unless \`setupEmail({ retention })\` says otherwise`],
  ['src/convex/components/backend/maintenance.ts', 'ABANDONED_EMAIL_RETENTION_MS', 'Email record with no final status', value => `${after('it was created')(value)}, unless \`setupEmail({ retention })\` says otherwise`],
  ['src/convex/components/backend/email.ts', 'SECRET_OUTBOX_TTL_MS', 'Secret email (sign-in code)', value => `no record; its message until the provider answers, ${duration(value)} at most`],
  ['src/convex/components/backend/maintenance.ts', 'EXPIRED_INVITATION_RETENTION_MS', 'Expired invitation', after('expiry')],
  ['src/convex/components/backend/maintenance.ts', 'AUDIT_EVENT_RETENTION_MS', 'Audit event', after('it was recorded')],
  ['src/convex/components/backend/account.ts', 'ACCOUNT_EXPORT_LINK_MS', 'Account export link', value => `${duration(value)}, then its file is deleted`],
  ['src/convex/components/backend/account.ts', 'ACCOUNT_EXPORTS_PER_DAY', 'Account exports', value => `${value} per account in a day`],
  ['src/convex/components/backend/maintenance.ts', 'ACCOUNT_EXPORT_RETENTION_MS', 'Account export record', after('it was made')],
  ['src/convex/components/backend/account.ts', 'ERASURE_ATTEMPTS', 'Erasure retries', value => `${value} tries per participant, each wait twice the last, from ${duration(10_000)}`],
  ['src/convex/components/backend/maintenance.ts', 'FAILED_ERASURE_RETENTION_MS', 'Erasure that stopped at a failing participant', after('it stopped')],
  ['src/convex/inbound-rules.ts', 'INBOUND_RETENTION_MS', 'Contact message and inbound mail', after('it was sent or received')],
  ['src/convex/inbound-rules.ts', 'REPLY_ADDRESS_RETENTION_MS', 'Reply address', after('the last email it went out in')],
  ['src/convex/inbound-rules.ts', 'CONTACT_MESSAGE_MAX', 'Contact message', value => `${10} to ${value} characters`],
  ['src/convex/components/backend/costs.ts', 'AI_COST_RETENTION_MS', 'A person\'s AI costs for a day', after('the day')],
  ['src/convex/components/backend/alerts.ts', 'ALERT_RETENTION_MS', 'Record of an alert sent', after('it was sent')],
  ['src/convex/components/backend/maintenance.ts', 'BILLING_DELETION_RETENTION_MS', 'Billing entity deletion mark', after('the erasure that set it')],
  ['src/convex/components/backend/maintenance.ts', 'REPORT_RETENTION_MS', 'Closed report, notice, decision and appeal', after('it was closed or made, once no appeal is open')],
  ['src/convex/flags.ts', 'FLAG_KEY_MAX', 'Flag key', value => `${value} characters`],
  ['src/convex/flags.ts', 'FLAG_TARGETS_MAX', 'Flag target list', value => `${value} account ids, workspace ids or plan keys per list`],
  ['src/convex/flags.ts', 'FLAG_TARGET_MAX', 'Flag target', value => `${value} characters per id or plan key`],
  ['src/convex/flags.ts', 'MAINTENANCE_MESSAGE_MAX', 'Maintenance banner message', value => `${value} characters`],
  ['src/convex/flags.ts', 'FLAG_ROWS_MAX', 'Stored flag overrides', value => `${value} flags at once; another is refused until one is removed`],
]

/** One row per window or lifetime: its value, read from the constant, and what the constant's doc says. */
export function retentionTable() {
  return table(['What', 'Value', 'Constant', 'Meaning'], RETENTION.map(([file, name, what, format]) => {
    const { value, doc } = constantOf(file, name)
    return [what, format(value), link(code(name), `https://github.com/qruto/nuxt-backend/blob/main/${file}`), doc]
  }))
}

// --- Privacy and data inventory ------------------------------------------------

/** What an erasure does, in words. */
const ERASURE_WORDS = { deleted: 'Deleted', pseudonymized: 'Pseudonymized', anonymized: 'Deleted and anonymized at the provider', expires: 'Expires on its own', kept: 'Kept' }

/** Where a participant lives, in words. */
const WHERE_WORDS = { component: 'the backend component', app: 'the billing component the app mounts' }

/** What a participant's rows are found by, in words. */
const KEY_WORDS = { account: 'account id', email: 'address', entity: 'billing entity' }

/** One row per participant of export and erasure: where, what it holds, what an erasure does, how long it is kept. */
export function dataInventoryTable() {
  return table(['Participant', 'Where', 'Holds', 'Found by', 'Erasure', 'Kept', 'Exported'], Object.entries(ACCOUNT_DATA_SOURCES).map(([key, source]) => [
    code(key),
    source.where === 'provider' ? `the ${source.tables.join(', ')}` : `${WHERE_WORDS[source.where]}: ${codes(source.tables)}`,
    source.holds,
    source.keyedBy.map(entry => KEY_WORDS[entry]).join(', ') || 'none',
    `${ERASURE_WORDS[source.erasure]}. ${source.erasureNote}`,
    source.retention,
    source.exported ? 'Yes' : 'No',
  ]))
}

/** Where a participant lives, as the data map says it. */
function whereOf(source) {
  if (source.where === 'provider') return `the ${source.tables.join(', ')}`
  return source.where === 'app' ? 'Your deployment: a component the app mounts' : 'Your deployment'
}

/** The data map: the participants by capability, each with what it stores, where, and for how long. */
export function dataMapTable() {
  return table(['Capability', 'Participant', 'Stores', 'Where', 'Kept'], dataMap().flatMap(group => group.participants.map((key, index) => {
    const source = ACCOUNT_DATA_SOURCES[key]
    return [index === 0 ? code(group.capability) : '', code(key), source.holds, whereOf(source), source.retention]
  })))
}

/** The processors, each with the capability that brings it in, what it processes, where, and its agreement. */
export function subprocessorsTable() {
  return table(['Who', 'Capability', 'What it processes', 'Where', 'Agreement', 'Configured by'], Object.values(SUBPROCESSORS).map(processor => [
    processor.name,
    link(code(processor.capability), CAPABILITIES[processor.capability].docs),
    processor.processes,
    processor.location,
    processor.agreement ? link(/dpa/i.test(processor.agreement) ? 'DPA' : 'Buyer terms', processor.agreement) : 'Its Services page',
    processor.configuredBy,
  ]))
}

/** How a stored item is kept, in words. */
const KIND_WORDS = { cookie: 'cookie', localStorage: 'local storage', sessionStorage: 'session storage', push: 'push subscription and service worker' }

/** Every cookie and storage key the package writes, with when, why, how long, and whether it waits for consent. */
export function browserStorageTable() {
  return table(['Name', 'Kind', 'Set when', 'Why', 'Lasts', 'Consent'], Object.values(BROWSER_STORAGE).map(item => [
    code(item.name),
    item.kind === 'cookie' && item.httpOnly ? 'HttpOnly cookie' : KIND_WORDS[item.kind],
    item.set,
    item.why,
    item.lasts,
    item.consent === 'necessary' ? 'Not needed: strictly necessary' : `Only after consent: ${code(item.consent)}`,
  ]))
}

/** One row per component table that holds nothing of a person, with why. */
export function noPersonalDataTable() {
  return table(['Table', 'Why it holds nothing of a person'], Object.entries(NO_PERSONAL_DATA).map(([name, why]) => [code(name), why]))
}
