import { setupAdmin } from 'nuxt-backend/admin'
import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import { email } from './email'
import { routes } from './routes'

// The admin console (/admin): every account and every workspace, for the
// app-wide admin role, read fresh on every call. Workspaces are read-only:
// an admin acts inside one only by impersonating a member, for thirty
// minutes at most, and an admin's own account is never impersonated.
// Make the first admin with `npx nuxt-backend doctor --fix`, which asks
// for your address.
//
// `reports` turns on the Reports tab: how to describe a reported strip, and
// how to hide one. The emails a decision sends go through `email`, and the
// DataModel types the reported row: checking `table` narrows `id` to it.
export const admin = setupAdmin<DataModel>(components, {
  email,
  reports: {
    describe: async (ctx, { table, id }) => {
      if (table !== 'strips') return null
      const strip = await ctx.db.get('strips', id)
      return strip && { title: strip.idea, url: routes.strip(id), authorId: strip.authorId, files: strip.photoId ? [strip.photoId] : [] }
    },
    hide: async (ctx, { table, id }) => {
      if (table === 'strips') await ctx.db.patch('strips', id, { hidden: true })
    },
  },
})

// The reads behind useAdmin, <AdminUsers> and <AdminWorkspaces>, the
// Analytics tab's growth funnel (getFunnel), and the report functions:
// the report button, the public notice form, the Reports tab and appeals.
export const {
  listUsers, getUser, listWorkspaces, getWorkspace, getFunnel,
  reportContent, sendNotice, getAppeal, appealDecision,
  getReports, decideReport, flagCrime, decideAppeal,
} = admin.api
