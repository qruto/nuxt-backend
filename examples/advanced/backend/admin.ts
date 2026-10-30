import { setupAdmin } from 'nuxt-backend/admin'
import { components } from './_generated/api'

// The admin console (/admin): every account and every workspace, for the
// app-wide admin role, read fresh on every call. Workspaces are read-only:
// an admin acts inside one only by impersonating a member, for thirty
// minutes at most, and an admin's own account is never impersonated.
// Make the first admin with `npx nuxt-backend doctor --fix`, which asks
// for your address.
const admin = setupAdmin(components)

// The reads behind useAdmin, <AdminUsers> and <AdminWorkspaces>, and the
// Analytics tab's growth funnel (getFunnel), counted inside the deployment.
export const { listUsers, getUser, listWorkspaces, getWorkspace, getFunnel } = admin.api
