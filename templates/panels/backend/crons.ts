import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// The public demo starts each day clean: at 03:00 UTC every strip older
// than a day goes, with its files and its share link (demo.ts). Anywhere
// but a sandbox deployment the run does nothing.
crons.cron('reset the demo', '0 3 * * *', internal.demo.reset, {})

export default crons
