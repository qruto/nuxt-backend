---
title: Run the admin console
description: "Make the first administrator, then run /admin: every account and workspace, bans, roles, signed-out devices and impersonation, the activity trail, flags and system health, with useAdmin, <AdminUsers>, setupAdmin and tabs of your own."
kind: how-to
capability: auth
api: /docs/reference/api/admin
source: src/convex/integrations/admin.ts
navigation:
  title: Admin console
  icon: i-lucide-user-cog
---

Running an app means answering a support request in minutes: find the account, see its devices, ban the spammer, look at what happened. The module mounts the admin console at `/admin` (module option `pages.admin`) for administrators alone, accounts whose app-wide role is `admin`. The console is a [hidden page](/docs/build/auth/access/pages#hide-a-page-from-everyone-else): anyone else, signed in or not, gets the 404 of a page that does not exist, so the console never says it is there.

Better Auth's admin plugin holds the roles, bans and impersonation. The package adds the console, its reads, the limits and recent sign-in on its writes, and the record of everything an administrator does.

## The tabs

The open built-in tab is the address's `?tab=`. These are built in, ten apart in `order` from 10 (Users) to 170 (System):

| Tab | What it shows | Built on |
|---|---|---|
| Users | Every account, searchable by address, and a drawer per account with its role, its ban, its devices, its workspaces and "Impersonate". `?tab=users&user=<id>` opens that account's drawer, which the Reports and Billing tabs link to | `<AdminUsers>` |
| Workspaces | Every workspace, read-only: its members and open invitations, and "Impersonate" on a member | `<AdminWorkspaces>` |
| Activity | The whole [activity trail](/docs/build/auth/admin/audit-log) | `<AuditLog scope="all">` |
| Reports | Content people reported and notices from the `/report` form, intimate-image requests first by their 48-hour deadline (those the app could not place on a thing among them), each author a link to their account, and appeals, once `backend/admin.ts` passes `reports` ([Keep content safe](/docs/build/ai/content-safety#review-reports)) | `getReports`, `decideReport`, `flagCrime`, `decideAppeal` |
| Flags | The kill switches, then the app's feature flags, each with its override ([Roll out features and pause services](/docs/ship/operate/flags)) | `useFlagAdmin` |
| Access | The launch phase, invite codes, access links and invitations by address, once the app has `backend/access.ts` ([Invite codes and access links](/docs/build/growth/launch/invites)) | `useAccessAdmin` |
| Waitlist | The waiting people, oldest first and filtered, admitted in waves, declined or removed as abuse, with the room a wave has, once the app has `backend/waitlist.ts` ([Run a waitlist](/docs/build/growth/launch/waitlist)) | `useWaitlistAdmin` |
| Announcements | A notice every signed-in person sees until it expires or they dismiss it, and the email that may go with it to the people who opted into a topic or the waitlist's launch-news list: previewed, sent once (now or scheduled) or cancelled, once the app has `backend/email.ts` ([Announce product news](/docs/build/growth/engage/announcements)) | `useAnnouncementsAdmin` |
| Inbox | What people sent through the contact form and by email, newest first: replies to a reply address, mail to a workspace's address and the support inbox. An administrator answers a thread of the support inbox from here, in person with a recent sign-in. Shown once `backend/email.ts` re-exports `getInboxConsole` ([Receive email](/docs/build/email/inbound)) | `useInboxAdmin` |
| Referrals | The referral program's totals by state, its hold and caps, the top referrers and the flagged queue, where a reward is released or voided behind a recent sign-in, once the app has `backend/referrals.ts` ([Run a referral program](/docs/build/growth/offers/referrals)) | `useReferralAdmin` |
| Billing | The billing lifecycle's records, newest first: the save offers the cancel flow made and whether each was taken, the EU withdrawals, whose refund is yours to send, and the renewal consent proofs, all of them or one billing entity's. Read-only. Shown once `backend/billing.ts` re-exports `getBillingConsole` ([Follow subscription law](/docs/ship/compliance/subscriptions#what-an-administrator-sees)) | `getBillingConsole` |
| Queue | The job queue, once `backend/jobs.ts` defines one: what runs and waits, guest jobs among them, its tiers and models, its jobs and dead letters ([Operate the queue](/docs/build/ai/jobs/operate)) | `getQueue`, `listJobs`, `setQueue` |
| Costs | What AI cost over the last 7, 30 or 90 days, in total and for the 100 people whose calls cost the most: queued jobs, metered actions, streams, chat replies and knowledge. It reads when it opens, and again on Refresh. Shown once `backend/ai.ts` re-exports `getCosts` from `ai.api` ([AI cost per person](/docs/ship/operate/monitoring#ai-cost-per-person)) | `getCosts` |
| Analytics | Three views, each shown once the app re-exports its read. Revenue: the billing provider's live metrics, recurring revenue, subscriptions and churn, cancellations per reason, checkouts, usage per meter, and costs and margin (`getRevenue` in `backend/billing.ts`, [Read revenue and usage](/docs/build/growth/measure/revenue)). Growth: the funnel from waitlist to paid, broken down, with each sign-up week's retention (`getFunnel` in `backend/admin.ts`, [Measure growth](/docs/build/growth/measure)). Experiments: each variant's exposures, goal and guardrails, and the winner (`getExperiments` in `backend/flags.ts`, [Run an experiment](/docs/build/growth/measure/experiments)) | `getRevenue`, `getFunnel`, `getExperiments` |
| Webhooks | The delivery log of both providers, newest first, with each delivery's outcome and a **Replay** that asks the provider to send it again, in person with a recent sign-in. Shown once the app has `backend/webhooks.ts` ([Replay a webhook delivery](/docs/ship/operate/replay)) | `getWebhookDeliveries`, `replayWebhookDelivery` |
| Suppressions | The addresses Resend stopped delivering to, newest first, each lifted through Resend in person with a recent sign-in. Shown once `backend/email.ts` re-exports `getSuppressions` ([Handle suppressed addresses](/docs/build/email/delivery/suppressions#lift-a-suppression)) | `getSuppressions`, `liftSuppression` |
| System | Every capability's state, with why, the env it lacks and its most pressing finding | the app's health endpoint |

`0.2.0` adds a tab or a view for each feature an administrator runs, once its capability is in use:

| Tab | For | Page |
|---|---|---|
| Messages | What arrives through the contact form and by email | [Add contact and feedback forms](/docs/build/email/inbound/contact-form) |

Apps add tabs of their own beside them ([Add your own admin tabs](/docs/build/auth/admin/custom-tabs)).

## Make the first administrator

A new deployment has none, and `npx nuxt-backend doctor` says so (`admin-bootstrap`). Sign in once with your own address, then run `doctor --fix` and enter that address when it asks. While the app is in a closed [launch phase](/docs/build/growth/launch#change-the-phase), run it once before you sign in as well, so it admits your address first:

```bash
npx nuxt-backend doctor --fix
# [nuxt-backend] doctor --fix: no account holds the admin role. Make which account the first administrator? Its email (empty to skip): you@example.com
# [nuxt-backend] doctor --fix: you@example.com is the first administrator.
```

It runs the scaffold's `setUserRole`, an internal mutation no browser can call, and records the change on the activity trail as the app's. In CI or a script, run it yourself:

```bash
npx convex run functions:setUserRole '{"email":"you@example.com","role":"admin"}'
```

Production takes the same: `npx nuxt-backend doctor --fix --prod`. The new role reaches the person's token at their next refresh, within 15 minutes, and the console's reads check it fresh at once.

On a `sandbox` deployment, such as a public demo, an administrator signs in with passkeys only. Its [dev inbox](/docs/develop/dev-inbox) shows sign-in codes to anyone, so the `admin` tier, the console and Better Auth's own `/admin/*` routes (impersonating, banning, setting a role) refuse an administrator whose account still takes codes, or whose session a code opened, even one opened before the account turned passkey-only (`forbidden`, reason `passkey_only_admin`): the console's reads answer `null`. So do billing's admin reads and refunds, the activity trail's `listAllActivity` and the health detail. During a visit, the administrator's own session is the one checked, and `/admin/stop-impersonating` stays open. Save a passkey, turn on passkey-only sign-in under Security (it signs your other sessions out), then sign in again with the passkey ([What a demo refuses](/docs/ship/deploy/staging#what-a-demo-refuses)).

## What an administrator may do

The console's writes are Better Auth's admin routes, which the package holds to its [sensitive-action table](/docs/build/auth/access/step-up#which-actions-ask):

| Action | Route | Asks for a recent sign-in |
|---|---|---|
| Set an account's role | `/admin/set-role` | yes |
| Ban an account, with a reason and a length, or lift a ban | `/admin/ban-user`, `/admin/unban-user` | yes |
| Impersonate an account | `/admin/impersonate-user` | yes |
| Sign every session of an account out | `/admin/revoke-user-sessions` | no: signing someone's devices out defends their account |

- **Limited.** Every one spends the per-caller `admin` limit, so one stolen session or a runaway script can't ban a thousand accounts.
- **A ban** signs the account out everywhere and refuses its sign-ins until it ends or is lifted. The reason stays on the account. The trail records the ban (`admin.user_banned`, with how long it lasts) and its end, never the reason.
- **Never on yourself.** An administrator manages neither their own role nor their own ban, and an administrator's account is never impersonated ([Impersonation](/docs/build/auth/admin/impersonation)).
- **Workspaces are read-only.** An administrator acts inside one only by impersonating a member.
- **Passkey-only, off.** For a person who lost every passkey and their recovery code, the account's drawer turns passkey-only off, so a sign-in code works again. Check who asks first, out of band. It is `useAdmin().allowSignInCodes(userId)` (`/admin/disable-passkey-only`), it asks for a recent sign-in, and it spends the `admin` limit ([Passkey-only accounts](/docs/build/auth/sign-in#passkey-only-accounts)). Another administrator's account is refused as `forbidden` (`admin_target`), as a visit to one is. The person gets an email, and the change lands on their activity as `auth.passkey_only_changed`, as it does when they turn codes off or on themselves.

## Review reports

The Reports tab is the queue for content people report, from a report button in your app or from the public notice form at `/report`. It lists open reports grouped by subject, the most reported first. Arrives with SAFETY. You tell it how to show and hide a subject in `setupAdmin({ reports })`, and people report through `reportContent` ([Keep content safe](/docs/build/ai/content-safety#review-reports)).

For each subject an administrator hides it, dismisses the reports, or opens the author's account in the Users tab. A notice the app could not place on a thing hides nothing of the app's: its first action reads **Mark handled**, and its sender hears that you acted on it, never that the content was removed. Each decision asks for a recent sign-in, and the trail records it with the reason, never the reporter. On top of that queue, `0.2.0` covers the duties the EU Digital Services Act and the US TAKE IT DOWN Act put on an app that hosts what people upload:

| Duty | What the queue does | Source |
|---|---|---|
| A way for anyone to report | The `report` page key serves `/report`, a notice form that needs no account, with a reason and the content's address. | DSA Art. 16 |
| A reason for every decision | Hiding a subject emails its author a statement of reasons: what was hidden, why, and how to appeal. | DSA Art. 17 |
| An appeal | The author's appeal returns the subject to the queue, marked as an appeal. Restoring it lifts the hide. | DSA Art. 17(3)(f) |
| Suspected crimes | **Flag a suspected crime** marks the report and records it on the trail, so you can tell the authorities. The package contacts no one. | DSA Art. 18 |
| Intimate images | A report in the intimate-image category shows a 48-hour countdown. Hiding it also hides identical copies, matched by a hash of the file. | TAKE IT DOWN Act |

None of this is legal advice. [Moderate user content](/docs/ship/compliance/moderation) says which duties reach your app, with the primary sources.

## The reads: `setupAdmin`

The scaffold's `backend/admin.ts` builds the console's reads:

```ts [backend/admin.ts]
import { setupAdmin } from 'nuxt-backend/admin'
import { components } from './_generated/api'

const admin = setupAdmin(components)

// The reads behind useAdmin, <AdminUsers> and <AdminWorkspaces>.
export const { listUsers, getUser, listWorkspaces, getWorkspace } = admin.api
```

::field-group
  :::field{name="listUsers" type="query"}
  A page of accounts, newest first, by cursor. `search` keeps those whose address contains it.
  :::

  :::field{name="getUser" type="query"}
  One account with its workspaces and its device sessions: ids and expiry times, never a session token. The first 100 of each, and `truncated` says when there are more.
  :::

  :::field{name="listWorkspaces" type="query"}
  A page of workspaces, newest first. `search` keeps those whose name contains it.
  :::

  :::field{name="getWorkspace" type="query"}
  One workspace with its members and its open invitations. The first 100 of each, and `truncated` says when there are more.
  :::
::

Each read answers `null` to anyone who is not an administrator now. The role is read fresh on every call, so a demoted or banned administrator reads nothing on their next call. A visit to someone's account reads nothing either. Give `setupAdmin` the same `adminRoles` you give `setupAuth({ admin })` when you name more administrator roles.

## Your own page: `useAdmin`

`<AdminUsers>` and `<AdminWorkspaces>` work on any page of yours, and `useAdmin()` is the same data for your own markup:

```vue [app/pages/admin/spam.vue]
<script setup lang="ts">
definePageMeta({ auth: { role: 'admin' } })

const search = ref('')
const admin = useAdmin({ search, limit: 25 })
const { withReauthentication } = useReauthentication()
const ban = (id: string) => withReauthentication(() => admin.ban(id, { reason: 'Spam', expiresIn: 86_400 }))
</script>

<template>
  <input v-model="search" type="search">
  <p v-for="user in admin.users.value" :key="user.id">
    {{ user.email }} · {{ user.role }}
    <button type="button" @click="ban(user.id)">Ban {{ user.email }}</button>
  </p>
</template>
```

- **The list.** `list` is `users` (the default) or `workspaces`. `next()` and `previous()` page by cursor, and a new `search` or `limit` goes back to the first page.
- **One in full.** `userId` makes `user` the account with its workspaces and sessions. `workspaceId` makes `workspace` the workspace with its members and invitations.
- **The actions.** `setRole`, `ban`, `unban`, `revokeSessions`, `impersonate(userId, { workspaceId })` and `stopImpersonating()` resolve, or reject with the refusal, which `error` also holds. Wrap the ones that ask for a recent sign-in in `withReauthentication`.
- **Refused.** A caller who is no administrator gets empty lists and `isRefused`. Reads never reject.

`<AdminUsers>` takes `limit`, `roles` (the roles its role select offers), `landing` (where an impersonation lands), `confirm` and `labels`. Without `confirm`, a ban asks in the component's own styled dialog, as every console tab's change that asks first does, never the browser's `confirm()`: focus moves to Cancel, and Escape or Cancel answers no. Pass `confirm` to ask in your own. `<AdminWorkspaces>` takes `limit`, `landing` and `labels`. Both render nothing for a caller who is no administrator, and their words are the `admin` label group.

## Your own admin-only functions

Build them with the `admin` tier. It reads the role fresh, refuses a visit to someone's account on writes, and asks its writes for a recent sign-in ([Protect backend functions](/docs/build/auth/access/functions)):

```ts [backend/reports.ts]
import { admin } from './functions'

export const exportSignups = admin.action({
  args: {},
  handler: async (ctx) => {
    // ctx.user is an administrator, signed in within the last ten minutes, in person.
  },
})
```

Record what they do with [`recordBackendEvent`](/docs/build/auth/admin/audit-log#record-your-own-events), so it lands on the same trail.

## What happens when…

| Refused with | When |
|---|---|
| [`reauthentication_required`](/docs/reference/backend/errors#reauthentication_required) | A write with a sign-in older than ten minutes. `<AdminUsers>` asks, then runs it again. |
| [`forbidden`](/docs/reference/backend/errors#forbidden), reason `impersonating` | An administrator tries a console write while visiting someone's account. |
| [`rate_limited`](/docs/reference/backend/errors#rate_limited), limit `admin` | Too many console writes from one administrator. |

A caller who isn't an administrator now gets `null` from every read and an empty console, never an error.

## Limits

- **Reads show the first 100** of an account's workspaces and sessions, or a workspace's members and invitations, with `truncated` past that.
- **Search** matches a part of the address or the workspace name, not a full-text query.
- **Workspaces are read-only.** There is no admin write on a workspace: impersonate a member instead.
- **A demo's administrators are passkey-only and sign in with a passkey.** On `sandbox`, an administrator who still takes sign-in codes, or who signed in to this session with one, reads an empty console.

## Test it

```ts [backend/admin.test.ts]
import { asUser, defineBackendTestApp } from 'nuxt-backend/test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const testApp = defineBackendTestApp(schema, import.meta.glob('./**/*.ts'))

test('only an administrator reads the accounts', async () => {
  const t = testApp()
  const ada = await asUser(t)
  const grace = await asUser(t, { role: 'admin' })
  const page = { paginationOpts: { numItems: 10, cursor: null } }
  expect(await ada.query(api.admin.listUsers, page)).toBeNull()
  expect(await grace.query(api.admin.listUsers, page)).not.toBeNull()
})
```

## Related

- [Impersonation](/docs/build/auth/admin/impersonation): what a visit may and may not do.
- [Record and review activity](/docs/build/auth/admin/audit-log): the trail the Activity tab reads.
- [Add your own admin tabs](/docs/build/auth/admin/custom-tabs): pages of yours inside the console.
- [Monitor errors and uptime](/docs/ship/operate/monitoring): the health endpoint the System tab reads.
- [Keep content safe](/docs/build/ai/content-safety#review-reports): the reports the Reports tab reviews.
