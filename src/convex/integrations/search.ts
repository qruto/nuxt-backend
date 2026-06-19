import { v } from 'convex/values'
import type {
  DocumentByName,
  GenericDatabaseReader,
  GenericDataModel,
  NamedSearchIndex,
  NamedTableInfo,
  QueryBuilder,
  RegisteredQuery,
  SearchFilterBuilder,
  SearchIndexNames,
  TableNamesInDataModel,
} from 'convex/server'

type TableInfo<DM extends GenericDataModel, T extends TableNamesInDataModel<DM>> = NamedTableInfo<DM, T>
type Doc<DM extends GenericDataModel, T extends TableNamesInDataModel<DM>> = DocumentByName<DM, T>
type IndexName<DM extends GenericDataModel, T extends TableNamesInDataModel<DM>> = SearchIndexNames<TableInfo<DM, T>>
type FilterBuilder<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexName<DM, T>,
> = SearchFilterBuilder<Doc<DM, T>, NamedSearchIndex<TableInfo<DM, T>, I>>
type Finalizer<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexName<DM, T>,
> = ReturnType<FilterBuilder<DM, T, I>['search']>
type SearchField<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexName<DM, T>,
> = Parameters<FilterBuilder<DM, T, I>['search']>[0]

/**
 * A search bound to an index and term, ready to refine (`.eq`) and execute
 * (`.take` / `.collect` / `.first`). A blank term short-circuits to an empty
 * result without touching the database.
 */
class SearchExecutable<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexName<DM, T>,
> {
  private readonly refinements: Array<(q: Finalizer<DM, T, I>) => Finalizer<DM, T, I>> = []

  constructor(
    private readonly db: GenericDatabaseReader<DM>,
    private readonly table: T,
    private readonly index: I,
    private readonly field: SearchField<DM, T, I>,
    private readonly term: string,
  ) {}

  /** Restrict results by an `eq` on a filter field declared on the search index. */
  eq(...args: Parameters<Finalizer<DM, T, I>['eq']>): this {
    this.refinements.push(q => q.eq(...args))
    return this
  }

  private run() {
    return this.db.query(this.table).withSearchIndex(this.index, (q) => {
      let filter = q.search(this.field, this.term)
      for (const refine of this.refinements) filter = refine(filter)
      return filter
    })
  }

  /** Return up to `limit` ranked matches (empty array for a blank term). */
  take(limit: number): Promise<Array<Doc<DM, T>>> {
    if (!this.term) return Promise.resolve([])
    return this.run().take(limit)
  }

  /** Return all ranked matches (empty array for a blank term). */
  collect(): Promise<Array<Doc<DM, T>>> {
    if (!this.term) return Promise.resolve([])
    return this.run().collect()
  }

  /** Return the top-ranked match, or `null` (also `null` for a blank term). */
  first(): Promise<Doc<DM, T> | null> {
    if (!this.term) return Promise.resolve(null)
    return this.run().first()
  }
}

class SearchIndexBound<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexName<DM, T>,
> {
  constructor(
    private readonly db: GenericDatabaseReader<DM>,
    private readonly table: T,
    private readonly index: I,
  ) {}

  /** Set the search field and the user's term to match against it. */
  search(field: SearchField<DM, T, I>, term: string): SearchExecutable<DM, T, I> {
    return new SearchExecutable(this.db, this.table, this.index, field, term)
  }
}

/**
 * A fluent, type-safe builder over Convex's native full-text search. Index
 * names, search fields, and `eq` filter fields are all checked against your
 * schema's `searchIndex` definitions.
 *
 * @example
 * ```ts
 * const results = await search(ctx, 'messages')
 *   .withSearchIndex('search_text')
 *   .search('text', term)
 *   .eq('userId', userId)
 *   .take(20)
 * ```
 */
export function search<DM extends GenericDataModel, T extends TableNamesInDataModel<DM>>(
  ctx: { db: GenericDatabaseReader<DM> },
  table: T,
) {
  return {
    /** Pick the `searchIndex` (by name) to query. */
    withSearchIndex<I extends IndexName<DM, T>>(index: I): SearchIndexBound<DM, T, I> {
      return new SearchIndexBound<DM, T, I>(ctx.db, table, index)
    },
  }
}

export interface SearchConfig<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexName<DM, T>,
> {
  /** The table to search. */
  table: T
  /** The `searchIndex` name on that table. */
  index: I
  /** The search field declared on the index. */
  searchField: SearchField<DM, T, I>
  /** Default number of results when the caller omits `limit` (default 20). */
  defaultLimit?: number
}

/**
 * Define a ready-to-call Convex search query from a search-index config. The
 * generated query takes `{ query: string, limit?: number }` and returns the
 * matching documents — pair it with the `useSearch` composable on the client.
 *
 * @example
 * ```ts
 * import { defineSearch } from 'nuxt-backend/convex/search'
 * import { query } from './_generated/server'
 *
 * export const searchMessages = defineSearch(query, {
 *   table: 'messages',
 *   index: 'search_text',
 *   searchField: 'text',
 * })
 * ```
 */
export function defineSearch<
  DM extends GenericDataModel,
  T extends TableNamesInDataModel<DM>,
  I extends IndexName<DM, T>,
>(
  query: QueryBuilder<DM, 'public'>,
  config: SearchConfig<DM, T, I>,
): RegisteredQuery<'public', { query: string, limit?: number }, Promise<Array<Doc<DM, T>>>> {
  return query({
    args: { query: v.string(), limit: v.optional(v.number()) },
    handler: (ctx, args) => {
      return search<DM, T>(ctx, config.table)
        .withSearchIndex(config.index)
        .search(config.searchField, args.query)
        .take(args.limit ?? config.defaultLimit ?? 20)
    },
  })
}
