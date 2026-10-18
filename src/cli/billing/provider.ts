// What the billing CLI's modules share: the tag every managed provider object
// carries, the environment and id-map shapes, the sync log entry, and the
// drain over the provider's paginated list endpoints.

export const MANAGED_BY = 'nuxt-backend'

export type Environment = 'sandbox' | 'production'

interface CreditMeterIds {
  meterId: string
  eventName?: string
  property?: string
}

export interface CatalogIds {
  products: Record<string, string>
  /** The keys of `products` that are credit packs: what a gift may buy. */
  packs?: string[]
  /** Pack key → its private gift product, outside `products`. */
  gifts?: Record<string, string>
  meters: Record<string, CreditMeterIds>
}

export interface SyncLogEntry {
  action: 'created' | 'exists' | 'adopted' | 'would-create' | 'updated' | 'would-update' | 'drift' | 'warn'
  kind: 'meter' | 'benefit' | 'product' | 'webhook' | 'custom-field' | 'currency'
  key: string
  id?: string
  note?: string
}

export function isManaged(metadata: Record<string, unknown> | undefined | null, key: string): boolean {
  return metadata?.managedBy === MANAGED_BY && metadata?.key === key
}

/**
 * The SDK hands back its error as a value, not always an `Error`: wrap it so
 * the CLI prints a message and a stack, and keep the original as `cause`.
 */
function asError(value: unknown, message: string): Error {
  if (value instanceof Error) return value
  if (value === undefined) return new Error(message)
  const detail = typeof value === 'string' ? value : JSON.stringify(value)
  return new Error(`${message}: ${detail}`, { cause: value })
}

/** Drain a paginated list endpoint (`{ result: { items, pagination } }`). */
export async function listAllPages<T extends { id: string, metadata?: unknown }>(
  fetchPage: (page: number) => Promise<{ ok: boolean, error?: unknown, value?: { result: { items: T[], pagination: { maxPage: number } } } }>,
): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const result = await fetchPage(page)
    if (!result.ok || !result.value) throw asError(result.error, '[nuxt-backend] billing sync: list request failed')
    items.push(...result.value.result.items)
    if (page >= result.value.result.pagination.maxPage) break
  }
  return items
}
