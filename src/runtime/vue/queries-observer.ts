import type { QueryJournal } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import { getFunctionName } from 'convex/server'
import type { Value } from 'convex/values'
import { convexToJson } from 'convex/values'
import type { Watch, PaginatedWatch } from './client'
// Derive the RequestForQueries type (incl. paginationOptions) from convex/react
// so our observer matches the canonical shape without local duplication.
import type { RequestForQueries } from 'convex/react'

type Identifier = string

type QueryInfo = {
  query: FunctionReference<'query'>
  args: Record<string, Value>
  watch: Watch<Value> | PaginatedWatch<Value>
  unsubscribe: () => void
  paginationOptions?: unknown
}

export interface CreateWatch {
  (
    query: FunctionReference<'query'>,
    args: Record<string, Value>,
    options: {
      journal?: QueryJournal
      // Just the existence of this option makes this a paginated query
      // (matches React's QueriesObserver/CreateWatch).
      paginationOptions?: unknown
    },
  ): Watch<Value> | PaginatedWatch<Value>
}

/**
 * Tracks subscriptions for a dynamic set of Convex queries and notifies
 * listeners whenever any result changes.
 *
 * Framework-agnostic: the composables layer ({@link useConvexQueries}) wraps
 * this class with Vue reactivity.
 */
export class QueriesObserver {
  public createWatch: CreateWatch
  private queries: Record<Identifier, QueryInfo>
  private listeners: Set<() => void>

  constructor(createWatch: CreateWatch) {
    this.createWatch = createWatch
    this.queries = {}
    this.listeners = new Set()
  }

  setQueries(
    newQueries: Record<
      Identifier,
      {
        query: FunctionReference<'query'>
        args: Record<string, Value>
        paginationOptions?: unknown
      }
    >,
  ): void {
    // Add the new queries before unsubscribing from the old ones so that
    // the deduping in the client can help if there are duplicates.
    // Matches React's QueriesObserver.setQueries.
    for (const identifier of Object.keys(newQueries)) {
      const { query, args, paginationOptions } = newQueries[identifier]!
      // Might throw
      getFunctionName(query)

      if (this.queries[identifier] === undefined) {
        // No existing query => add it.
        this.addQuery(
          identifier,
          query,
          args,
          paginationOptions ? { paginationOptions } : {},
        )
      }
      else {
        const existingInfo = this.queries[identifier]!

        if (
          getFunctionName(query) !== getFunctionName(existingInfo.query)
          || JSON.stringify(convexToJson(args))
          !== JSON.stringify(convexToJson(existingInfo.args))
          || JSON.stringify(paginationOptions)
          !== JSON.stringify(existingInfo.paginationOptions)
        ) {
          // Existing query that doesn't match => remove the old and add the new.
          this.removeQuery(identifier)
          this.addQuery(
            identifier,
            query,
            args,
            paginationOptions ? { paginationOptions } : {},
          )
        }
      }
    }

    // Prune all the existing queries that we no longer need.
    for (const identifier of Object.keys(this.queries)) {
      if (newQueries[identifier] === undefined) {
        this.removeQuery(identifier)
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getLocalResults(
    queries: RequestForQueries,
  ): Record<Identifier, Value | undefined | Error | unknown> {
    const result: Record<Identifier, Value | Error | undefined | unknown> = {}
    for (const identifier of Object.keys(queries)) {
      const entry = queries[identifier]!
      const { query, args } = entry
      const paginationOptions = (entry as { paginationOptions?: unknown }).paginationOptions

      // Might throw
      getFunctionName(query)

      // Note: We're not gonna watch, we could save some allocations
      // by getting a reference to the client directly instead.
      const watch = this.createWatch(
        query,
        args,
        paginationOptions ? { paginationOptions } : {},
      )

      let value: Value | undefined | Error | unknown
      try {
        value = watch.localQueryResult()
      }
      catch (e) {
        // Only collect instances of `Error` because thats how callers
        // will distinguish errors from normal results.
        if (e instanceof Error) {
          value = e
        }
        else {
          throw e
        }
      }
      result[identifier] = value
    }
    return result
  }

  setCreateWatch(createWatch: CreateWatch): void {
    this.createWatch = createWatch
    // If we have a new watch, we might be using a new Convex client.
    // Recreate all the watches being careful to preserve the journals.
    // Matches React (handles journal only on non-paginated watches).
    for (const identifier of Object.keys(this.queries)) {
      const { query, args, watch, paginationOptions }
        = this.queries[identifier]!
      const journal = 'journal' in watch ? watch.journal() : undefined
      this.removeQuery(identifier)
      this.addQuery(identifier, query, args, {
        ...(journal ? { journal } : {}),
        ...(paginationOptions ? { paginationOptions } : {}),
      })
    }
  }

  destroy(): void {
    for (const identifier of Object.keys(this.queries)) {
      this.removeQuery(identifier)
    }
    this.listeners = new Set()
  }

  private addQuery(
    identifier: Identifier,
    query: FunctionReference<'query'>,
    args: Record<string, Value>,
    {
      paginationOptions,
      journal,
    }: {
      paginationOptions?: unknown
      journal?: QueryJournal
    },
  ): void {
    if (this.queries[identifier] !== undefined) {
      throw new Error(
        `Tried to add a new query with identifier ${identifier} when it already exists.`,
      )
    }
    const watch = this.createWatch(query, args, {
      ...(journal ? { journal } : {}),
      ...(paginationOptions ? { paginationOptions } : {}),
    })
    const unsubscribe = watch.onUpdate(() => this.notifyListeners())
    this.queries[identifier] = {
      query,
      args,
      watch,
      unsubscribe,
      ...(paginationOptions ? { paginationOptions } : {}),
    }
  }

  private removeQuery(identifier: Identifier): void {
    const info = this.queries[identifier]
    if (info === undefined) {
      throw new Error(`No query found with identifier ${identifier}.`)
    }
    info.unsubscribe()
    // Use delete to match React's QueriesObserver (simpler, matches structure).
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.queries[identifier]
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

// Re-export the (derived) RequestForQueries for consumers of the observer module
// and for use-queries.ts re-export. The shape (with optional paginationOptions)
// comes from 'convex/react'.
export type { RequestForQueries } from 'convex/react'
