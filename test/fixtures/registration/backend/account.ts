/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Verbatim copy of templates/starter/backend, present so the scaffolder finds
// every default file in place. Never built or typechecked (no codegen here).
import { setupAccount } from 'nuxt-backend/account'
import { components } from './_generated/api'
import { audit } from './audit'
import { billing } from './billing'
import { email } from './email'
import { paths } from './paths.generated'

// Export and deletion of an account. /security offers both: the export, one
// JSON file behind a link that expires within the hour, with the account's
// files as zip parts beside it, and a deletion the person confirms by typing
// their address. It waits out a grace period (graceMs, 30 days unless you
// say otherwise) the person can cancel, with a link in an email, then erases
// them everywhere: the backend's tables, the files, the billing customer and
// the email contact. Your own tables join through
// `sources`, each with an internal query that exports an account's rows
// and an internal mutation that erases a batch of them:
//   sources: { todos: { description: 'To-dos', export: internal.todos.exportFor, forget: internal.todos.forgetFor } }
// `paths` carries the keep-account page's path from nuxt.config, for the
// link in the deletion email.
export const account = setupAccount(components, { audit, billing, email, paths })

// The export behind useAccount and <AccountData>, and the providers'
// and your sources' part of an erasure, which it runs by this name.
export const {
  exportAccountData,
  getAccountExport,
  eraseAccountData,
  getAccountDeletion,
  cancelAccountDeletion,
  getConsents,
  getConsentTerms,
  grantConsent,
  withdrawConsent,
  chooseStorage,
  getOnboarding,
  completeOnboarding,
} = account.api
