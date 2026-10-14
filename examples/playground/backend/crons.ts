import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

// Retention for the public playground: nothing a visitor leaves behind
// outlives a week, an upload nobody saved goes within a day, and a sandbox
// account idle for a week loses its app data (retention.ts).
const crons = cronJobs()

crons.daily('prune emails', { hourUTC: 3, minuteUTC: 0 }, internal.email.pruneEmails, {})
crons.daily('prune webhook feed', { hourUTC: 3, minuteUTC: 10 }, internal.billing.pruneWebhookEvents, {})
crons.daily('remove orphan uploads', { hourUTC: 3, minuteUTC: 20 }, internal.files.cleanupOrphanUploads, {
  paginationOpts: { numItems: 100, cursor: null },
})
crons.daily('clear idle accounts', { hourUTC: 3, minuteUTC: 30 }, internal.retention.clearIdleAccounts, {
  paginationOpts: { numItems: 100, cursor: null },
})

export default crons
