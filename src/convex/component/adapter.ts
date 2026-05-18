import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { emailOTP } from 'better-auth/plugins'
import { createApi } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import type { RegisteredMutation, RegisteredQuery } from 'convex/server'
import schema from './schema'

/**
 * Options used solely to derive the auth schema (via `getAuthTables`) for the
 * component adapter. Must include every plugin that contributes tables to our
 * local `schema` (e.g. passkey).
 */
const options: BetterAuthOptions = {
  rateLimit: { storage: 'database' },
  plugins: [
    convex({
      authConfig: { providers: [{ applicationID: 'convex', domain: '' }] },
    }),
    emailOTP({ sendVerificationOTP: async () => {} }),
    passkey(),
  ],
}

const api = createApi(schema, () => options)

// Use loose explicit type annotations so emitted declarations don't reference
// the upstream package's internal `_generated/dataModel` (which breaks
// portability). Runtime validators come from `createApi` itself.
type AnyMutation = RegisteredMutation<'public', Record<string, unknown>, Promise<unknown>>
type AnyQuery = RegisteredQuery<'public', Record<string, unknown>, Promise<unknown>>

export const create: AnyMutation = api.create as unknown as AnyMutation
export const findOne: AnyQuery = api.findOne as unknown as AnyQuery
export const findMany: AnyQuery = api.findMany as unknown as AnyQuery
export const updateOne: AnyMutation = api.updateOne as unknown as AnyMutation
export const updateMany: AnyMutation = api.updateMany as unknown as AnyMutation
export const deleteOne: AnyMutation = api.deleteOne as unknown as AnyMutation
export const deleteMany: AnyMutation = api.deleteMany as unknown as AnyMutation
