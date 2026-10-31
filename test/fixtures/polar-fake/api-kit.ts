import type { Deliveries } from './deliver'
import { invalid, notFound } from './errors'
import type { Flows } from './flows'
import type { Models } from './models'
import { type Metadata, newId, type FakeState, stableId } from './state'
import { toWire, type WireInput, type WireName } from './wire'

// What every API handler shares: its context, how it reads a request, and
// how it answers one.

export interface ApiContext {
  state: FakeState
  models: Models
  flows: Flows
  deliveries: Deliveries
  now: () => number
  /** The origin the fake provider serves its pages at. */
  baseUrl: string
}

export type Body = Record<string, unknown>

/** One parsed API request: the path's parameters, the query and the JSON body. */
export interface ApiRequest {
  params: Record<string, string>
  query: URLSearchParams
  body: Body
}

/** An API answer: a status, and the body to send as JSON (none for 204). */
export interface ApiResponse {
  status: number
  body?: unknown
}

export type Handler = (request: ApiRequest) => ApiResponse

/** A route: its method, its path pattern (`/v1/products/{id}`) and its handler. */
export type Route = readonly [method: string, pattern: string, handler: Handler]

/** Answer with a model, serialized through the SDK's own schema for it. */
export function reply<Name extends WireName>(status: number, name: Name, value: WireInput<Name>): ApiResponse {
  return { status, body: toWire(name, value) }
}

/** One page of a list, as the provider pages: `page` from 1, `limit` 1–100 (10 by default). */
export function paginate<Item>(items: Item[], query: URLSearchParams): { items: Item[], pagination: { totalCount: number, maxPage: number } } {
  const limit = Math.min(Math.max(Number(query.get('limit')) || 10, 1), 100)
  const page = Math.max(Number(query.get('page')) || 1, 1)
  return { items: items.slice((page - 1) * limit, page * limit), pagination: { totalCount: items.length, maxPage: Math.ceil(items.length / limit) } }
}

/** Every value of a repeatable query parameter. */
export function all(query: URLSearchParams, name: string): string[] {
  return query.getAll(name).filter(Boolean)
}

/** The `metadata[key]=value` filter of a list request: whether a record's metadata matches it. */
export function matchesMetadata(query: URLSearchParams, metadata: Metadata): boolean {
  for (const [name, value] of query) {
    const key = /^metadata\[(.+)\]$/.exec(name)?.[1]
    if (key !== undefined && String(metadata[key]) !== value) return false
  }
  return true
}

/** Newest first, as the provider sorts by default and by `-created_at`. */
export function newestFirst<Item extends { createdAt: number }>(items: Item[]): Item[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt)
}

/** A record by id from one of the state's collections, or the provider's 404. */
export function find<Record_>(records: Record<string, Record_>, id: string | undefined, what: string): Record_ {
  const record = id ? records[id] : undefined
  if (!record) throw notFound(what)
  return record
}

/** A string field, `null` when absent. */
export function text(body: Body, field: string): string | null {
  const value = body[field]
  return typeof value === 'string' && value !== '' ? value : null
}

/** A required string field, or the provider's 422 naming it. */
export function requiredText(body: Body, field: string): string {
  const value = text(body, field)
  if (value === null) throw invalid(field, 'Field required')
  return value
}

/** A number field, `null` when absent. */
export function numberOf(body: Body, field: string): number | null {
  const value = body[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** An ISO time field as epoch milliseconds, `null` when absent. */
export function timeOf(body: Body, field: string): number | null {
  const value = text(body, field)
  if (value === null) return null
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw invalid(field, 'Input should be a valid datetime')
  return time
}

/** The metadata of a body: string, number and boolean values only. */
export function metadataOf(value: unknown): Metadata {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry))) as Metadata
}

/**
 * The catalog key a managed object carries, which gives it the same id on
 * every machine: a plan's yearly product goes by `<plan>:year`, as the
 * generated map names it.
 */
export function managedKey(metadata: Metadata): string | null {
  if (metadata.managedBy !== 'nuxt-backend' || typeof metadata.key !== 'string') return null
  return metadata.interval === 'year' ? `${metadata.key}:year` : metadata.key
}

/** An id the same on every machine for a managed object, or a fresh one. */
export function idFor(kind: string, key: string | null, taken: Record<string, unknown>): string {
  const stable = key ? stableId(kind, key) : null
  return stable && !taken[stable] ? stable : newId()
}

/** A list of strings, or an empty one. */
export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}
