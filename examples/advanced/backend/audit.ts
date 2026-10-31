import { setupAudit } from 'nuxt-backend/audit'
import { components } from './_generated/api'
import { notifications } from './notifications'

// The activity trail. Every sign-in and sign-out, passkey and email
// change, signed-out device, workspace invitation, membership and role
// change and administrator impersonation is recorded
// here and kept a year: your own on /security, the workspace's on
// /settings for its owners and admins, and every event for admins.
// Record your own under `app.`:
//   await audit.recordBackendEvent(ctx, { type: 'app.project_archived', targetId: project._id })
// Hear of every event in an internal action of yours, taking
// `{ event: vBackendEvent }`:
//   setupAudit(components, { notifications, onEvent: internal.audit.onEvent })
// The notifications instance lets an event of your own that notify names
// reach the inbox as it is recorded (notifications.ts).
export const audit = setupAudit(components, { notifications })

// The reads behind useAuditLog and <AuditLog>, and the activation checklist
// behind useActivation: declare one with defineActivation, then pass it as
// setupAudit(components, { checklist }). Without one it reads nothing.
// Name the event that says a person got value from the app, the growth
// funnel's activation, with setupAudit(components, { activation: 'app.project_published' });
// until you do, a person's first event of your own counts. getSource and
// recordSource are behind <HowDidYouHear> and the first-touch campaign.
export const { listActivity, listWorkspaceActivity, listAllActivity, getActivation, dismissActivation, getSource, recordSource } = audit.api
