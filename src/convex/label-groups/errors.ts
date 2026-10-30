import type { LabelTree } from '../label-format.js'

/**
 * What a person reads for each error code (`getBackendError(error).message`)
 * when the refusal carries no sentence of its own. Keyed by code;
 * `<code>_<reason>` is the sentence for one reason of a code, used over the
 * code's own.
 */
const ERROR_LABELS = {
  unauthenticated: 'Sign in to continue.',
  forbidden: 'You don\'t have access to this.',
  forbidden_banned: 'This account is banned.',
  forbidden_not_member: 'You\'re not a member of this workspace.',
  forbidden_not_billing_manager: 'Only the workspace\'s owner and admins manage its billing.',
  forbidden_impersonating: 'An administrator acting as this account can\'t do this.',
  forbidden_admin_target: 'An administrator\'s account can\'t be impersonated.',
  // A sandbox deployment (a public demo) admits only a passkey-only administrator.
  forbidden_passkey_only_admin: 'On this demo, administrators sign in with a passkey, on an account that signs in with passkeys only. Turn on passkey-only sign-in in your security settings, then sign in again with your passkey.',
  forbidden_sign_in_refused: 'Sign-in is by invitation right now.',
  forbidden_provider_owner_only: 'Only the workspace\'s owner opens its billing portal for now.',
  forbidden_too_many_attempts: 'Too many wrong codes. Ask for a new one.',
  forbidden_bot_check: 'We couldn\'t confirm you\'re a person. Try again.',
  forbidden_other_account: 'That sign-in belongs to another account. Confirm with this account\'s passkey or code.',
  forbidden_flag_off: 'This isn\'t available to you yet.',
  forbidden_passkey_required: 'Save a new passkey to finish signing in.',
  forbidden_invitation_refused: 'This invitation can\'t be sent.',
  forbidden_ticket_required: 'Signing up needs an invite right now.',
  forbidden_consent_required: 'Accept the updated terms to continue.',
  forbidden_age_required: 'Tell us how old you are to continue.',
  forbidden_under_age: 'We can\'t create an account for you.',
  forbidden_sole_owner: 'You\'re the only owner of a workspace others belong to. Make another member an owner first.',
  forbidden_paid_subscription: 'This workspace has a paid plan. Cancel it before you delete the workspace.',
  forbidden_cannot_share: 'You can\'t share this.',
  reauthentication_required: 'Confirm it\'s you to continue: this needs a recent sign-in.',
  no_workspace: 'Create or choose a workspace first.',
  rate_limited: 'Too many requests. Try again in a moment.',
  // The same refusal when the wait is known.
  rate_limited_for: 'Too many requests. Try again in {count} second. | Too many requests. Try again in {count} seconds.',
  // The job queue's daily budget, spent: it resets with its window.
  rate_limited_job_budget: 'You\'ve reached today\'s limit. Resets in {count} minute. | You\'ve reached today\'s limit. Resets in {count} minutes.',
  insufficient_credits: 'Not enough credits. Top up to continue.',
  // The same refusal when both amounts are known.
  insufficient_credits_amounts: 'Not enough credits: {balance} left, {need} needed. Top up to continue.',
  feature_required: 'Your plan doesn\'t include this. Upgrade to use it.',
  quota_exceeded: 'Your plan\'s limit is reached. Upgrade for more.',
  invalid_input: 'That input isn\'t valid. Check it and try again.',
  // `invalid_input_<field>`: the sentence for one field, used over the code's own;
  // `invalid_input_<reason>` for one reason, used over both.
  invalid_input_email: 'Enter a valid email address.',
  invalid_input_required: 'Fill in this field.',
  invalid_input_too_short: 'That message is too short. Write at least 10 characters.',
  invalid_input_too_long: 'That is too long. Keep a message to 2,000 characters and a name to 100.',
  invalid_input_sessionId: 'That session has already ended.',
  invalid_input_otp: 'That code isn\'t right. Check it, or ask for a new one.',
  invalid_input_otp_expired: 'That code has expired. Ask for a new one.',
  invalid_input_other_browser: 'This code works only in the browser where you asked for it.',
  invalid_input_inviteCode: 'That invite code doesn\'t work. Check it and try again.',
  invalid_input_age: 'Enter your age as a number.',
  invalid_input_invite_expired: 'That invite code has expired.',
  invalid_input_invite_used_up: 'That invite code has been used up.',
  invalid_input_invite_revoked: 'That invite code is no longer valid.',
  invalid_input_recoveryCode: 'That recovery code isn\'t right, or it was used already.',
  invalid_input_passkeys: 'A passkey-only account needs a passkey. Add one, or allow sign-in codes again first.',
  invalid_input_slug: 'That name is taken. Try another one.',
  invalid_input_passkey: 'That passkey didn\'t work. Try again, or continue with an email code.',
  invalid_input_passkey_cancelled: 'The passkey prompt was closed. Try again, or continue with an email code.',
  invalid_input_no_password: 'This app signs in with codes and passkeys: there is no password to reset.',
  invalid_input_comment: 'That comment is too long. Keep it to 500 characters.',
  // A plan's lifecycle with nothing to act on: what the subscription already is.
  invalid_input_cancel_scheduled: 'This plan is already set to cancel at the end of its period.',
  invalid_input_no_cancel_scheduled: 'This plan isn\'t set to cancel, so there is nothing to undo.',
  invalid_input_withdrawal_closed: 'No purchase is inside its withdrawal period any more, so there is nothing to withdraw from.',
  invalid_input_retired: 'That plan is no longer offered. Pick another one.',
  invalid_input_free_plan: 'The free plan stays until a paid plan replaces it. Choose a plan to upgrade.',
  invalid_input_currency: 'Prices aren\'t offered in that currency. Pick another one.',
  invalid_input_no_change_scheduled: 'No plan change is scheduled, so there is nothing to undo.',
  invalid_input_confirmation: 'Type your email address exactly as it is shown to confirm.',
  invalid_input_has_account: 'This address belongs to an account. Delete the account instead.',
  // A file storage refused: `invalid_input` on `file`, and why.
  invalid_input_file: 'That file can\'t be kept. Try another one.',
  // A job the queue refused: bigger than any budget, or content a model refused.
  invalid_input_over_budget: 'This is bigger than any plan allows in a day. Make it smaller.',
  invalid_input_content_blocked: 'This content isn\'t allowed here. Try something else.',
  invalid_input_too_large: 'That file is too large. Pick a smaller one.',
  invalid_input_unsupported_type: 'That type of file isn\'t accepted. Pick another one.',
  invalid_input_upload_gone: 'That upload is gone. Upload the file again.',
  invalid_input_upload_claimed: 'That upload was already used. Upload the file again.',
  // An appeal of a decision on reported content that the decision no longer takes.
  invalid_input_appeal_expired: 'This decision can no longer be appealed.',
  invalid_input_appealed_already: 'This decision was appealed already.',
  invalid_input_removed_copy: 'This file was removed from the app and can\'t be uploaded again.',
  not_ready: 'Nothing to show yet.',
  not_ready_no_customer: 'Nothing to show yet — this opens after your first purchase.',
  not_ready_no_catalog: 'Nothing to buy yet — this app has no plans or packs set up.',
  not_ready_not_synced: 'Nothing to show yet — no credits have reached this account. Open billing to refresh, or get a credit pack.',
  // A demo or staging app (BACKEND_ENVIRONMENT=sandbox) makes no model call without a daily AI spend limit.
  not_ready_no_budget: 'AI is turned off in this demo for now.',
  // A demo or staging app (BACKEND_ENVIRONMENT=sandbox) refuses what would reach a provider for real.
  not_ready_sandbox: 'This app is a demo, so this is turned off here.',
  // A preview, or a deployment whose BACKEND_ENVIRONMENT is unset or mistyped, refuses the same.
  not_ready_environment: 'This is turned off on this deployment.',
  // A provider's refusal may pass on a retry; the other reasons need the deployment fixed.
  unavailable: 'This isn\'t available right now. Try again shortly.',
  unavailable_not_configured: 'This isn\'t set up on this app yet.',
  unavailable_test_mode: 'This app is in test mode and only emails test addresses, so this address can\'t receive mail here.',
  unavailable_unconfigured: 'This app can\'t send email yet.',
  unavailable_suppressed: 'We can\'t send email to this address right now. Use another address, or contact us for help.',
  // A kill switch is on: `unavailable_<service>_paused`.
  unavailable_signups_paused: 'New sign-ups are paused for now. Try again later.',
  unavailable_checkout_paused: 'Purchases are paused for now. Try again later.',
  unavailable_ai_paused: 'AI features are paused for now. Try again later.',
  // A job that failed: a model kept failing, the job went silent, or the app's code threw.
  unavailable_stalled: 'This job stopped responding. Your credits were refunded.',
  unavailable_job_failed: 'This job failed. Your credits were refunded.',
  // Never thrown: a composable's reading of a failure without a code (a crash, an app's own error).
  unavailable_unexpected: 'Something went wrong.',
} satisfies LabelTree

export default ERROR_LABELS
