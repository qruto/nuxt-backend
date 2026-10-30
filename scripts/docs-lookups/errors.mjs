/**
 * Reference › Backend › Errors: one entry per code of the error catalog
 * (BACKEND_ERRORS in src/convex/errors.ts), each at its own anchor, which
 * `/e/<code>` lands on. The data fields and the status come from the
 * catalog, the label from the `errors` label group; how to handle a code is
 * written here, and a code added to the catalog needs its line.
 */
import { BACKEND_ERRORS } from '../../src/convex/errors.ts'
import { LABELS } from '../../src/convex/labels.ts'
import { blocks, code, table } from './markdown.mjs'

/** What to do about each code, in one line. */
const HANDLING = {
  unauthenticated: 'Show the message. If nobody is signed in, send the person to sign in, then retry.',
  forbidden: 'Show the message; `reason` says what would change the answer.',
  reauthentication_required: 'Ask the person to sign in again, then retry: `useReauthentication().withReauthentication(action)` does both.',
  no_workspace: 'Offer the workspace switcher, or create one.',
  rate_limited: 'Wait `retryAfter`, then retry. `limit` names the spent limit.',
  insufficient_credits: 'Offer a credit pack or a plan with more credits.',
  feature_required: 'Offer the plans in `plans`: `<UpgradePrompt :plans>` links to the first on the pricing page.',
  quota_exceeded: 'Say how many are used of how many, and offer the plans in `plans`, or ask the person to remove one first.',
  invalid_input: 'Mark `field` and show the message.',
  not_ready: 'Don\'t offer a retry: something has to happen first. `reason` says what (below).',
  unavailable: 'Retry later only for `provider_refused`; the other reasons need the deployment fixed, and `reason` tells an operator what.',
}

/** What else a code's entry says, under its table. */
const NOTES = {
  unauthenticated: 'Better Auth answers some of its own refusals with 401 too, and the reader maps them here with Better Auth\'s message: a wrong password on a sign-in form, for one, where the person is already on the sign-in page and only needs the message.',
  reauthentication_required: 'A sensitive action, refused because the session\'s sign-in is older than it takes (ten minutes for the package\'s own): an auth route of the [sensitive-action table](/docs/build/auth/access/step-up#which-actions-ask), an admin write, or a function of yours with `recentSignIn` or `requireRecentSignIn`. Signing in again opens a new session; an agent\'s token and an administrator\'s visit never pass, and are refused as `forbidden` instead.',
  feature_required: 'Thrown by `billing.requireFeature` and the `withFeature` tier of `createFunctions` when the billing entity\'s plan does not grant the feature, read from the entitlement cache. `feature` is the catalog key asked for; `plans` the catalog keys of the plans on sale that include it, in pricing order, empty when none does. A caller who may not read the entity\'s billing at all is refused for that first. See [Feature gating](/docs/build/billing/subscriptions/feature-gating#the-refusal).',
  quota_exceeded: 'Experimental. Thrown by `billing.requireQuota`, and by `storage.store` and `storage.claim` for `setupStorage`\'s `quota` (`quota` is the catalog key, or `files` or `bytes` for a number), when `amount` more of the `quota` do not fit what the billing entity\'s plan allows: `limit` is the most any grant allows (`0` when none names the quota), `used` how many are counted, and `plans` the catalog keys of the plans on sale that allow `used + amount`, in pricing order, empty when none does. Nothing is counted for a refused call. See [Limit resources per plan](/docs/build/billing/subscriptions/quotas#the-refusal).',
  insufficient_credits: 'With both amounts, the label reads "Not enough credits: {balance} left, {need} needed. Top up to continue." (`errors.insufficient_credits_amounts`).',
  invalid_input: 'A checkout, a gift checkout, a plan change and the portal refuse what only the server may choose with this code: `productIds`, `productId` or `pack` outside the catalog (a plan change to a credit pack too), an `origin`, `successUrl` or `returnUrl` off the site, reserved `metadata` keys, a client\'s `trialInterval`, `trialIntervalCount` or `discountId`, a `trial` from server code that is not 1 to 30 days in days or weeks, a `discountCode` the provider does not accept, and a `discount` that names no catalog promotion a client may name (one with a code), applies to none of the checkout\'s products or is no longer redeemed (`field: \'discount\'`; `billing.applyDiscount` refuses the same way, and a checkout naming two discounts too). See [What the server decides](/docs/build/billing/subscriptions/checkout#what-the-server-decides). `billing.requireFeature` refuses an empty feature with it (`field: \'feature\'`), and `billing.requireQuota` and `releaseQuota` an empty quota (`field: \'quota\'`) or an `amount` that is not a whole number above zero (`field: \'amount\'`).',
}

/** The unit a field is counted in, where its name does not say. */
const UNITS = { retryAfter: 'ms' }

/** A code's data fields as the table shows them: `field?` when optional, with its unit. */
function fieldsOf(errorCode) {
  return Object.entries(BACKEND_ERRORS[errorCode].data.fields)
    .map(([name, validator]) => `${code(`${name}${validator.isOptional === 'optional' ? '?' : ''}`)}${UNITS[name] ? ` (${UNITS[name]})` : ''}`)
    .join(', ')
}

/** One entry per code: its data, label, status and handling, then its notes. */
export function errorCodes() {
  return blocks(Object.entries(BACKEND_ERRORS).map(([errorCode, entry]) => {
    const handling = HANDLING[errorCode]
    if (!handling) throw new Error(`error code ${errorCode} has no line in HANDLING (scripts/docs-lookups/errors.mjs)`)
    return blocks(
      `### \`${errorCode}\``,
      table(['Data', 'Label', 'Status', 'Handling'], [[fieldsOf(errorCode), LABELS.errors[errorCode], String(entry.status), handling]]),
      NOTES[errorCode],
    )
  }))
}

/** The codes in one table, for the cheat sheet. */
export function errorSummary() {
  return table(['Code', 'Status', 'Label'], Object.entries(BACKEND_ERRORS).map(([errorCode, entry]) => [
    `[${code(errorCode)}](/docs/reference/backend/errors#${errorCode})`,
    String(entry.status),
    LABELS.errors[errorCode],
  ]))
}
