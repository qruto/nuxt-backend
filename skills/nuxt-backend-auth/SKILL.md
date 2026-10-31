---
name: nuxt-backend-auth
description: Sign-in, sessions and access control in a Nuxt app on nuxt-backend. Passwordless sign-in with email codes and passkeys, the packaged sign-in, profile and security pages, protecting pages, the current user, roles, user-scoped Convex functions (authed, org, admin, withRole, withFeature), Nitro routes that call Convex as the user, workspaces with members and invitations, the admin console and impersonation, the activity trail (audit log), and bot protection (BotID, Turnstile, verifyHuman). Use when adding or changing sign-in or sign-out, guarding a page, component or function, reading the user or the active workspace, building workspace, member and invitation flows, administering accounts, recording or showing activity, or keeping bots off sign-in and public forms. Read the nuxt-backend core skill first.
---

# nuxt-backend: auth and workspaces

Sign-in is passwordless: email codes and passkeys, nothing else. Every user gets a personal
workspace on first sign-in, so a session always has an active one. The `nuxt-backend` core skill
holds the rules every change follows; this one covers who the caller is and what they may do.

## Sign-in and pages

- `useAuth()` only reads the session (`user`, `role`, `hasRole()`, `isSignedIn`, `impersonating`)
  and signs out; `<AuthForm>` signs in with passkeys and email codes. `definePageMeta({ auth: true })`
  protects a page: the one page guard, no named middleware.
- `definePageMeta({ auth: { role: 'admin' } })` opens a page only to a role (also `workspace: true`
  or a workspace role like `['owner', 'admin']`, and `feature: 'key'`, every one must pass;
  `hidden: true` answers 404 instead). A signed-in person who fails gets a fatal 403 with
  `data.reason` (`role`, `workspace`, `feature`, `banned`), which the module's error page shows with `<AccessDenied>`; an app's own
  `error.vue` renders `<AccessDenied :error="error" />` for it. A key that is no rule refuses the
  page. The guard is for the screen; the functions the page calls must still check on the server.
- The module mounts `/login`, `/pricing`, `/settings`, `/profile`, `/security`,
  `/accept-invitation` and `/admin` (the `admin` role only; it is hidden, so anyone else, signed in or not,
  gets a 404), every one of them always. Private pages carry a `noindex` robots meta tag. A path under
  `backend.pages` in `nuxt.config` moves a page (`pages: { pricing: '/plans' }`); an app page at a
  page's path replaces it. A page key takes a path only: `true` or `false` stops the build.
- A tool of your own for the admin console is a page under `app/pages/admin/` with
  `definePageMeta({ auth: { role: 'admin', hidden: true }, adminTab: { label, icon, order } })`: it
  becomes a tab at its own address, and its functions use the `admin` tier
  (https://nuxt-backend.dev/docs/build/auth/admin/custom-tabs).
- After sign-in, `/login` returns to `?redirect=` when it names a page of this site, else to
  `backend.redirects.afterSignIn` (`/`); on a page of your own, use
  `resolveAuthRedirect(route.query.redirect, fallback)`.
- When a session ends on a guarded page, the module sends the person to sign in; a
  `backend:session-ended` hook can change `to` or call `preventDefault()`.
- `<AuthForm>` offers saved passkeys in the email field's autofill and marks the way this
  browser last signed in "Last used". A page of your own gets both from
  `useLoginFlow({ autofill: true, preferLastMethod: true })` and its `lastMethod`, and its email
  field must keep `autocomplete="username webauthn"`. `useAuth().lastSignInMethod` (`'passkey'`
  or `'email-otp'`) reads Better Auth's `lastLoginMethod` cookie, in the server render too:
  https://nuxt-backend.dev/docs/build/auth/sign-in#passkey-autofill.
- Custom sign-in page: https://nuxt-backend.dev/docs/build/auth/sign-in/custom-page.

## Composables

- `useAuth`, `useWorkspace` and `usePasskeys` actions resolve with their
  data (`signInWithOtp` with the user, `create` with the workspace) and reject on a refusal,
  keeping it in `error` as `{ code, data, message }`. Never wrap one in `unwrapAuth()`: that is
  for a raw `client.…` call only.
- `useLoginFlow` and `useEmailChange` are step machines that never reject: read `isPending`,
  `error` and `retryAfter`.
- A banned account's sign-in is `forbidden` with reason `banned`.
- `useSessions()` lists the account's signed-in devices and revokes one by id.

## Functions

`backend/functions.ts` exports pre-authorized builders. Use them instead of the bare `query` and
`mutation` for anything user-scoped:

- `authed.query(...)` gets `ctx.user`;
- `workspace.mutation(...)` adds `ctx.workspace`;
- `admin.*` requires the app-wide admin role;
- `withRole('editor')` sets a custom tier;
- `withFeature('reports')` is `workspace` plus a plan's feature (`feature_required` otherwise). It is
  created in `backend/billing.ts` by a second `createFunctions` call with the same builders and
  options plus `billing`; the billing skill has the details.

A function an agent may call names its scope: `authed.query({ scope: 'todos:read', … })`. Without
one, an agent's call is refused. In Nitro, `backendAuth(event)` runs Convex calls as the
signed-in user.

## Workspaces

- `useWorkspace()` is the whole client side: the workspaces, the active one (`current`), the
  member and role, switching, creating, members, and invitations. `<WorkspaceSettings>` renders members and
  invitations, and `<Gate role>` and `<Gate workspace>` show a region only to the right callers.
- The active workspace rides on the session token, so switching re-runs every workspace-scoped
  query against the new tenant, and billing follows it.
- Invitation links land on `/accept-invitation` (`<AcceptInvitation>`).

## Bot protection

- The sign-in code request and sign-up carry a bot check on their own: BotID on Vercel, a
  Turnstile challenge wherever the app has a site key (`NUXT_PUBLIC_BACKEND_CHALLENGE_SITE_KEY`
  for the app, `PROTECTION_CHALLENGE_SECRET_KEY` on the deployment). Never add a widget to
  `<AuthForm>` or send `x-captcha-response` yourself: the package's auth client does it. Only an
  auth client of the app's own (`convex.betterAuth.authClient`) must send it.
- On Vercel the Nuxt server signs a proof into each checked request with
  `PROTECTION_PROOF_SECRET`, and the deployment refuses those routes without it. One value on
  both sides, production's its own (never `.env.local`'s); never derive it. Off Vercel nothing
  signs proofs: never set the proof secret there without the challenge keys.
- A call of your own that skips the Nuxt server (a waitlist, a form, a claim): get a token from
  `useHumanCheck().token('<action>', subject)`, pass it as an argument, and call
  `verifyHuman(ctx, token, { action: '<action>', subject })` from `nuxt-backend/functions` first
  thing in an action, then run the write as an internal mutation. A challenge answer verifies in
  an action only; a query or mutation takes proofs, which exist only on Vercel.
- A refusal is `forbidden` with reason `bot_check`. `npx nuxt-backend doctor --only protection`
  checks the secrets: https://nuxt-backend.dev/docs/build/auth/sign-in/bots.

## Caching

Keep `swr`, `isr` and `cache` route rules on public pages (`'/blog/**'`), never `'/**'`. A
signed-in render carries the session's token, and the private pages opt out of caches at their
exact paths only.

## Admin console and impersonation

- `/admin` is the console: accounts (`<AdminUsers>`: search, ban, role, sign devices out,
  impersonate), workspaces read-only (`<AdminWorkspaces>`), all activity and the layers' health.
  `useAdmin({ search, userId, list: 'workspaces' })` is its data; its reads are
  `backend/admin.ts` (`setupAdmin`), `null` for anyone who is not an administrator now.
- Role, ban and impersonation take a recent sign-in: wrap them in
  `useReauthentication().withReauthentication`. After `impersonate()`, reload the app.
- An administrator acts inside a workspace only by impersonating a member. A visit lasts thirty
  minutes at most, never of an administrator (`forbidden`, reason `admin_target`), and refuses
  anything sensitive. `useAuth().impersonating` says so; put `<BackendNotices />` in the
  layout, and `useAdmin().stopImpersonating()` ends a visit. Refuse visits in your functions with `{ impersonation: 'refused' }`.
- The first admin: `npx nuxt-backend doctor --fix` asks for the address (`admin-bootstrap`):
  https://nuxt-backend.dev/docs/build/auth/admin.

## Activity trail

- Sign-ins and sign-outs, passkeys, email and session changes, workspace invitations, joins,
  removals and role changes, administrator impersonations and role changes, and agent approvals
  are recorded already, kept 365 days. `<AuditLog scope="mine">` (also `workspace` for its owners
  and admins, `all` for administrators) and `useAuditLog({ scope })` read them; `/security` and
  `/settings` show them. A scope the caller may not read renders nothing (`isRefused`), never an
  error.
- Record your own from a mutation or action with `audit.recordBackendEvent(ctx, { type:
  'app.project_archived', entityId, targetId })` from `backend/audit.ts`: a type under `app.`,
  ids and flat values only, never an address in `data`. The actor comes from the caller's token.
- `setupAudit(components, { onEvent: internal.audit.onEvent })` hears every event in an
  `internalAction({ args: { event: vBackendEvent } })`, once it is recorded; `setupAuth({ audit })`
  sends the auth layer's events through it: https://nuxt-backend.dev/docs/build/auth/admin/audit-log.

## Tasks

<!-- generated:tasks -->
- [Build a custom sign-in page](https://nuxt-backend.dev/docs/build/auth/sign-in/custom-page): Replace /login with a page of your own: restyle `<AuthForm>` through its slots, or drive useLoginFlow with your own markup, and keep ?redirect=, passkey autofill and every step working. Reach for `useLoginFlow()`.
- [Hook into sign-in and sign-up](https://nuxt-backend.dev/docs/build/auth/sign-in/hooks): Decide who may sign in with canSignIn, run your own code when an account is created or deleted, and add Better Auth hooks of your own that compose with the package's. Reach for `nuxt-backend/auth`.
- [Stop bots](https://nuxt-backend.dev/docs/build/auth/sign-in/bots): Check that a person, not a script, asks for a sign-in code or creates an account: Vercel BotID on Vercel, a Turnstile challenge elsewhere, and verifyHuman for your own calls. Reach for `useHumanCheck()`.
- [Sign users in](https://nuxt-backend.dev/docs/build/auth/sign-in): Sign people in with a sign-in code or a passkey: useLoginFlow drives every step, `<AuthForm>` renders it at /login, codes work only in the browser that asked, a passkey is offered after the first code, and passkey-only accounts recover with a code of their own. Reach for `useLoginFlow()`.
- [Protect pages and routes](https://nuxt-backend.dev/docs/build/auth/access/pages): Open a page only to the right people with definePageMeta({ auth }): signed in, an app-wide role, a workspace, a plan feature. Anyone else gets a 403 that shows `<AccessDenied>`, or a 404 for a hidden page. Also: when a session ends, and server routes.
- [Protect backend functions](https://nuxt-backend.dev/docs/build/auth/access/functions): Declare each Convex function at the access tier it needs, from one createFunctions call: signed in, a workspace member, an administrator, a role of yours, or a workspace whose plan has a feature. Reach for `nuxt-backend/functions`.
- [Give people roles](https://nuxt-backend.dev/docs/build/auth/access/roles): Two kinds of role decide what a person may do: an app-wide role (user, admin or one of yours) and a built-in role in each workspace (owner, admin, member). How to give each, and how pages and functions check them.
- [Require a recent sign-in](https://nuxt-backend.dev/docs/build/auth/access/step-up): Ask the person to confirm it's them before a sensitive action: which actions ask, the dialog that asks, and recentSignIn on your own functions. Reach for `useReauthentication()`.
- [Let users edit their profile](https://nuxt-backend.dev/docs/build/auth/accounts/profile): Let a signed-in person change their display name and avatar, pick the language their emails are written in, and move their account to a new email address with a code from each address. Reach for `useEmailChange()`.
- [Manage passkeys and sessions](https://nuxt-backend.dev/docs/build/auth/accounts/security): Let a signed-in person add and remove passkeys, turn sign-in codes off for a passkey-only account, see and sign out their devices, read their account's recent activity, and reach its export and deletion, all on /security. Reach for `useSessions()`.
- [Export and delete an account](https://nuxt-backend.dev/docs/build/auth/accounts/data): Give a person one export of everything the app keeps of them, files included, and delete their account after a grace period they can cancel, erasing it everywhere: the backend's tables, the billing customer, the email contact and your own tables. Reach for `nuxt-backend/account`.
- [Record consents](https://nuxt-backend.dev/docs/build/auth/accounts/consents): Keep a versioned record of what each person agreed to: your terms, your privacy policy and opt-ins of your own, asked again after a change. Ask before any optional storage with the consent manager, and refuse sign-ups under a minimum age.
- [Alert people to new sign-ins](https://nuxt-backend.dev/docs/build/auth/accounts/alerts): Tell a person when their account signs in from a device it has not used before, in the app and by email, with a link to sign that device out from /security.
- [Invite people to a workspace](https://nuxt-backend.dev/docs/build/auth/workspaces/invitations): The invitation flow end to end: an owner or admin invites by email, the invitee signs in and accepts on /accept-invitation, and the inviter can cancel. The email, the link, the page and their limits. Reach for `<AcceptInvitation>`.
- [Manage members](https://nuxt-backend.dev/docs/build/auth/workspaces/members): List a workspace's members, change their built-in role and remove them from your own team page: who may do what, what a removal does at once, and the owner a workspace always keeps. Reach for `useWorkspace()`.
- [Create and switch workspaces](https://nuxt-backend.dev/docs/build/auth/workspaces): Workspaces are how people share an app: a personal workspace for everyone, more on demand, the active one carried on the session, one composable for the list, the switch and the members, `<WorkspaceSettings>` on /settings and the workspace function tier. Reach for `useWorkspace()`.
- [Record and review activity](https://nuxt-backend.dev/docs/build/auth/admin/audit-log): The activity trail: what the package records, who reads which part of it, events of your own with recordBackendEvent, onEvent, a year of retention and erasure. Reach for `nuxt-backend/audit`.
- [Add your own admin tabs](https://nuxt-backend.dev/docs/build/auth/admin/custom-tabs): Put the tools your team runs the app with inside the admin console: a page under app/pages/admin/ becomes a tab beside the built-in ones, guarded like the console, hidden from everyone else, and backed by admin-tier functions.
- [Run the admin console](https://nuxt-backend.dev/docs/build/auth/admin): Make the first administrator, then run /admin: every account and workspace, bans, roles, signed-out devices and impersonation, the activity trail, flags and system health, with useAdmin, `<AdminUsers>`, setupAdmin and tabs of your own. Reach for `nuxt-backend/admin`.
- [Run a waitlist](https://nuxt-backend.dev/docs/build/growth/launch/waitlist): A verified waitlist for early access: joins proven by an email code, a public position with a referral boost, launch news only for those who opted in, admission in waves from the admin console, and a launch that opens the doors. Reach for `setupWaitlist()` from `nuxt-backend/access`.
- [Hand out invite codes and access links](https://nuxt-backend.dev/docs/build/growth/launch/invites): While your app is in early access or invite only, administrators admit people from the console's Access tab: invite codes to share, access links for a whole cohort, invitations by address with no email unless asked, and useInvite to redeem them. Reach for `nuxt-backend/access`.
- [Launch in phases](https://nuxt-backend.dev/docs/build/growth/launch): Open your app in three phases, early access with a waitlist, then invite only, then public: setupAccess, the tickets that admit a new address, useAccessPhase on your pages, and a phase you change from the admin console with no deploy. Reach for `nuxt-backend/access`.
<!-- /generated:tasks -->

## The API

[references/api.md](references/api.md) lists the composables, components, import paths, doctor
findings and env of this area, each with its doc comment's first sentence. Composable
conventions: https://nuxt-backend.dev/docs/reference/nuxt/conventions.
