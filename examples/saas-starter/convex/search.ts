// Type-safe full-text search over a Convex searchIndex. Add a search index to
// a table in your schema:
//   messages: defineTable({ text: v.string(), userId: v.string() })
//     .searchIndex('search_text', { searchField: 'text', filterFields: ['userId'] })
// then expose a search query and drive it from the client with `useSearch`:
//
// import { defineSearch } from 'nuxt-backend/convex/search'
// import { query } from './_generated/server'
//
// export const searchMessages = defineSearch(query, {
//   table: 'messages',
//   index: 'search_text',
//   searchField: 'text',
// })
export {}
