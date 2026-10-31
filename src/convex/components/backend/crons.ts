import { cronJobs } from 'convex/server'
import { internal } from './_generated/api.js'
import { ALERTS_JOB } from './alerts.js'
import { MAINTENANCE_INTERVAL_MS, MAINTENANCE_JOB } from './maintenance.js'

// The component's own schedule: it runs wherever the component is mounted,
// so an app never schedules the backend's housekeeping itself. Each pass is
// batched and resumes itself (maintenance.ts), and checks in to its monitor
// once its last task finishes (monitoring.ts).
const crons = cronJobs()

crons.interval(MAINTENANCE_JOB, { minutes: MAINTENANCE_INTERVAL_MS / 60_000 }, internal.maintenance.run, {})
// The job queue's sweep: a stalled job failed, a waiting one started. A read and nothing more without a queue.
crons.interval('job queue sweep', { minutes: 1 }, internal.jobs.sweep, {})
// Lifecycle email: the flows' steps that came due. A read and nothing more without a flow.
crons.interval('lifecycle email', { minutes: 5 }, internal.lifecycle.sweep, {})
// The alerts: the email quota and the day's AI spend, on a deployment that checks in. A read and nothing more elsewhere.
crons.interval(ALERTS_JOB, { hours: 1 }, internal.alerts.check, {})

// Gifts: a delivery dated for now, the week's reminder and the steps of every plan pass. A read and nothing more without a gift sold.
crons.interval('gift sweep', { hours: 1 }, internal.gifts.sweep, {})

// Referrals: the rewards whose hold has ended. A read and nothing more without a program.
crons.interval('referral sweep', { hours: 1 }, internal.referrals.sweep, {})

export default crons
