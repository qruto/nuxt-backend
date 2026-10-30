import { passkey } from '@better-auth/passkey'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { admin, emailOTP, lastLoginMethod, organization } from 'better-auth/plugins'
import { createApi } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import type { RegisteredMutation, RegisteredQuery } from 'convex/server'
import { ACCOUNT_FIELDS, PASSKEY_ONLY_PLUGIN, SESSION_FIELDS } from '../../client/plugins.js'
import { SECRET_ROTATION_PLUGIN_ID } from '../../client/secret-rotation.js'
import { authSchema as schema } from './schema.js'

/**
 * Options used solely to derive the auth schema (via `getAuthTables`) for the
 * component adapter. Mirrors upstream @convex-dev/better-auth component/adapter
 * pattern (see their auth-options.ts + adapter.ts) but limited to plugins we
 * enable by default (convex + emailOTP + passkey + lastLoginMethod + admin +
 * organization + passkey-only + the secret rotation) for minimal surface. ⚠ Keep this
 * plugin set aligned with the default set `buildAuthOptions` builds
 * (src/convex/client/better-auth-options.ts) —
 * a plugin enabled there but missing here leaves its tables out of the
 * adapter's derived schema.
 */
const options: BetterAuthOptions = {
  rateLimit: { storage: 'database' },
  // The account fields the package adds (`user.locale`).
  user: { additionalFields: ACCOUNT_FIELDS },
  // The session fields the package adds (`session.signInMethod`).
  session: { additionalFields: SESSION_FIELDS },
  plugins: [
    convex({
      authConfig: { providers: [{ applicationID: 'convex', domain: '' }] },
    }),
    emailOTP({ sendVerificationOTP: async () => {} }),
    passkey(),
    // The account's `lastLoginMethod` field.
    lastLoginMethod({ storeInDatabase: true }),
    admin(),
    organization(),
    // Passkey-only accounts: the account's switch and recovery code, the recovery session's mark.
    { id: PASSKEY_ONLY_PLUGIN.id, schema: PASSKEY_ONLY_PLUGIN.schema },
    // The AUTH_SECRET rotation's cookie re-signing: no tables.
    { id: SECRET_ROTATION_PLUGIN_ID },
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
