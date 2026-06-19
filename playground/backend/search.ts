import { defineSearch } from 'nuxt-backend/convex/search'
import { query } from './_generated/server'

// Type-safe full-text search over the messages `search_text` index. Drive it
// from the client with `useSearch(api.search.searchMessages, term)`.
export const searchMessages = defineSearch(query, {
  table: 'messages',
  index: 'search_text',
  searchField: 'text',
})
