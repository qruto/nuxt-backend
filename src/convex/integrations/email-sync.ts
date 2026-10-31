import { type FunctionReference, type GenericActionCtx, type GenericDataModel, internalActionGeneric, type RegisteredAction } from 'convex/server'
import { v } from 'convex/values'
import { Resend, type Topic } from 'resend'
import { type EmailTopic, type EmailTopics, type ResolvedCaps, topicVersion } from '../email-preferences.js'
import { senderDomain } from '../email-posture.js'
import { flowAutomationName, type FlowSettings, flowTemplateAlias, type LifecycleFlow } from '../lifecycle-flows.js'

// `nuxt-backend email sync`, run on the deployment with its own key: what
// `billing sync` does for the catalog, for email. The topics
// `setupEmail({ topics })` declares, the segment that holds the app's
// accounts and the contact properties `contactProperties` declares are made
// at the provider (or found by name and brought up to date), their ids kept
// on the deployment; the webhook is pointed at every event the package
// reads; and the senders' domains are read for their region and DMARC. It
// never deletes anything, and changes nothing that is right already.

/** The events the deployment's webhook must send: delivery status, clicks for the sunset rule, and every change of a contact (its topics, an unsubscribe from everything) or suppression. */
export const REQUIRED_EMAIL_WEBHOOK_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.complained',
  'email.bounced',
  'email.clicked',
  'email.failed',
  'contact.updated',
  'contact.topics.updated',
  'suppression.added',
  'suppression.removed',
] as const

/** The segment every account is a contact of. */
export const ACCOUNTS_SEGMENT_NAME = 'Accounts'

/** One contact property the app keeps on each contact: a value lifecycle email and broadcasts can read. */
export interface EmailContactProperty {
  type: 'string' | 'number'
  /** What a contact without a value reads. */
  fallback?: string | number
}

/** What one object's sync did: `drift` is a difference the provider cannot take (a topic's default). */
export type EmailSyncAction = 'created' | 'updated' | 'exists' | 'would-create' | 'would-update' | 'drift'

/** One step of the sync, as the CLI's log shows it. */
export interface EmailSyncLogEntry {
  action: EmailSyncAction
  kind: 'topic' | 'segment' | 'property' | 'template' | 'automation'
  key: string
  id?: string
  note?: string
}

/** What `email sync` found and did. `webhook.secret` is the new endpoint's signing secret, for the CLI to store; it is never printed. */
export interface EmailSyncReport {
  dryRun: boolean
  /** The key's reach: `full` manages topics and contacts, `restricted` only sends, `missing` is no key. */
  key: 'full' | 'restricted' | 'missing'
  log: EmailSyncLogEntry[]
  webhook: {
    url: string | null
    action: 'created' | 'updated' | 'exists' | 'would-create' | 'would-update' | 'skipped' | 'missing'
    missingEvents: string[]
    /** Whether the provider delivers to it: it turns off a webhook that keeps failing. Absent until the webhook is found. */
    enabled?: boolean
    /** What became of its delivery switch or its signing secret, when the sync was asked to change one. */
    changed?: 'enabled' | 'would-enable' | 'secret-rotated' | 'would-rotate'
    secret?: string
  }
  /** Each sender's domain, its sending region and DMARC policy (`null`: none found). */
  senders: Array<{ variable: 'EMAIL_FROM' | 'EMAIL_MARKETING_FROM', domain: string, region: string | null, dmarc: string | null }>
  /** `EMAIL_REGION` against the transactional sender's domain. */
  region: { expected: string | null, actual: string | null }
  /** How many topics `setupEmail` declares, and whether the brand has a postal address. */
  topics: number
  postalAddress: boolean
  /** The lifecycle flows `setupEmail` turns on, and those the deployment does not run as the code declares them: `email sync` has not run since they changed. */
  flows: { declared: string[], unsynced: string[] }
}

interface SyncRefs {
  lifecycle?: {
    configure: FunctionReference<'mutation', 'internal', { flows: FlowSettings[], caps: ResolvedCaps }, null>
    settings: FunctionReference<'query', 'internal', Record<string, never>, { flows: FlowSettings[], caps: ResolvedCaps, syncedAt: number } | null>
  }
  providerIds: FunctionReference<'query', 'internal', Record<string, never>, Array<{ kind: 'topic' | 'segment', key: string, providerId: string, version?: string }>>
  saveProviderIds: FunctionReference<'mutation', 'internal', { ids: Array<{ kind: 'topic' | 'segment', key: string, providerId: string, version?: string }> }, null>
}

/** What a sync is asked to do. `webhook`: `auto` points `<site>/email/events` at the events, a URL points that one, `off` leaves it. */
export interface EmailSyncArgs {
  dryRun: boolean
  webhook: 'auto' | 'off' | string
  /** Turn the webhook back on when the provider turned it off (`doctor --fix`, once the route answers its probe). */
  enableWebhook?: boolean
  /**
   * Rotate the webhook's signing secret and do nothing else
   * (`env rotate EMAIL_WEBHOOK_SECRET`): the provider signs with the new and
   * the old secret for 24 hours, and the new one comes back for the CLI to store.
   */
  rotateWebhookSecret?: boolean
}

function readEnv(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}

type ProviderError = { name?: string, message?: string, statusCode?: number | null } | null

/** Whether a provider error is a key that may only send. */
function restricted(error: ProviderError): boolean {
  return error?.name === 'restricted_api_key' || error?.statusCode === 401
}

function refused(what: string, error: ProviderError): Error {
  return new Error(`[nuxt-backend] email sync: the provider refused to ${what}: ${error?.message ?? 'no answer'}`)
}

/** The most items one page of a provider listing holds. */
const PAGE_LIMIT = 100
/** The most pages one listing reads: past them, a sync works from what it read. */
const PAGES_MAX = 50

/** One page of a provider listing, as the SDK answers it. */
type ListedPage<Item> = { data: { data: Item[], has_more?: boolean } | null, error: ProviderError }

/**
 * Every item of a listing the provider pages (20 an answer unless asked for
 * more): a sync that read only the first page would miss what it made
 * before, and make it again. `null` items with the first refusal.
 */
async function listAll<Item extends { id: string }>(page: (options: { limit: number, after?: string }) => Promise<ListedPage<Item>>): Promise<{ data: Item[] | null, error: ProviderError }> {
  const items: Item[] = []
  let after: string | undefined
  for (let read = 0; read < PAGES_MAX; read++) {
    const listed = await page({ limit: PAGE_LIMIT, ...(after ? { after } : {}) })
    if (listed.error) return { data: null, error: listed.error }
    const data = listed.data?.data ?? []
    items.push(...data)
    after = data.at(-1)?.id
    if (!listed.data?.has_more || !after) break
  }
  return { data: items, error: null }
}

/** Every topic at the provider. The SDK's `topics.list` takes no page options, so this asks the API itself. */
const listTopics = (resend: Resend) => listAll<Topic>(({ limit, after }) =>
  resend.get<{ data: Topic[], has_more?: boolean }>(`/topics?${new URLSearchParams({ limit: String(limit), ...(after ? { after } : {}) }).toString()}`))

/** A DMARC policy from a TXT record's text, or `null`. */
export function dmarcPolicy(records: readonly string[]): string | null {
  for (const record of records) {
    const text = record.replace(/^"|"$/g, '').replace(/"\s*"/g, '')
    if (!/^v=DMARC1\b/i.test(text)) continue
    return /(?:^|;)\s*p\s*=\s*(\w+)/i.exec(text)?.[1]?.toLowerCase() ?? 'none'
  }
  return null
}

/** The DMARC policy of a domain over DNS-over-HTTPS: its own record, else its organizational domain's. `null` when none, or unreadable. */
async function readDmarc(domain: string, fetcher: typeof fetch): Promise<string | null> {
  const labels = domain.split('.')
  for (let start = 0; start <= labels.length - 2; start++) {
    const name = `_dmarc.${labels.slice(start).join('.')}`
    try {
      const response = await fetcher(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, { headers: { accept: 'application/dns-json' } })
      if (!response.ok) return null
      const answer = (await response.json() as { Answer?: Array<{ data?: string }> }).Answer ?? []
      const policy = dmarcPolicy(answer.map(entry => entry.data ?? ''))
      if (policy) return policy
    }
    catch {
      return null
    }
  }
  return null
}

/** One provider id the deployment keeps. */
type SavedId = { kind: 'topic' | 'segment', key: string, providerId: string, version?: string }
type ProviderIds = SavedId[]

/** One sync's shared state: the client, the ids kept, the ids to keep, and the log. */
interface SyncRun {
  resend: Resend
  dryRun: boolean
  kept: ProviderIds
  save: SavedId[]
  log: EmailSyncLogEntry[]
}

const keptId = (run: SyncRun, kind: 'topic' | 'segment', key: string) => run.kept.find(entry => entry.kind === kind && entry.key === key)

/** One declared topic: made at the provider, or found (by the id kept, else by name) and brought up to date. */
async function syncTopic(run: SyncRun, existing: Topic[], key: string, topic: EmailTopic): Promise<void> {
  const version = await topicVersion(topic)
  const kept = keptId(run, 'topic', key)
  const found = existing.find(entry => entry.id === kept?.providerId) ?? existing.find(entry => entry.name === topic.name)
  if (!found) return createTopic(run, key, topic, version)
  if (kept?.providerId !== found.id || kept?.version !== version) run.save.push({ kind: 'topic', key, providerId: found.id, version })
  await updateTopic(run, found, key, topic)
}

/** A topic the provider does not have yet. */
async function createTopic(run: SyncRun, key: string, topic: EmailTopic, version: string): Promise<void> {
  if (run.dryRun) return void run.log.push({ action: 'would-create', kind: 'topic', key })
  const made = await run.resend.topics.create({ name: topic.name, description: topic.description, defaultSubscription: topic.subscribedByDefault ? 'opt_in' : 'opt_out' })
  if (made.error || !made.data) throw refused(`create the ${key} topic`, made.error)
  run.save.push({ kind: 'topic', key, providerId: made.data.id, version })
  run.log.push({ action: 'created', kind: 'topic', key, id: made.data.id })
}

/** A topic the provider has: its words brought up to date, a different default reported as drift (the provider cannot change it). */
async function updateTopic(run: SyncRun, found: Topic, key: string, topic: EmailTopic): Promise<void> {
  if (found.default_subscription !== (topic.subscribedByDefault ? 'opt_in' : 'opt_out')) {
    return void run.log.push({ action: 'drift', kind: 'topic', key, id: found.id, note: `subscribes by ${found.default_subscription} at the provider, which cannot change it: rename the topic to make a new one` })
  }
  const stale = found.name !== topic.name || (found.description ?? '') !== topic.description
  if (stale && !run.dryRun) {
    const updated = await run.resend.topics.update({ id: found.id, name: topic.name, description: topic.description })
    if (updated.error) throw refused(`update the ${key} topic`, updated.error)
  }
  run.log.push({ action: stale ? (run.dryRun ? 'would-update' : 'updated') : 'exists', kind: 'topic', key, id: found.id })
}

/** The segment that holds the app's accounts: found, or made. */
async function syncSegment(run: SyncRun): Promise<void> {
  const segments = await listAll(options => run.resend.segments.list(options))
  if (segments.error) throw refused('list the segments', segments.error)
  const kept = keptId(run, 'segment', 'accounts')
  const found = segments.data?.find(entry => entry.id === kept?.providerId) ?? segments.data?.find(entry => entry.name === ACCOUNTS_SEGMENT_NAME)
  if (found) {
    if (kept?.providerId !== found.id) run.save.push({ kind: 'segment', key: 'accounts', providerId: found.id })
    return void run.log.push({ action: 'exists', kind: 'segment', key: 'accounts', id: found.id })
  }
  if (run.dryRun) return void run.log.push({ action: 'would-create', kind: 'segment', key: 'accounts' })
  const made = await run.resend.segments.create({ name: ACCOUNTS_SEGMENT_NAME })
  // A refused segment (the plan's segment limit, most often) leaves the rest of the
  // sync to run: the webhook and the topics matter more than the broadcast audience.
  if (made.error || !made.data) {
    const reason = made.error?.message ?? 'no answer'
    return void run.log.push({ action: 'drift', kind: 'segment', key: 'accounts', note: `not created: ${reason} Free a segment at the provider (or raise the plan), then run email sync again.` })
  }
  run.save.push({ kind: 'segment', key: 'accounts', providerId: made.data.id })
  run.log.push({ action: 'created', kind: 'segment', key: 'accounts', id: made.data.id })
}

/** The contact properties, by key: made when missing, a different type reported as drift. */
async function syncProperties(run: SyncRun, declared: Readonly<Record<string, EmailContactProperty>>): Promise<void> {
  if (Object.keys(declared).length === 0) return
  const properties = await listAll(options => run.resend.contactProperties.list(options))
  if (properties.error) throw refused('list the contact properties', properties.error)
  for (const [key, property] of Object.entries(declared)) {
    const found = properties.data?.find(entry => entry.key === key)
    if (found) {
      run.log.push(found.type === property.type ? { action: 'exists', kind: 'property', key, id: found.id } : { action: 'drift', kind: 'property', key, id: found.id, note: `is a ${found.type} at the provider` })
      continue
    }
    if (run.dryRun) {
      run.log.push({ action: 'would-create', kind: 'property', key })
      continue
    }
    const made = await run.resend.contactProperties.create({ key, type: property.type, ...(property.fallback !== undefined ? { fallbackValue: property.fallback } : {}) } as never)
    if (made.error || !made.data) throw refused(`create the ${key} contact property`, made.error)
    run.log.push({ action: 'created', kind: 'property', key, id: made.data.id })
  }
}

/** The webhook at `url`, with every event the deployment's copies read: found and completed, or made (its secret goes back to the CLI). */
async function syncWebhook(run: SyncRun, url: string, enable = false): Promise<EmailSyncReport['webhook']> {
  const hook = await findWebhook(run, url)
  return hook ? completeWebhook(run, url, hook, enable) : createWebhook(run, url)
}

/** A new webhook at `url` with every event (none on a dry run); its secret goes back to the CLI. */
async function createWebhook(run: SyncRun, url: string): Promise<EmailSyncReport['webhook']> {
  if (run.dryRun) return { url, action: 'would-create', missingEvents: [...REQUIRED_EMAIL_WEBHOOK_EVENTS] }
  const made = await run.resend.webhooks.create({ endpoint: url, events: [...REQUIRED_EMAIL_WEBHOOK_EVENTS] })
  if (made.error || !made.data) throw refused('create the webhook', made.error)
  return { url, action: 'created', missingEvents: [], secret: made.data.signing_secret }
}

/** The webhook found at `url`, given the events it lacks and, with `enable`, turned back on. */
async function completeWebhook(run: SyncRun, url: string, hook: { id: string, status: string, events: string[] | null }, enable: boolean): Promise<EmailSyncReport['webhook']> {
  const events = new Set<string>(hook.events ?? [])
  const missing = REQUIRED_EMAIL_WEBHOOK_EVENTS.filter(event => !events.has(event))
  const enabled = hook.status !== 'disabled'
  // Only ever turned on, never off: a webhook the provider turned off after failed deliveries.
  const switching = enable && !enabled
  if (missing.length === 0 && !switching) return { url, action: 'exists', missingEvents: [], enabled }
  const changed = switching ? { changed: run.dryRun ? 'would-enable' as const : 'enabled' as const } : {}
  if (run.dryRun) return { url, action: missing.length > 0 ? 'would-update' : 'exists', missingEvents: missing, enabled, ...changed }
  await updateWebhook(run, hook.id, { events: missing.length > 0 ? [...new Set([...events, ...REQUIRED_EMAIL_WEBHOOK_EVENTS])] : null, enable: switching })
  return { url, action: missing.length > 0 ? 'updated' : 'exists', missingEvents: [], enabled: true, ...changed }
}

/** Give a webhook more events, or turn it back on. */
async function updateWebhook(run: SyncRun, id: string, { events, enable }: { events: string[] | null, enable: boolean }): Promise<void> {
  const updated = await run.resend.webhooks.update(id, { ...(events ? { events: events as never } : {}), ...(enable ? { status: 'enabled' as const } : {}) })
  if (updated.error) throw refused(enable ? 'turn the webhook back on' : 'update the webhook\'s events', updated.error)
}

/** The provider's webhook at `url`, or `null`. */
async function findWebhook(run: SyncRun, url: string) {
  const hooks = await listAll(options => run.resend.webhooks.list(options))
  if (hooks.error) throw refused('list the webhooks', hooks.error)
  return hooks.data?.find(entry => entry.endpoint.replace(/\/+$/, '') === url.replace(/\/+$/, '')) ?? null
}

/**
 * Rotate the signing secret of the webhook at `url`: the provider signs
 * every delivery with the new and the old secret for 24 hours, so the
 * deployment's copy can change at any moment of that day. The new secret
 * goes back to the CLI, which stores it and never prints it.
 */
async function rotateWebhookSecret(run: SyncRun, url: string): Promise<EmailSyncReport['webhook']> {
  const hook = await findWebhook(run, url)
  if (!hook) return { url, action: 'missing', missingEvents: [...REQUIRED_EMAIL_WEBHOOK_EVENTS] }
  const enabled = hook.status !== 'disabled'
  if (run.dryRun) return { url, action: 'exists', missingEvents: [], enabled, changed: 'would-rotate' }
  const rotated = await run.resend.webhooks.rotateSigningSecret(hook.id)
  if (rotated.error || !rotated.data) throw refused('rotate the webhook\'s signing secret', rotated.error)
  return { url, action: 'exists', missingEvents: [], enabled, changed: 'secret-rotated', secret: rotated.data.signing_secret }
}

/** The lifecycle flows `setupEmail` declares, with what `email sync` makes of each at the provider. */
export interface LifecycleSyncDeclared {
  flows: FlowSettings[]
  caps: ResolvedCaps
  /** A flow's email in the package's layout: its template. */
  email: (flow: LifecycleFlow) => Promise<{ subject: string, html: string, text: string }>
  /** The sender a flow's email goes from. */
  from: (flow: LifecycleFlow) => string | undefined
}

/** One flow's template at the provider, by its alias: found, or made and published. Answers its id. */
async function syncFlowTemplate(run: SyncRun, flow: LifecycleFlow, declared: LifecycleSyncDeclared): Promise<string | null> {
  const alias = flowTemplateAlias(flow)
  const found = await run.resend.templates.get(alias)
  if (found.data) {
    run.log.push({ action: 'exists', kind: 'template', key: flow, id: found.data.id })
    return found.data.id
  }
  if (found.error && found.error.statusCode !== 404 && found.error.name !== 'not_found') throw refused(`read the ${flow} template`, found.error)
  if (run.dryRun) {
    run.log.push({ action: 'would-create', kind: 'template', key: flow })
    return null
  }
  const email = await declared.email(flow)
  const from = declared.from(flow)
  // Made once: an edit in the provider's editor stays, and a later sync leaves it.
  const made = await run.resend.templates.create({ name: `nuxt-backend: ${flow}`, alias, subject: email.subject, html: email.html, text: email.text, ...(from ? { from } : {}) })
  if (made.error || !made.data) throw refused(`create the ${flow} template`, made.error)
  const published = await run.resend.templates.publish(made.data.id)
  if (published.error) throw refused(`publish the ${flow} template`, published.error)
  run.log.push({ action: 'created', kind: 'template', key: flow, id: made.data.id })
  return made.data.id
}

/** One flow's automation, by its name: found, or made enabled, its trigger the flow's event and its one step the template. */
async function syncFlowAutomation(run: SyncRun, flow: FlowSettings, templateId: string | null, existing: Array<{ id: string, name: string }>, from: string | undefined): Promise<void> {
  const name = flowAutomationName(flow.flow as LifecycleFlow)
  const found = existing.find(entry => entry.name === name)
  if (found) return void run.log.push({ action: 'exists', kind: 'automation', key: flow.flow, id: found.id })
  if (run.dryRun || !templateId) return void run.log.push({ action: 'would-create', kind: 'automation', key: flow.flow })
  const made = await run.resend.automations.create({
    name,
    status: 'enabled',
    steps: [
      { key: 'start', type: 'trigger', config: { eventName: flow.eventName } },
      { key: 'send', type: 'send_email', config: { template: { id: templateId }, ...(from ? { from } : {}) } },
    ],
    connections: [{ from: 'start', to: 'send' }],
  })
  if (made.error || !made.data) throw refused(`create the ${flow.flow} automation`, made.error)
  run.log.push({ action: 'created', kind: 'automation', key: flow.flow, id: made.data.id })
}

/** Every declared flow's template and automation at the provider. */
async function syncFlows(run: SyncRun, declared: LifecycleSyncDeclared): Promise<void> {
  if (declared.flows.length === 0) return
  const listed = await listAll(options => run.resend.automations.list(options))
  if (listed.error) throw refused('list the automations', listed.error)
  const existing = (listed.data ?? []).map(entry => ({ id: entry.id, name: entry.name }))
  for (const flow of declared.flows) {
    const templateId = await syncFlowTemplate(run, flow.flow as LifecycleFlow, declared)
    await syncFlowAutomation(run, flow, templateId, existing, declared.from(flow.flow as LifecycleFlow))
  }
}

/** Everything the code declares, at the provider: the topics, the accounts' segment, the contact properties and the flows. */
async function syncDeclared(run: SyncRun, declared: { topics: EmailTopics, contactProperties: Readonly<Record<string, EmailContactProperty>>, lifecycle?: LifecycleSyncDeclared }, existing: Topic[]): Promise<void> {
  for (const [key, topic] of Object.entries(declared.topics)) await syncTopic(run, existing, key, topic)
  await syncSegment(run)
  await syncProperties(run, declared.contactProperties)
  if (declared.lifecycle) await syncFlows(run, declared.lifecycle)
}

/** A value as JSON with its keys in order: what the deployment keeps comes back with its keys sorted. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => inner && typeof inner === 'object' && !Array.isArray(inner) ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b))) : inner)
}

/** The declared flows the deployment does not run as declared: missing, or with other settings. */
function unsyncedFlows(declared: FlowSettings[], kept: FlowSettings[] | undefined, caps: { declared: ResolvedCaps, kept: ResolvedCaps | undefined }): string[] {
  const capsChanged = canonical(caps.declared) !== canonical(caps.kept)
  return declared.filter((flow) => {
    const other = kept?.find(entry => entry.flow === flow.flow)
    return !other || capsChanged || canonical(other) !== canonical(flow)
  }).map(flow => flow.flow)
}

/**
 * The flows' settings the deployment keeps, against the code's: the flows it
 * does not run as declared, and `keep`, which writes the code's settings
 * when they differ at all (a flow turned off included) and answers the
 * flows left unsynced, none.
 */
async function flowSettings(ctx: Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>, refs: SyncRefs['lifecycle'], declared: LifecycleSyncDeclared | undefined): Promise<{ unsynced: string[], keep: () => Promise<string[]> }> {
  if (!refs || !declared) return { unsynced: [], keep: async () => [] }
  const kept = await ctx.runQuery(refs.settings, {})
  const unsynced = unsyncedFlows(declared.flows, kept?.flows, { declared: declared.caps, kept: kept?.caps })
  const stale = unsynced.length > 0 || (kept?.flows.length ?? 0) !== declared.flows.length
  return {
    unsynced,
    keep: async () => {
      if (stale) await ctx.runMutation(refs.configure, { flows: declared.flows, caps: declared.caps })
      return []
    },
  }
}

/** Each sender's domain: its sending region at the provider, and its DMARC policy. */
async function readSenders(resend: Resend, fetcher: typeof fetch): Promise<EmailSyncReport['senders']> {
  const domains = await listAll(options => resend.domains.list(options))
  const senders: EmailSyncReport['senders'] = []
  for (const variable of ['EMAIL_FROM', 'EMAIL_MARKETING_FROM'] as const) {
    const value = readEnv(variable)
    const domain = value ? senderDomain(value) : null
    if (!domain) continue
    const known = domains.data?.find(entry => entry.name === domain || domain.endsWith(`.${entry.name}`))
    senders.push({ variable, domain, region: known?.region ?? null, dmarc: await readDmarc(domain, fetcher) })
  }
  return senders
}

/** The URL the webhook should point at: the deployment's `/email/events` for `auto`, `null` for `off` (or no site to point at). */
function webhookUrl(webhook: EmailSyncArgs['webhook']): string | null {
  if (webhook === 'off') return null
  if (webhook !== 'auto') return webhook
  const site = (readEnv('CONVEX_SITE_URL') ?? '').replace(/\/+$/, '')
  return site ? `${site}/email/events` : null
}

/** What a sync reports before it reaches the provider: what the code declares, and nothing found yet. */
function startingReport(declared: { topics: EmailTopics, address: string | undefined, lifecycle?: LifecycleSyncDeclared }, url: string | null, dryRun: boolean): EmailSyncReport {
  return {
    dryRun,
    key: 'missing',
    log: [],
    webhook: { url, action: url ? 'missing' : 'skipped', missingEvents: url ? [...REQUIRED_EMAIL_WEBHOOK_EVENTS] : [] },
    senders: [],
    region: { expected: readEnv('EMAIL_REGION') ?? null, actual: null },
    topics: Object.keys(declared.topics).length,
    postalAddress: Boolean(declared.address?.trim()),
    flows: { declared: (declared.lifecycle?.flows ?? []).map(flow => flow.flow), unsynced: [] },
  }
}

/**
 * Sync what `setupEmail` declares to the provider.
 *
 * @internal
 */
export async function syncEmail(
  ctx: Pick<GenericActionCtx<GenericDataModel>, 'runQuery' | 'runMutation'>,
  refs: SyncRefs,
  declared: { topics: EmailTopics, contactProperties: Readonly<Record<string, EmailContactProperty>>, address: string | undefined, lifecycle?: LifecycleSyncDeclared },
  { dryRun, webhook, enableWebhook, rotateWebhookSecret: rotate }: EmailSyncArgs,
  fetcher: typeof fetch = fetch,
): Promise<EmailSyncReport> {
  const url = webhookUrl(webhook)
  const report = startingReport(declared, url, dryRun)
  // The flows run on the deployment from the settings kept here: read now, written only once their templates and automations exist.
  const flows = await flowSettings(ctx, refs.lifecycle, declared.lifecycle)
  report.flows.unsynced = flows.unsynced
  const apiKey = readEnv('EMAIL_API_KEY')
  if (!apiKey) return report
  const resend = new Resend(apiKey)
  const listed = await listTopics(resend)
  if (listed.error) {
    if (restricted(listed.error)) return { ...report, key: 'restricted' }
    throw refused('list the topics', listed.error)
  }
  const run: SyncRun = { resend, dryRun, kept: await ctx.runQuery(refs.providerIds, {}), save: [], log: report.log }
  // A rotation touches the webhook's secret and nothing else.
  if (rotate) return { ...report, key: 'full', webhook: url ? await rotateWebhookSecret(run, url) : report.webhook }
  await syncDeclared(run, declared, listed.data ?? [])
  if (run.save.length > 0 && !dryRun) await ctx.runMutation(refs.saveProviderIds, { ids: run.save })
  // Every flow's template and automation exists now (a refusal threw above), so a flow kept here starts something.
  if (!dryRun) report.flows.unsynced = await flows.keep()
  if (url) report.webhook = await syncWebhook(run, url, enableWebhook === true)
  report.senders = await readSenders(resend, fetcher)
  report.region.actual = report.senders.find(sender => sender.variable === 'EMAIL_FROM')?.region ?? null
  return { ...report, key: 'full' }
}

/** What `email:syncEmail` takes from the CLI. */
export type EmailSyncActionArgs = { dryRun?: boolean, webhook?: string, enableWebhook?: boolean, rotateWebhookSecret?: boolean }

/** The internal action `backend/email.ts` re-exports for `npx nuxt-backend email sync` and `doctor`. */
export function syncEmailAction(refs: SyncRefs, declared: { topics: EmailTopics, contactProperties: Readonly<Record<string, EmailContactProperty>>, address: () => string | undefined, lifecycle?: LifecycleSyncDeclared }): RegisteredAction<'internal', EmailSyncActionArgs, Promise<EmailSyncReport>> {
  return internalActionGeneric({
    args: { dryRun: v.optional(v.boolean()), webhook: v.optional(v.string()), enableWebhook: v.optional(v.boolean()), rotateWebhookSecret: v.optional(v.boolean()) },
    handler: (ctx, { dryRun, webhook, enableWebhook, rotateWebhookSecret }) => syncEmail(ctx, refs, { topics: declared.topics, contactProperties: declared.contactProperties, address: declared.address(), ...(declared.lifecycle ? { lifecycle: declared.lifecycle } : {}) }, { dryRun: dryRun === true, webhook: webhook ?? 'auto', enableWebhook: enableWebhook === true, rotateWebhookSecret: rotateWebhookSecret === true }),
  }) as RegisteredAction<'internal', EmailSyncActionArgs, Promise<EmailSyncReport>>
}
