import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { emailOTP } from 'better-auth/plugins'
import { createApi } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import type { RegisteredMutation, RegisteredQuery } from 'convex/server'
import { authSchema as schema } from './schema'

/**
 * Options used solely to derive the auth schema (via `getAuthTables`) for the
 * component adapter. Mirrors upstream @convex-dev/better-auth component/adapter
 * pattern (see their auth-options.ts + adapter.ts) but limited to plugins we
 * enable by default (convex + emailOTP + passkey) for minimal surface.
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

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(schema, () => options) as {
  create: RegisteredMutation<'public', Record<string, unknown>, Promise<unknown>>
  findOne: RegisteredQuery<'public', Record<string, unknown>, Promise<unknown>>
  findMany: RegisteredQuery<'public', Record<string, unknown>, Promise<unknown>>
  updateOne: RegisteredMutation<'public', Record<string, unknown>, Promise<unknown>>
  updateMany: RegisteredMutation<'public', Record<string, unknown>, Promise<unknown>>
  deleteOne: RegisteredMutation<'public', Record<string, unknown>, Promise<unknown>>
  deleteMany: RegisteredMutation<'public', Record<string, unknown>, Promise<unknown>>
}
