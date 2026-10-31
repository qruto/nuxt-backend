/**
 * The one way this package writes to a deployment's logs. Every line reads
 * `[nuxt-backend] <code>: <message>` with a stable dotted code, so a log
 * search finds each occurrence and the Troubleshooting page explains it.
 *
 * Convex keeps logs, so a message never carries an address, a name, a subject
 * line or a credential. The one exception is `auth.otp_echo`, the sign-in
 * code a deployment opts into echoing for local development
 * (a `development` `BACKEND_ENVIRONMENT`). test/unit/log-redaction.test.ts holds every call
 * to that rule and every code to a Troubleshooting entry.
 *
 * @internal
 */
export const LOG_CODES = {
  'auth.otp_echo': 'A sign-in code, echoed because BACKEND_ENVIRONMENT is development.',
  'email.skipped_no_api_key': 'An email was not sent: EMAIL_API_KEY is not set on the deployment.',
  'auth.email_change_notice_unsent': 'The old address was not told of an email change; the change itself went through.',
  'auth.recovery_notice_unsent': 'A passkey-only account was recovered with its recovery code, and the email telling it so was not sent.',
  'auth.passkey_only_notice_unsent': 'A sign-in code was asked for a passkey-only account, and the email saying it signs in with a passkey was not sent.',
  'auth.welcome_unsent': 'A new account\'s welcome email was not sent; the account was created and onUserCreated still ran.',
  'consent.event_unrecorded': 'A consent decision was recorded on the ledger, but its consent.granted or consent.withdrawn event did not reach the activity trail; the decision stands.',
  'consent.signup_unrecorded': 'A new account was created, but what it agreed to at sign-up (the required consents, the age check) was not recorded on the ledger; the account stands and <ConsentPrompt> asks for the missing consents on its next page.',
  'consent.under_age_cookie_unset': 'An age under the minimum was refused, but the browser could not be told to remember the refusal for a day; the refusal stands.',
  'access.invitation_unsent': 'An invitation by address was made with "Email them", but its email was not sent (the provider refused it, or the address cannot receive mail here); the invitation stands.',
  'access.ticket_unrecorded': 'A new account signed up with a ticket while the app was closed, and the ticket was not recorded against it (the ledger row or the access.ticket_used event); the account was created.',
  'waitlist.mirror_drift': 'A launch-news contact could not be written to the email provider after its retries; its waitlist entry is flagged and the next maintenance pass tries again.',
  'waitlist.admitted_unsent': 'A waitlist entry was admitted, but its "You\'re in" email was not sent; the ticket stands.',
  'waitlist.confirmation_unsent': 'A new waitlist entry was recorded, but its confirmation email (the status link) or its join event was not sent; the entry stands.',
  'waitlist.caps_unread': 'The Waitlist tab could not read the sign-in code budget or the email provider\'s usage; the tab shows it as not known.',
  'email.inbound_rejected': 'Inbound mail was dropped before it reached the app\'s hooks. The `reason` says why: `dmarc` (the sender failed DMARC, or a reply\'s sender did not pass it), `rate_limited` (past the inbound rate limit), `sender_mismatch` (a reply address answered by someone else) or `unknown_recipient` (no reply address, workspace or support address claims it).',
  'email.contact_held': 'A contact message was stored but not sent to the team: EMAIL_API_KEY is not set, or the deployment is in test mode and the address is not one of the provider\'s test addresses. It stays in the admin console\'s Inbox tab.',
  'email.contact_failed': 'A contact message was stored, but the email provider refused to queue its copy for the team. It stays in the admin console\'s Inbox tab, marked failed.',
  'email.inbox_unread': 'The support inbox, or a received email, could not be read from the email provider (a missing key, a refusal, a message already gone): the inbound message was stored with what the event carried, or not at all.',
  'email.undeliverable': 'A one-time code or an invitation was refused on the request: its email would not arrive (no EMAIL_API_KEY, test mode, or no EMAIL_FROM).',
  'email.locale_unread': 'The language of the account an email was sent to or on behalf of could not be read, so the email went in the next language known (the default locale at last).',
  'email.skipped_unsubscribed': 'An email under a topic was not sent: its recipient is not in the topic (they left it, never joined it, or have not confirmed a double opt-in).',
  'email.skipped_capped': 'A non-transactional email was not sent: its recipient reached the weekly cap (`setupEmail({ caps: { perWeek } })`).',
  'email.skipped_sunset': 'A non-transactional email was not sent: its recipient has not clicked an email or used the app for `sunsetAfterDays` (180 by default).',
  'email.preferences_unsynced': 'A contact\'s topic choices did not reach the email provider after a few tries; the deployment\'s copy holds them, and the next change writes them again. Or an account\'s old address, after it changed, could not be removed from the provider\'s contacts.',
  'email.lifecycle_unstarted': 'A new account\'s sign-up did not reach the lifecycle flows (setupEmail({ lifecycle })): none of the sign-up flows started for it, and the packaged welcome email went instead.',
  'email.lifecycle_failed': 'A billing event did not reach the lifecycle flows (it starts or stops them); the event is recorded, and the flows it would have started do not run for it.',
  'email.event_unsent': 'An event (a lifecycle flow\'s, or one `email.automations.track` sent) failed at the email provider: refused, still rate-limited after a few tries, or its answer lost. It is not sent again, so the automation listening for it starts at most once, and may not have started.',
  'email.suppression_refused': 'The email provider refused to lift a suppression from the admin console: the key may be restricted to sending, which cannot call its suppressions API. The provider\'s words are in the log.',
  'webhook.replay_refused': 'A provider refused to send a webhook delivery again from the admin console or DevTools; the administrator sees the refusal, and the provider\'s words are in the log.',
  'auth.new_device_unrecorded': 'A sign-in\'s device could not be checked against the account\'s known devices; the sign-in went through, and no new-device alert was recorded for it.',
  'auth.new_device_choice_unread': 'Whether a person turned the new-device email off could not be read; the sign-in went through, and the email went out.',
  'auth.new_device_unsent': 'A new-device alert email was not sent; the sign-in went through, and the alert is in the app and on the activity trail.',
  'email.announcement_refused': 'The email provider refused to create, send or cancel an announcement\'s broadcast; the administrator sees the refusal, and the provider\'s words are in the log.',
  'email.secret_failed': 'A secret email (a sign-in code) was not delivered: the provider refused it, it kept failing until its code expired, or it was never sent. It leaves no record.',
  'maintenance.task_failed': 'A maintenance task failed, or could not delete one row: the row is skipped, or the task\'s pass ends and the next one, an hour later, tries again.',
  'retention.batch_failed': 'A defineRetention batch threw (in onDelete or the delete) and rolled back: its pass ends, and the next one retries from the same oldest rows.',
  'webhook.secret_missing': 'A webhook route is mounted but its secret is not set, so every delivery is refused with 503.',
  'webhook.log_write_failed': 'A webhook delivery was handled but its row in the delivery log could not be written.',
  'webhook.rejected': 'A webhook route refused a delivery before running anything: over the size cap (413), a bad signature (403) or no secret on the backend component (503). Once per isolate for each route and outcome.',
  'billing.provider_failed': 'The billing provider refused a request; the caller sees "Billing is temporarily unavailable".',
  'billing.revenue_metrics_missing': 'The billing provider failed on some revenue metrics or a meter\'s usage: the Revenue view shows the rest, those empty.',
  'billing.trusted_origin_invalid': 'A setupBilling trustedOrigins entry is no http(s) origin, so it trusts nothing.',
  'billing.gift_unverified': 'A paid order named a gift it did not buy or claim (another product, customer, price or discount), so the gift was left as it was.',
  'billing.gift_claim_not_free': 'A gift claim checkout was not free, so the package did not confirm it and refused the claim.',
  'billing.gift_claim_hosted': 'A gift claim needs the provider\'s checkout to finish, because the pack asks for checkout fields; the recipient gets its $0 checkout.',
  'billing.gift_refunded_after_claim': 'A gift purchase was refunded after its recipient claimed it, or while the claim was under way; the credits stay with them.',
  'billing.gift_over_limit': 'A gift was paid past its purchaser\'s gift limit, so it was refunded instead of delivered.',
  'billing.gift_over_address_limit': 'A gift was paid past its recipient address\'s daily limit of five, so it was refunded instead of delivered.',
  'billing.gift_sweep_unregistered': 'The gift sweep could not be registered with the component, so a gift dated for later is delivered by its scheduled function only.',
  'billing.referral_step_failed': 'The referral program could not act on an order delivery (start a hold, or void a referral); the delivery itself was accepted, and the sweep checks the order again at the end of the hold.',
  'referrals.sweep_unregistered': 'The referral sweep could not be registered with the component, so no reward is granted when a hold ends.',
  'referrals.reward_unavailable': 'The referral program names a reward the catalog cannot back (a discount it does not have or that has a code, a pack it does not sell), so that side gets no reward until the catalog does.',
  'referrals.reward_failed': 'A referrer\'s reward could not be granted (its checkout was not free, or the pack asks for checkout fields); the sweep tries it again.',
  'referrals.sweep_task_failed': 'One reward of the referral sweep failed; the next sweep tries it again.',
  'billing.gift_sweep_task_failed': 'One step of the gift sweep (a delivery, the reminder or a plan pass step) failed; the next sweep tries it again.',
  'billing.lifecycle_step_failed': 'The billing lifecycle could not act on a webhook delivery (a consent proof, a renewal reminder, an abandoned checkout); the delivery itself was accepted.',
  'billing.withdrawal_receipt_failed': 'An EU withdrawal went through at the provider, but its receipt email could not be sent; the activity trail holds its date and time.',
  'billing.consent_unrecorded': 'A renewing checkout was created, but the proof of its renewal consent could not be kept.',
  'billing.reverse_trial_failed': 'A new workspace stayed on the free plan: its reverse trial could not start.',
  'billing.pass_period_unaligned': 'A claimed plan pass kept the provider\'s billing period instead of starting its first month at the claim; its end date still holds, enforced by the sweep.',
  'billing.pass_claim_unrecorded': 'A plan pass\'s start did not finish, and its subscription could not be switched back to the free plan: it is on the pass product with nothing following it.',
  'billing.gift_claimed_after_refund': 'A gift was claimed after its purchase was refunded: the recipient holds credits nobody paid for.',
  'billing.checkout_discount_dropped': 'The provider no longer redeems the discount setupBilling\'s checkoutDiscount picked (it ended, is used up, or the customer redeemed it already), so the checkout opened again at the regular price.',
  'billing.subscription_change_unrecorded': 'A subscription change went through at the provider, but its scheduled plan change or resume date could not be kept; the next subscription webhook records it.',
  'billing.product_resync_failed': 'A benefit changed at the provider but the products table could not be re-synced; pricing shows the old figures until the next product event. The delivery itself was handled.',
  'billing.free_plan_unqueued': 'A new workspace (or account, with billTo: \'user\') could not be queued for the free plan; it was created all the same.',
  'billing.free_plan_customer_taken': 'An account (billTo: \'user\') was not put on the free plan: its email belongs to another account\'s customer at the provider, which keeps individual customers\' emails unique.',
  'billing.customer_mapping_shared': 'A billing entity is mapped onto a customer keyed to another entity, from before 0.2; it is refused until the deployment\'s billing data is reset.',
  'protection.refused': 'A request or call behind the bot check carried no proof or challenge answer that passed, and was refused as forbidden (bot_check).',
  'protection.challenge_unavailable': 'The challenge provider could not be reached to verify an answer, so the request or call was refused.',
  'ai.cost_over_reservation': 'A metered action finished above the credits it reserved, or its finalized cost was not an amount; the reservation was charged.',
  'ai.cost_unreported': 'A model call reported no cost (no price covers its model, or its stream never reached its end), so the run was charged the credits it reserved.',
  'ai.convex_gateway_unavailable': 'The Convex AI Gateway cannot be used on this deployment (a free plan, an anonymous local deployment, or no @convex-dev/ai-sdk-provider installed), so model ids went to the next route: the Vercel AI Gateway with AI_GATEWAY_API_KEY, or a refusal. Once per isolate.',
  'ai.region_mismatch': 'A model call made under setupAi({ inferenceRegion }) reported, in its gateway routing metadata, a provider endpoint outside the pinned region.',
  'ai.chat_reply_failed': 'A chat reply failed (the model refused it, or every call it made failed); the reply reads failed in the thread and its reservation was released.',
  'ai.knowledge_embed_failed': 'A knowledge document could not be embedded (the model refused it, or an upload was no plain text or Markdown file); the document reads failed and its reservation was released.',
  'ai.model_failed': 'Every model call a run made failed though its handler returned, so the run was refused and its reservation released.',
  'ai.balance_hook_failed': 'An onCreditsLow or onCreditsExhausted hook threw; the spend itself settled.',
  'ai.reservation_close_failed': 'A spend was recorded at the provider but its reservation could not be closed; the balance re-syncs on the next refresh.',
  'ai.stream_release_unscheduled': 'The release timer for a stream\'s reservation could not be scheduled; the pending-spend TTL releases it instead.',
  'ai.stream_spend_lost': 'A stream was delivered but its spend never reached the provider; the reservation was released.',
  'ai.job_step_failed': 'An attempt of a job\'s step failed: throttled or passing ones are tried again, the rest fail the job.',
  'ai.job_failed': 'A job failed with an error that is not a catalog one: it was refunded and kept in the dead letters.',
  'ai.job_stalled': 'A running job showed no sign of life for its stallAfter: it was failed and refunded.',
  'ai.job_cancel_failed': 'A stalled job\'s workflow could not be canceled; the job is already failed and refunded.',
  'ai.job_refund_retry': 'A failed job\'s refund did not reach the billing provider; it is tried again, later each time.',
  'ai.job_refund_failed': 'A failed job\'s refund failed every try: its credits are still owed, and an administrator\'s retry runs the job on the charge it paid.',
  'ai.guest_claim_failed': 'A visitor\'s guest jobs were not moved to the account that signed up in their browser (no workspace a minute on, or the app\'s setupAi({ guest: { claim } }) mutation threw): the jobs still run, and the app\'s rows stay where they were.',
  'ai.job_cost_unreported': 'A finished job\'s cost could not be sent to the billing provider\'s cost insights; nothing was charged for it.',
  'ai.cost_unrecorded': 'What a run\'s model calls cost (a metered action, a stream, a chat reply or a knowledge embedding) could not be recorded for the admin console\'s Costs tab and the AI spend alert; the run itself went through.',
  'ai.spend_limit_reached': 'What AI cost the whole app today (UTC) reached setupAi({ spendLimit }): the pause_ai kill switch is on until the next UTC day begins, and the ai_spend_limit alert was raised.',
  'ai.spend_limit_reset': 'A new UTC day began: the pause_ai the AI spend limit turned on is off again. A pause an administrator set stays.',
  'ai.provenance_unsigned': 'Generated images were stored with the IPTC source type only, no signed C2PA manifest: PROVENANCE_PRIVATE_KEY and PROVENANCE_CERTIFICATE are not set, cannot be read or do not match, or signing failed. Once per isolate.',
  'ai.provenance_skipped': 'A generated file was stored without the package\'s C2PA manifest: its format carries none (JPEG, PNG and WebP do), or it carried content credentials of its own, which were kept. Its provenance record was written. Once per isolate.',
  'ai.moderation_unreadable': 'The safety classifier answered something other than a verdict ("safe", or "unsafe" and its categories): the content was refused as unchecked (`unavailable`, reason `provider_refused`). Check that setupAi({ moderation }) names a classifier, not a chat model.',
  'ai.moderation_images_unchecked': 'Images were passed to a moderation check whose classifier reads text only (any but Llama Guard 4): the check was refused as unchecked (`unavailable`, reason `not_configured`). Once per isolate.',
  'reports.describe_failed': 'setupAdmin({ reports })\'s describe threw for a reported row: the Reports tab shows it as gone, and a report of it is refused.',
  'reports.copies_unmatched': 'A removed intimate image named a file whose identical copies could not be looked for: setupStorage does not keep it, or its bytes could not be read. Nothing was blocked for it.',
  'reports.email_unsent': 'A content-duty email (a notice\'s receipt or outcome, a statement of reasons, an appeal\'s outcome) could not be sent: the decision stands, and the person must be told another way.',
  'audit.recorded': 'An event was recorded on the audit trail: its type and id, nothing else. One line per event, written as the row is: a mutation that fails after recording rolls the row back, but not the line.',
  'audit.record_failed': 'An event (a sign-in, a passkey, a workspace or an administrator change, a billing webhook, a checkout, a gift, a bounce, an export) could not be recorded on the audit trail; what it records went through.',
  'notifications.deliver_failed': 'An event was recorded, but a notification for it was not delivered on one of its channels; the event and the other channels stand.',
  'notifications.push_device_gone': 'A device\'s push service answered 404 or 410: the device unsubscribed or went away, and its subscription was dropped.',
  'notifications.push_too_large': 'A push service answered 413: the message was too large and was dropped; the inbox and email still carry the notification.',
  'notifications.push_failed': 'A push service stayed busy (429 or 5xx) through every retry: the push was not delivered to that device.',
  'notifications.push_refused': 'A push service refused a push (400 or 403): PUSH_PUBLIC_KEY and PUSH_PRIVATE_KEY may not be one pair, or not the pair the device subscribed with. Pushes stop reaching that device until it subscribes again.',
  'audit.forward_failed': 'An event was recorded, but the app\'s onEvent action could not be scheduled with it.',
  'funnel.count_failed': 'An event was recorded, but the growth funnel or an experiment did not count it: the step, the week of activity or the goal it was is left out of the Analytics tab\'s counts. The event stands.',
  'account.deletion_postponed': 'An account\'s deletion came due while it was the only owner of a workspace others belong to: it waits a day, and runs once ownership moved or the others left.',
  'account.deletion_email_unsent': 'An account\'s scheduled deletion, or its cancellation, was not announced by email: setupAccount has no email instance, the deployment has no SITE_URL, or the provider refused it. The deletion itself stands; the app shows it and the person can still cancel it.',
  'account.erasure_retried': 'A participant of an account\'s erasure failed and runs again after a wait: five tries, each wait twice the one before.',
  'account.erasure_failed': 'An account\'s erasure gave up on a participant after five tries, could not start, or dropped an erasure that failed 30 days ago: what that participant holds is left. Run account.forget for the account again (failedErasures lists them).',
  'monitoring.report_failed': 'An error report or a cron check-in could not be posted to the monitoring service (MONITORING_DSN is malformed, or the service did not take it); what it reported on went on.',
  'monitoring.alert': 'An alert of the backend fired: the email plan\'s daily or monthly quota passed 80% or ran out, or the day\'s AI job spend passed twice the daily average of the week before (and $5). Once per alert and period, also sent to the monitoring service when MONITORING_DSN is set.',
  'monitoring.alert_unread': 'An alert check could not read what it watches (the email provider\'s usage); the other checks ran, and the next hour tries again.',
} as const

/** @internal */
export type LogCode = keyof typeof LOG_CODES

/**
 * Write one line to the deployment's logs. `error`, when given, follows the
 * message as its own argument so the platform renders its stack. `info` is
 * for a line written on every occurrence of something that went right (an
 * event recorded): it names ids, never what they stand for.
 *
 * @internal
 */
export function logBackend(level: 'info' | 'warn' | 'error', code: LogCode, message: string, error?: unknown): void {
  const line = `[nuxt-backend] ${code}: ${message}`
  if (error === undefined) console[level](line)
  else console[level](line, error)
}
