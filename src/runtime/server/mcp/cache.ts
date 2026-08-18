/**
 * In-memory TTL + LRU cache for resolved agent sessions, keyed by the opaque
 * OAuth Bearer. One exchange round trip per token per JWT lifetime: entries
 * expire with the minted Convex JWT (minus a safety margin so a cached JWT is
 * never handed out moments before it lapses), which also bounds how long a
 * revoked agent token keeps working. Pure and clock-injectable for tests.
 */

export interface ExchangeCache<Value> {
  get: (key: string) => Value | null
  set: (key: string, value: Value, ttlMs: number) => void
  readonly size: number
}

/** Marginal safety window between cache expiry and JWT expiry. */
export const EXCHANGE_CACHE_MARGIN_MS = 30_000

const DEFAULT_CAPACITY = 500

export function createExchangeCache<Value>(options?: {
  capacity?: number
  now?: () => number
}): ExchangeCache<Value> {
  const capacity = options?.capacity ?? DEFAULT_CAPACITY
  const now = options?.now ?? Date.now
  const entries = new Map<string, { value: Value, expiresAt: number }>()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return null
      if (entry.expiresAt <= now()) {
        entries.delete(key)
        return null
      }
      // Re-insert so Map iteration order doubles as LRU recency.
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },
    set(key, value, ttlMs) {
      if (ttlMs <= 0) return
      entries.delete(key)
      entries.set(key, { value, expiresAt: now() + ttlMs })
      while (entries.size > capacity) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        entries.delete(oldest)
      }
    },
    get size() {
      return entries.size
    },
  }
}
