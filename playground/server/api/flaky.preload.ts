import { api } from '../../backend/_generated/api'

// Non-auth `preloadQuery`: runs a public query on the server and returns a
// Preloaded payload. The client hands it to `usePreloadedQuery` (the non-auth
// sibling of `usePreloadedAuthQuery`) to hydrate without a loading flash, then
// keeps it live over the WebSocket.
export default defineEventHandler(() =>
  preloadQuery(api.demo.flaky, { label: 'preloaded-on-server' }),
)
