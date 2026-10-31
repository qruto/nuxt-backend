// Session replay's integration, in a chunk of its own: ./observe.client.ts
// imports this file only once a visitor allows replay, so its recorder never
// reaches a page that does not record.
export { replayIntegration } from '@sentry/nuxt'
