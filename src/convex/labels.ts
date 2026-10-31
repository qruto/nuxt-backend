// Every string the package writes for people, as message templates keyed by
// name, in English: one module per group under label-groups/, gathered here.
// Runtime-neutral (no Vue, no Convex), so an email rendered in a Convex
// function and a page rendered in Vue read the same strings. The syntax is
// vue-i18n's (label-format.ts), so a label moves into an app's @nuxtjs/i18n
// messages unchanged. A packaged component renders no word that is not here:
// `test/unit/label-literals.test.ts` fails on one, and
// `test/unit/labels.test.ts` compiles every message the way vue-i18n does.
//
// The Vue runtime never imports this file: `useLabels(group)` reads the one
// group it names (src/runtime/vue/utils/label-registry.ts), so a page ships
// the words of the components it shows and no more. The emails read it whole.

import { type LabelTree, type Translate, translator } from './label-format.js'
import auth from './label-groups/auth.js'
import profile from './label-groups/profile.js'
import security from './label-groups/security.js'
import account from './label-groups/account.js'
import reauthenticate from './label-groups/reauthenticate.js'
import invitation from './label-groups/invitation.js'
import pricing from './label-groups/pricing.js'
import settings from './label-groups/settings.js'
import history from './label-groups/history.js'
import usage from './label-groups/usage.js'
import audit from './label-groups/audit.js'
import admin from './label-groups/admin.js'
import impersonation from './label-groups/impersonation.js'
import maintenance from './label-groups/maintenance.js'
import announcement from './label-groups/announcement.js'
import deletion from './label-groups/deletion.js'
import credits from './label-groups/credits.js'
import upgrade from './label-groups/upgrade.js'
import cancelFlow from './label-groups/cancelFlow.js'
import withdrawal from './label-groups/withdrawal.js'
import referral from './label-groups/referral.js'
import pastDue from './label-groups/pastDue.js'
import quota from './label-groups/quota.js'
import gift from './label-groups/gift.js'
import access from './label-groups/access.js'
import waitlist from './label-groups/waitlist.js'
import report from './label-groups/report.js'
import legal from './label-groups/legal.js'
import consent from './label-groups/consent.js'
import connection from './label-groups/connection.js'
import upload from './label-groups/upload.js'
import notifications from './label-groups/notifications.js'
import preferences from './label-groups/preferences.js'
import contact from './label-groups/contact.js'
import shell from './label-groups/shell.js'
import onboarding from './label-groups/onboarding.js'
import activation from './label-groups/activation.js'
import source from './label-groups/source.js'
import feedback from './label-groups/feedback.js'
import ai from './label-groups/ai.js'
import errors from './label-groups/errors.js'
import email from './label-groups/email.js'

export { findLabel, formatLabel, type LabelParams, type LabelTree, type Translate } from './label-format.js'

/**
 * A {@link Translate} over the English defaults. An unknown key comes back as
 * the key itself, the way vue-i18n shows a missing message.
 */
export function createTranslate(labels: LabelTree = LABELS): Translate {
  return translator(labels)
}

/**
 * The English defaults, by group: one group per packaged component (its page
 * reads the same group), plus `errors` and `email`. An app overrides a key
 * as `labels.<group>.<key>` in `appConfig.backend`, or translates it as the
 * `backend.<group>.<key>` message of `@nuxtjs/i18n`.
 */
export const LABELS = {
  auth,
  profile,
  security,
  account,
  reauthenticate,
  invitation,
  pricing,
  settings,
  history,
  usage,
  audit,
  admin,
  impersonation,
  maintenance,
  announcement,
  deletion,
  credits,
  upgrade,
  cancelFlow,
  withdrawal,
  referral,
  pastDue,
  quota,
  gift,
  access,
  waitlist,
  report,
  legal,
  consent,
  connection,
  upload,
  notifications,
  preferences,
  contact,
  shell,
  onboarding,
  activation,
  source,
  feedback,
  ai,
  errors,
  email,
} satisfies LabelTree

/** The English defaults' shape: every group and key the package renders. */
export type BackendLabels = typeof LABELS

/** One label group: a packaged component's, or `errors` or `email`. */
export type LabelGroup = keyof BackendLabels

/** A label tree with every key optional, as an app writes its overrides. */
export type LabelOverrides<T> = { [K in keyof T]?: T[K] extends string ? string : LabelOverrides<T[K]> }

/** One group's overrides, as a component's `labels` prop or `appConfig.backend.labels.<group>` takes them. */
export type LabelGroupOverrides<G extends LabelGroup> = LabelOverrides<BackendLabels[G]>

/** The dotted keys of a label tree: `passkeySignIn`, `trial.day`. */
export type LabelKey<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LabelKey<T[K]>}`
}[keyof T & string]
