import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Schema for the default plugins: passkey + emailOTP + admin + organization
// (+ convex plugin which pulls in jwt for Convex tokens + rateLimit).
// Core tables (user/session/account/verification) + passkey + rateLimit + jwks
// (required by jwt plugin used for Convex JWTs) + the admin plugin's role/ban
// fields and the organization plugin's workspace tables.
// No 2FA, no OAuth, no extra user fields (username/phone/anon/etc), no
// email/password specific beyond core account.
// For hybrid/local installs, users get only these tables (spread in their schema).
// Verified against `createSchema` from @convex-dev/better-auth with this plugin set.
// See: https://labs.convex.dev/better-auth/features/local-install
export const tables = {
  user: defineTable({
    name: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Admin plugin: app-wide role ('user' when unset) and ban state.
    role: v.optional(v.union(v.null(), v.string())),
    banned: v.optional(v.union(v.null(), v.boolean())),
    banReason: v.optional(v.union(v.null(), v.string())),
    banExpires: v.optional(v.union(v.null(), v.number())),
  })
    .index('email_name', ['email', 'name'])
    .index('name', ['name']),
  session: defineTable({
    expiresAt: v.number(),
    token: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    ipAddress: v.optional(v.union(v.null(), v.string())),
    userAgent: v.optional(v.union(v.null(), v.string())),
    userId: v.string(),
    // Admin plugin: who is impersonating this session, if anyone.
    impersonatedBy: v.optional(v.union(v.null(), v.string())),
    // Organization plugin: the session's active workspace.
    activeOrganizationId: v.optional(v.union(v.null(), v.string())),
  })
    .index('expiresAt', ['expiresAt'])
    .index('expiresAt_userId', ['expiresAt', 'userId'])
    .index('token', ['token'])
    .index('userId', ['userId']),
  account: defineTable({
    accountId: v.string(),
    providerId: v.string(),
    userId: v.string(),
    accessToken: v.optional(v.union(v.null(), v.string())),
    refreshToken: v.optional(v.union(v.null(), v.string())),
    idToken: v.optional(v.union(v.null(), v.string())),
    accessTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    refreshTokenExpiresAt: v.optional(v.union(v.null(), v.number())),
    scope: v.optional(v.union(v.null(), v.string())),
    password: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('accountId', ['accountId'])
    .index('accountId_providerId', ['accountId', 'providerId'])
    .index('providerId_userId', ['providerId', 'userId'])
    .index('userId', ['userId']),
  verification: defineTable({
    identifier: v.string(),
    value: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('expiresAt', ['expiresAt'])
    .index('identifier', ['identifier']),
  rateLimit: defineTable({
    key: v.string(),
    count: v.number(),
    lastRequest: v.number(),
  })
    .index('key', ['key']),
  // Passkey table (enabled by default in our wrapper via defaultPasskey plugin)
  passkey: defineTable({
    name: v.optional(v.union(v.null(), v.string())),
    publicKey: v.string(),
    userId: v.string(),
    credentialID: v.string(),
    counter: v.number(),
    deviceType: v.string(),
    backedUp: v.boolean(),
    transports: v.optional(v.union(v.null(), v.string())),
    createdAt: v.optional(v.union(v.null(), v.number())),
    aaguid: v.optional(v.union(v.null(), v.string())),
  })
    .index('credentialID', ['credentialID'])
    .index('userId', ['userId']),
  // JWKS table is required by the @convex-dev/better-auth convex plugin (always adds jwt plugin for Convex JWT issuance)
  jwks: defineTable({
    publicKey: v.string(),
    privateKey: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.union(v.null(), v.number())),
  }),
  // Organization plugin: workspaces, memberships, and invitations.
  organization: defineTable({
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.union(v.null(), v.string())),
    createdAt: v.number(),
    metadata: v.optional(v.union(v.null(), v.string())),
  })
    .index('name', ['name'])
    .index('slug', ['slug']),
  member: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    role: v.string(),
    createdAt: v.number(),
  })
    .index('organizationId', ['organizationId'])
    // Compound index beyond the generated set: serves the frequent
    // "membership of user X in workspace Y" lookup (requireMember).
    .index('organizationId_userId', ['organizationId', 'userId'])
    .index('userId', ['userId'])
    .index('role', ['role']),
  invitation: defineTable({
    organizationId: v.string(),
    email: v.string(),
    role: v.optional(v.union(v.null(), v.string())),
    status: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    inviterId: v.string(),
  })
    .index('organizationId', ['organizationId'])
    .index('email', ['email'])
    .index('role', ['role'])
    .index('status', ['status'])
    .index('inviterId', ['inviterId']),
}

/**
 * Billing entitlement cache — the current user's active plans, granted benefits
 * (feature-gating) and credit-meter balances, synced from Polar by `setupBilling`
 * (see `src/convex/integrations/billing.ts`) and served reactively to
 * `useFeatures()` / `useCredits()`.
 *
 * Kept inside this component so consumers add **nothing** to their own schema —
 * the same "ships out of the box" rationale as the nested Resend email. The
 * validators are shared with the component's billing functions (`billing.ts`) and
 * the app-level cache mutation, so the shape is defined once.
 *
 * Intentionally NOT part of the auth-only `tables` export above (which is spread
 * into consumer schemas for local installs) — billing data is the component's own.
 */
export const vEntitlementBenefit = v.object({
  id: v.string(),
  benefitId: v.string(),
  type: v.string(),
  // The benefit's live Polar metadata — lets consumers feature-gate by a friendly
  // key (`has('premium')`) instead of a UUID. Optional so pre-metadata rows validate.
  metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
})

export const vEntitlementMeter = v.object({
  meterId: v.string(),
  consumedUnits: v.number(),
  creditedUnits: v.number(),
  balance: v.number(),
})

export const billingTables = {
  billingEntitlements: defineTable({
    // The billing entity id — the workspace id (billTo: 'organization', the
    // default) or the auth user id (billTo: 'user'). Opaque string either way.
    userId: v.string(),
    customerId: v.optional(v.string()),
    activeProductIds: v.array(v.string()),
    benefits: v.array(vEntitlementBenefit),
    meters: v.array(vEntitlementMeter),
    updatedAt: v.number(),
  })
    .index('userId', ['userId'])
    .index('customerId', ['customerId']),
}

/** Auth-only schema — passed to Better Auth's `createApi` in `adapter.ts`. */
export const authSchema = defineSchema(tables)

/** Full component schema: auth tables + the billing cache. */
export default defineSchema({ ...tables, ...billingTables })
