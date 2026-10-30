import { defineJobQueue } from 'nuxt-backend/ai'
import { MINUTE } from 'nuxt-backend/rate-limit'
import { components } from './_generated/api'
import { ai } from './ai'

// The generation queue. Each job runs on Convex's Workflow component, so a
// deploy or a restart picks it up after its last finished step.
// - `perOwner: 1` lets each workspace draw one strip at a time.
// - `tiers` gives a workspace whose plan has `priority_queue` (Studio) a
//   ten-minute head start.
// - `models` sets where the image model's limit starts: the queue halves it
//   on a 429 and grows it back on success.
export const jobs = defineJobQueue(components, {
  ai,
  perOwner: 1,
  tiers: {
    priority: { feature: 'priority_queue', headStart: 10 * MINUTE },
    standard: {},
  },
  models: {
    'google/gemini-2.5-flash-image': { perMinute: 10 },
  },
})

// The functions behind useJob() and the admin console's Queue tab.
export const { getJob, cancelJob, getQueue, listJobs, setQueue, retryJob, discardJob, runQueue, billJob } = jobs.api
