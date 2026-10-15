/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
import { setupEmail } from 'nuxt-backend/email'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { internalAction } from './_generated/server'
import { admin } from './functions'

// Transactional + marketing email over the backend component's email module.
// Delivery uses the EMAIL_* env vars (optional — sends no-op until
// EMAIL_API_KEY is set). React to delivery events with
// `setupEmail(components, { events: { 'email.bounced': async (ctx, event) => { ... } } })`.
export const email = setupEmail(components)

// Reactive delivery-status query behind the `useEmailStatus` composable.
export const { getEmailStatus } = email.api

// Send a transactional email from your own server code: another action, a
// scheduled function, or `npx convex run email:send`. Internal on purpose —
// a public action that takes the recipient is an open relay on your verified
// domain for anyone who can sign in. The same transport powers auth OTP /
// verification / welcome / invitation email.
export const send = internalAction({
  args: { to: v.string(), subject: v.string(), html: v.optional(v.string()), text: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => email.send(ctx, args),
})

// A send to any address from an admin screen: the `admin.action` builder
// (./functions) refuses everyone without the app-wide admin role. Plain text,
// so nothing typed into the form is rendered as markup.
export const sendAsAdmin = admin.action({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => email.send(ctx, args),
})

// Marketing (segments / contacts / broadcasts) via the provider SDK. These
// are privileged — a public action would be an open spam/phishing relay on
// your verified domain — so they ship as internalActions: run them from ops
// or your own server code. To expose one to an admin UI, re-declare it with
// the `admin.action` builder from ./functions instead of internalAction.
export const createSegment = internalAction({
  args: { name: v.string() },
  handler: async (ctx, { name }) => email.segments.create({ name }),
})
export const addContact = internalAction({
  args: { segmentId: v.string(), email: v.string(), firstName: v.optional(v.string()), lastName: v.optional(v.string()) },
  handler: async (ctx, { segmentId, ...contact }) => email.contacts.add({ ...contact, segments: [{ id: segmentId }] }),
})
export const createBroadcast = internalAction({
  args: { segmentId: v.string(), from: v.string(), subject: v.string(), html: v.string() },
  handler: async (ctx, args) => email.broadcasts.create(args),
})
export const sendBroadcast = internalAction({
  args: { broadcastId: v.string() },
  handler: async (ctx, { broadcastId }) => email.broadcasts.send(broadcastId),
})
