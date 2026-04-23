import type { QueryJournal } from 'convex/browser'
import type { FunctionReference } from 'convex/server'
import { getFunctionName } from 'convex/server'
import type { Value } from 'convex/values'
import { convexToJson } from 'convex/values'
import type { Watch } from './client'

type Identifier = string

interface QueryInfo {
  query: FunctionReference<'query'>
  args: Record<string, Value>
  watch: Watch<Value>
  unsubscribe: () => void
}

export interface CreateWatch {
  (
    query: FunctionReference<'query'>,
    args: Record<string, Value>,
    options: {
      journal?: QueryJournal
    },
  ): Watch<Value>
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
      }
    >,
  ): void {
    // Add new queries before unsubscribing old ones for deduplication.
    for (const identifier of Object.keys(newQueries)) {
      const { query, args } = newQueries[identifier]
      getFunctionName(query)

      if (this.queries[identifier] === undefined) {
        this.addQuery(identifier, query, args, {})
      }
      else {
        const existingInfo = this.queries[identifier]

        if (
          getFunctionName(query) !== getFunctionName(existingInfo.query)
          || JSON.stringify(convexToJson(args)) !== JSON.stringify(convexToJson(existingInfo.args))
        ) {
          this.removeQuery(identifier)
          this.addQuery(identifier, query, args, {})
        }
      }
    }

    // Remove queries no longer needed.
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
  ): Record<Identifier, Value | undefined | Error> {
    const result: Record<Identifier, Value | Error | undefined> = {}
    for (const identifier of Object.keys(queries)) {
      const { query, args } = queries[identifier]
      getFunctionName(query)

      const watch = this.createWatch(query, args, {})

      let value: Value | undefined | Error
      try {
        value = watch.localQueryResult()
      }
      catch (e) {
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
    for (const identifier of Object.keys(this.queries)) {
      const { query, args, watch } = this.queries[identifier]
      const journal = watch.journal()
      this.removeQuery(identifier)
      this.addQuery(identifier, query, args, journal ? { journal } : {})
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
    options: { journal?: QueryJournal },
  ): void {
    if (this.queries[identifier] !== undefined) {
      throw new Error(
        `Tried to add a new query with identifier ${identifier} when it already exists.`,
      )
    }
    const watch = this.createWatch(query, args, options)
    const unsubscribe = watch.onUpdate(() => this.notifyListeners())
    this.queries[identifier] = {
      query,
      args,
      watch,
      unsubscribe,
    }
  }

  private removeQuery(identifier: Identifier): void {
    const info = this.queries[identifier]
    if (info === undefined) {
      throw new Error(`No query found with identifier ${identifier}.`)
    }
    info.unsubscribe()
    delete this.queries[identifier]
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

/**
 * An object representing a request to load multiple queries.
 *
 * @public
 */
export type RequestForQueries = Record<
  string,
  {
    query: FunctionReference<'query'>
    args: Record<string, Value>
  }
>
