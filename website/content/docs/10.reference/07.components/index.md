---
title: Components
description: "Every component of 0.2.0 by area, with its status and its section: one gate, one notice region, the account, workspace, billing and admin components, the new ones, the parts each is built from, the contract each keeps, and the base module's components it passes through."
kind: reference
source: test/nuxt/component-contract.ts
navigation:
  title: Overview
  icon: i-lucide-component
---

In `0.2.0` the module registers about thirty components of its own, auto-imported in every page and layout, and keeps the base module's `<StorageImage>` under a neutral name. Every one of its own keeps one contract, so a component you have not used yet reads like the ones you have: the same slots-and-events shape, the same `data-*` hooks, the same states and the same accessibility. This page lists them by area, with each one's status, and links to its section.

## What changes

`0.2.0` keeps one component per job (SIMPLIFY):

- **One gate.** `<Gate>` replaces the four boundaries: its `signed-in`, `role`, `workspace`, `feature` and `quota` props are their checks.
- **One notice region.** `<BackendNotices>` replaces the four banners: each is a notice of the region, overridden through its slot.
- **Built from parts (UIKIT).** Each component becomes a `.vue` file made of named [parts](/docs/reference/components/parts), and a same-named component in your app replaces a part everywhere. Tokens move to `:root` inside `@layer nuxt-backend`, `css: false` loads no package CSS, and `npx nuxt-backend eject` copies a part's source into the app. The components work beside any UI library and depend on none.

## Components by area

| Component | Area | Status | What it is |
|---|---|---|---|
| [`<Gate>`](/docs/reference/components/shell#gate) | Gating | Built | Its content only for the people its props admit: signed in, a role, a workspace, a plan feature, room in a quota |
| [`<BackendNotices>`](/docs/reference/components/shell#backendnotices) | Notices | Built | One region for every app-wide notice: impersonation, maintenance, announcements, a scheduled deletion, low credits and gifts to claim |
| [`<AuthForm>`](/docs/reference/components/account#authform) | Sign-in and account | Available | The passwordless sign-in: email code and passkey, one slot per step |
| [`<AcceptInvitation>`](/docs/reference/components/workspaces#acceptinvitation) | Sign-in and account | Available | Accept or decline a workspace invitation |
| [`<ProfileSettings>`](/docs/reference/components/account#profilesettings) | Sign-in and account | Available | The name, the email change and the language |
| [`<SecuritySettings>`](/docs/reference/components/account#securitysettings) | Sign-in and account | Available | Passkeys, device sessions and signing out |
| [`<ReauthenticateDialog>`](/docs/reference/components/account#reauthenticatedialog) | Sign-in and account | Available | "Confirm it's you" before a sensitive action |
| [`<AccountData>`](/docs/reference/components/account#accountdata) | Sign-in and account | Available | The account's data export, with its files as zip parts, and its deletion, which waits out a grace period the person can cancel |
| [`<AccessDenied>`](/docs/reference/components/shell#accessdenied) | Sign-in and account | Available | The page guard's 403 |
| [`<ConnectionStatus>`](/docs/reference/components/shell#connectionstatus) | Sign-in and account | Available | The live connection's state, in words |
| [`<ConsentPrompt>`](/docs/reference/components/account#consentprompt) | Sign-in and account | Available | The consents to accept again, the age question and the question about optional storage |
| [`<WorkspaceSettings>`](/docs/reference/components/workspaces#workspacesettings) | Workspaces | Available | The workspaces, the plan and the credits of the active workspace |
| [`<PricingTable>`](/docs/reference/components/billing#pricingtable) | Billing | Available | The plans and packs, with checkout, plan changes and the portal |
| [`<BillingCheckoutLink>`](/docs/reference/components/billing#billingcheckoutlink) | Billing | Available | A link that opens a checkout |
| [`<BillingPortalLink>`](/docs/reference/components/billing#billingportallink) | Billing | Available | A link that opens the customer portal |
| [`<BillingHistory>`](/docs/reference/components/billing#billinghistory) | Billing | Available | Past charges with their invoices |
| [`<UsageHistory>`](/docs/reference/components/billing#usagehistory) | Billing | Available | Metered usage, event by event |
| [`<UpgradePrompt>`](/docs/reference/components/billing#upgradeprompt) | Billing | Available | The plans that include a feature someone lacks |
| [`<CancelFlow>`](/docs/reference/components/billing#cancelflow) | Billing | Available | One optional question, at most one save offer, then the cancellation, built from the `CancelFlowQuestion`, `CancelFlowOffer` and `CancelFlowEnd` parts ([Handle cancellations](/docs/build/growth/engage/cancel-flow)) |
| [`<WithdrawalButton>`](/docs/reference/components/billing#withdrawalbutton) | Billing | Available | The EU withdrawal button, with its confirm step and email receipt ([Follow subscription law](/docs/ship/compliance/subscriptions)) |
| [`<AdminUsers>`](/docs/reference/components/workspaces#adminusers) | Admin | Available | Every account, for administrators |
| [`<AdminWorkspaces>`](/docs/reference/components/workspaces#adminworkspaces) | Admin | Available | Every workspace, for administrators |
| [`<AuditLog>`](/docs/reference/components/workspaces#auditlog) | Admin | Available | The activity trail, a page at a time |
| [`<NotificationInbox>`](/docs/reference/components/shell#notificationinbox) | New | Available | The in-app notifications, with the unread count |
| [`<WaitlistForm>`](/docs/reference/components/account#waitlistform) | Sign-in and account | Available | Join the waitlist, confirm the address, see your place, built from the `WaitlistJoin`, `WaitlistCode`, `WaitlistPlace` and `WaitlistShare` parts |
| [`<ContactForm>`](/docs/reference/components/forms#contactform) | Email | Available | A contact or feedback form delivered to your team |
| [`<UploadField>`](/docs/reference/components/forms#uploadfield) | Files | Available | A checked upload with progress |
| [`<AppShell>`](/docs/reference/components/shell#appshell) | Shell | Available | The frame of a signed-in app, for your layout: the header with the workspace switcher and the account menu, the notices and the page, built from the `AccountMenu` and `WorkspaceSwitcher` parts ([Build the app shell](/docs/build/ui/app-shell)) |
| [`<OnboardingFlow>`](/docs/reference/components/account#onboardingflow) | Sign-in and account | Available | The first run at `/welcome`, built from the `OnboardingProfile`, `OnboardingWorkspace`, `OnboardingTeammates` and `OnboardingPlan` parts ([Guide people to their first result](/docs/build/growth/engage/activation)) |
| [`<AiLabel>`](/docs/reference/components/shell#ailabel) | AI | Available | The visible "AI-generated" label on generated content, with what made it ([Label AI-generated content](/docs/build/ai/provenance)) |
| [`<ActivationChecklist>`](/docs/reference/components/account#activationchecklist) | Sign-in and account | Available | Three to seven first tasks, with progress ([Guide people to their first result](/docs/build/growth/engage/activation)) |
| [`<HowDidYouHear>`](/docs/reference/components/account#howdidyouhear) | Sign-in and account | Available | One optional question after sign-up, stored with the first-touch campaign ([Measure growth](/docs/build/growth/measure)) |
| [`<ReferralCard>`](/docs/reference/components/billing#referralcard) | Billing | Available | A person's referral link with copy and share buttons, and the disclosure of the reward ([Referrals](/docs/build/growth/offers/referrals)) |
| [`<StorageImage>`](#the-base-modules-components) | Base module | Available | An image from file storage |

The admin console's own tabs grow with their units, and apps add tabs of their own ([Add your own admin tabs](/docs/build/auth/admin/custom-tabs)).

## What leaves

These names stop being components in `0.2.0`. Each one's job continues under the name beside it:

| Leaves | Its job continues as | Unit |
|---|---|---|
| `RoleBoundary` | `<Gate role>` | SIMPLIFY |
| `OrganizationBoundary` | `<Gate workspace>` | SIMPLIFY |
| `FeatureBoundary` | `<Gate feature>` | SIMPLIFY |
| `QuotaBoundary` | `<Gate quota>` | SIMPLIFY |
| `ImpersonationBanner` | The `impersonation` notice of `<BackendNotices>` | SIMPLIFY |
| `MaintenanceBanner` | The `maintenance` notice of `<BackendNotices>` | SIMPLIFY |
| `CreditsLowBanner` | The `low-credits` notice of `<BackendNotices>` | SIMPLIFY |
| `GiftClaimBanner` | The `gift` notice of `<BackendNotices>` | SIMPLIFY |

## The component contract

Every packaged component:

1. **Renders one root with its family.** It renders semantic, unstyled markup, and every element it renders carries `data-<family>` (`data-pricing="plan"`, `data-settings="switch"`). Those are the hooks the [module's stylesheet](/docs/build/ui/customize/tokens) and your CSS select; a component that renders only your slots has no family.
2. **Types its slots.** Each slot is declared with `SlotsType`, so a slot's props type-check in your template. The names below are the whole list, and each region of the markup has one.
3. **Types its events.** `emits` is an object of validators, so `@plan-changed` and the rest type-check, and an event the table does not list does not exist.
4. **Has a state for everything it waits on.** Loading, empty, failed, busy and refused (signed out, a role or a feature the person lacks, a member who manages no billing) each render something deliberate, never a stale or misleading screen. Refused means no control the server would refuse.
5. **Takes its words from labels.** Every word it shows comes from its [label group](/docs/build/ui/customize/labels), and its `labels` prop overrides that group for one placement. A component with no group shows only words you pass.
6. **Is accessible.** Every control's accessible name is the words it shows. A repeated control sits in a group named by what it acts on (a plan card, a workspace row), which also describes it, so a row of *"Subscribe"* buttons reads apart in any language. A busy button keeps focus (`aria-disabled`) and says what it waits for; loading and empty are polite statuses, a failure is an alert, and the part that waits is `aria-busy`. The [Accessibility](/docs/build/ui/accessibility) page has each component's guarantees.
7. **Is made of parts.** Each region is a registered [part](/docs/reference/components/parts) that keeps its `data-*` hook and takes its parent's composable as a prop, so a part you swap in keeps the rest of the contract.

A component that breaks the contract fails the package's tests, which render every component in every state.

## The package's components

Generated from the contract's rows, which the contract tests render every component against:

<!-- generated:contract (pnpm docs:lookups, from test/nuxt/component-contract.ts) -->

| Component | Family | Labels | Slots | Events | States |
|---|---|---|---|---|---|
| `<AuthForm>` | `data-auth` | `auth` | `header`, `choose`, `request-code`, `verify-code`, `passkey-offer`, `recover`, `waitlisted`, `invite-code`, `age`, `undeliverable`, `error`, `footer` | `success`, `error`, `step` | ready, request-code, verify-code, passkey-offer, recover, waitlisted, invite-code, age, undeliverable, pending, error |
| `<ConsentPrompt>` | `data-consent` | `consent` | `consent`, `footer` | `granted`, `error` | ready, age, storage, pending, error |
| `<WaitlistForm>` | `data-waitlist` | `waitlist` | `join`, `verify`, `status` | `joined`, `signed-in`, `left`, `error` | ready, verify-code, waitlisted, pending, error |
| `<ProfileSettings>` | `data-profile` | `profile` | `identity`, `name`, `email`, `language`, `preferences`, `footer` | `name-saved`, `email-changed`, `error` | ready, confirm-current, pending, error |
| `<SecuritySettings>` | `data-security` | `security` | `passkeys`, `passkey`, `sessions`, `session`, `alerts`, `danger`, `footer` | `passkey-added`, `passkey-removed`, `session-revoked`, `sessions-revoked`, `signed-out`, `error` | ready, loading, pending, error |
| `<AcceptInvitation>` | `data-invitation` | `invitation` | `loading`, `ready`, `accepted`, `declined`, `missing`, `error` | `accepted`, `declined`, `error` | loading, ready, pending, accepted, declined, missing, error |
| `<PricingTable>` | `data-pricing` | `pricing` | `header`, `interval`, `currency`, `loading`, `empty`, `plan`, `plan-action`, `contact`, `packs`, `pack`, `portal`, `error`, `footer` | `update:interval`, `checkout`, `plan-changed`, `canceled`, `uncanceled`, `topped-up`, `error` | loading, empty, ready, yearly, currencies, promotion, pending, confirm-cancel, error, refused |
| `<BillingCheckoutLink>` | `data-billing` | none: the link's words are your `default` slot | `default` | `error` | ready, pending, refused |
| `<BillingPortalLink>` | `data-billing` | none: the link's words are your `default` slot | `default` | `error` | ready, pending, refused |
| `<BillingHistory>` | `data-history` | `history` | `header`, `loading`, `empty`, `order`, `pager`, `error`, `footer` | `invoice`, `error` | loading, empty, ready, pending, error |
| `<UsageHistory>` | `data-usage` | `usage` | `header`, `loading`, `empty`, `event`, `pager`, `error`, `footer` | none | loading, empty, ready, pending, error |
| `<AccountData>` | `data-account` | `account` | `export`, `delete`, `error`, `footer` | `exported`, `scheduled`, `kept`, `error` | ready, loading, pending, error, refused, scheduled |
| `<AuditLog>` | `data-audit` | `audit` | `header`, `loading`, `empty`, `event`, `pager`, `error`, `footer` | none | loading, empty, ready, pending, error, refused |
| `<AdminUsers>` | `data-admin` | `admin` | `header`, `loading`, `empty`, `user`, `pager`, `error`, `footer` | `role-changed`, `banned`, `unbanned`, `sessions-revoked`, `impersonated`, `error` | loading, empty, ready, pending, error, refused |
| `<AdminWorkspaces>` | `data-admin` | `admin` | `header`, `loading`, `empty`, `workspace`, `pager`, `error`, `footer` | `impersonated`, `error` | loading, empty, ready, pending, error, refused |
| `<UpgradePrompt>` | `data-upgrade` | `upgrade` | `default`, `message`, `action` | `dismissed` | loading, ready, refused |
| `<CancelFlow>` | `data-cancel-flow` | `cancelFlow` | `question`, `offer`, `end` | `close`, `canceled`, `kept`, `error` | ready, pending, offered, done, error |
| `<WithdrawalButton>` | `data-withdrawal` | `withdrawal` | none | `withdrawn`, `error` | refused |
| `<ReferralCard>` | `data-referral` | `referral` | none | `copied`, `shared`, `error` | ready, loading, error, refused |
| `<WorkspaceSettings>` | `data-settings` | `settings` | `workspaces`, `workspace`, `create`, `billing`, `credits`, `footer` | `workspace-created`, `workspace-switched`, `plan-canceled`, `plan-uncanceled`, `plan-resumed`, `change-canceled`, `topped-up`, `error` | ready, loading, pending, error, refused, trialing, past-due, paused, canceling, changing, confirm-cancel |
| `<Gate>` | `data-quota` | `quota` | `default`, `fallback`, `placeholder`, `error` | none | loading, ready, refused, error |
| `<BackendNotices>` | none: only your slots | none | `impersonation`, `maintenance`, `past-due`, `deletion`, `low-credits`, `gift`, `announcement` | none | empty, ready |
| `<AccessDenied>` | `data-access` | `access` | `title`, `message`, `actions` | `signed-out`, `error` | ready, pending, error |
| `<ReauthenticateDialog>` | `data-reauthenticate` | `reauthenticate` | `choose`, `verify-code`, `error`, `footer` | `reauthenticated`, `cancelled`, `error`, `step` | empty, ready, verify-code, pending, error |
| `<ConnectionStatus>` | `data-connection` | `connection` | `default` | none | empty, ready |
| `<UploadField>` | `data-upload` | `upload` | `default`, `file`, `error` | `update:modelValue`, `error` | ready, uploading, claiming, done, refused, error |
| `<NotificationInbox>` | `data-notifications` | `notifications` | `notification`, `empty` | none | ready, loading, empty, error, pending, refused |
| `<ContactForm>` | `data-contact` | `contact` | `fields`, `sent`, `error` | `sent`, `error` | ready, pending, sent, error, refused |
| `<AppShell>` | `data-shell` | `shell` | `brand`, `nav`, `actions`, `default` | none | ready, loading, refused |
| `<OnboardingFlow>` | `data-onboarding` | `onboarding` | `profile`, `workspace`, `teammates`, `plan` | `done`, `step` | ready, workspace, teammates, plan, pending, done, error |
| `<ActivationChecklist>` | `data-activation` | `activation` | `task`, `congratulations` | `dismissed`, `completed` | ready, loading, empty, pending, done, refused |
| `<HowDidYouHear>` | `data-source` | `source` | `option` | `done`, `error` | ready, loading, pending, error, done, answered, refused |
| `<AiLabel>` | `data-ai-label` | `ai` | `default` | none | ready, done |

<!-- /generated:contract -->

A notice shows nothing when it has nothing to say (empty): what stays is an empty live region it appears in, so the region can stay mounted in a layout. A gate's states are which of your slots it renders.

## By family

Each component has a section on its family's page: the page that renders it, its props, its slots, events and states, and its accessibility guarantee. The table below is generated from the module's registry as the code stands; the components that arrive with their units have their sections on the same pages, and the forms on a page of their own.

<!-- generated:families (pnpm docs:lookups, from src/nuxt/registry.ts) -->

| Component | Page | What it is |
|---|---|---|
| [`<AuthForm>`](/docs/reference/components/account#authform) | Account | The complete passwordless sign-in flow (passkeys + email OTP) in one component: semantic markup where every element carries a `data-auth` attribute, built from parts (`AuthFormChoose`, `AuthFormCode`, …) that a same-named component of the app's replaces, and a slot per step. |
| [`<WaitlistForm>`](/docs/reference/components/account#waitlistform) | Account | Join the waitlist: the address, your questions, the launch-news box (unticked), then the sign-in code that proves the address, then the person's place, a link to share and a way to leave. |
| [`<ReauthenticateDialog>`](/docs/reference/components/account#reauthenticatedialog) | Account | "Confirm it's you": the dialog a sensitive action opens when the server refuses it as `reauthentication_required`. |
| [`<ProfileSettings>`](/docs/reference/components/account#profilesettings) | Account | Account profile: identity chrome (avatar initials, verification / role / workspace badges), display-name editing, the email change, by a code from each address, and, with `@nuxtjs/i18n` and two locales or more, the person's language, which their emails are written in. |
| [`<SecuritySettings>`](/docs/reference/components/account#securitysettings) | Account | Everything that guards the account: passkey management (add / inline rename / remove), active device sessions (revoke one / revoke others), the latest sign-ins from a new device (each signs its session out while it lasts), and signing this browser out. |
| [`<ConsentPrompt>`](/docs/reference/components/account#consentprompt) | Account | Asks for the consents a person has not given at their current version, and nothing else: the required kinds `setupAccount({ consents })` declares after a version rises (the page waits behind a dialog until they are accepted), the age of an account that never answered the minimum age, and, while the app uses optional storage, one question per browser with **Allow** and **Decline** of equal weight. |
| [`<OnboardingFlow>`](/docs/reference/components/account#onboardingflow) | Account | The first run a new account sees once, at `/welcome`: a few short steps. |
| [`<ActivationChecklist>`](/docs/reference/components/account#activationchecklist) | Account | The first tasks that lead to value, with progress, for a page of your app: the tasks `defineActivation` declares, each ticked off when its event is recorded, "2 of 4 done", a link per open task and a Dismiss button. |
| [`<HowDidYouHear>`](/docs/reference/components/account#howdidyouhear) | Account | One optional question after sign-up: "How did you hear about us?". |
| [`<AccountData>`](/docs/reference/components/account#accountdata) | Account | The account's data rights: download everything the app keeps of the account in one file, and delete the account, once the person typed their address to confirm it. |
| [`<WorkspaceSettings>`](/docs/reference/components/workspaces#workspacesettings) | Workspaces and admin | Workspace, plan, and credits management — the billing entity is the active workspace, so switching workspaces switches the subscription. |
| [`<AcceptInvitation>`](/docs/reference/components/workspaces#acceptinvitation) | Workspaces and admin | Accept/decline UI for a workspace-invitation link (`/accept-invitation?id=<invitationId>` — the URL invitation emails point at). |
| [`<AuditLog>`](/docs/reference/components/workspaces#auditlog) | Workspaces and admin | The activity trail as a list, a page at a time: the signed-in account's own (`scope="mine"`, the default), the active workspace's for its owners and admins (`scope="workspace"`), or every event for administrators (`scope="all"`). |
| [`<PricingTable>`](/docs/reference/components/billing#pricingtable) | Billing | A complete pricing table, rendered on the server: plan cards from the live pricing (`usePricing`, the scaffolded `getPricing`), a monthly / yearly switch with what a year saves, subscribe / switch / cancel actions, credit packs compared credit for credit, a contact card, and a customer-portal link. |
| [`<BillingCheckoutLink>`](/docs/reference/components/billing#billingcheckoutlink) | Billing | A link that opens a checkout for the caller's billing entity. |
| [`<BillingPortalLink>`](/docs/reference/components/billing#billingportallink) | Billing | A link that opens the billing customer portal for the caller's billing entity, through the app's `generateCustomerPortalUrl`, on click. |
| [`<BillingHistory>`](/docs/reference/components/billing#billinghistory) | Billing | The customer's past charges with their invoice links — every row read live from the billing provider (this package stores no order ledger), so what renders is what the provider will show on the invoice. |
| [`<UsageHistory>`](/docs/reference/components/billing#usagehistory) | Billing | Metered consumption, event by event, straight from the provider's events API — the same records that drew the credit balance down. |
| [`<UpgradePrompt>`](/docs/reference/components/billing#upgradeprompt) | Billing | What someone whose plan lacks a feature sees: a sentence naming the plans on sale that include it, in pricing order, and a link to the first of them on the pricing page (`/pricing?plan=<key>`). |
| [`<CancelFlow>`](/docs/reference/components/billing#cancelflow) | Billing | Cancelling takes one step; a save offer is one optional step (LIFECYCLE). |
| [`<WithdrawalButton>`](/docs/reference/components/billing#withdrawalbutton) | Billing | The EU withdrawal button (LIFECYCLE; Consumer Rights Directive Art. |
| [`<ReferralCard>`](/docs/reference/components/billing#referralcard) | Billing | A person's referral link, with copy and share buttons and the disclosure of the reward: the link is `/r/<code>` on this site, made the first time the card is read. |
| [`<AdminUsers>`](/docs/reference/components/workspaces#adminusers) | Workspaces and admin | Every account of the app, for its administrators: a search by address, a page at a time (`AdminUsersTable`), and a drawer with one account in full (`AdminUserDrawer`): its role, its ban, its device sessions and workspaces, and "Impersonate". |
| [`<AdminWorkspaces>`](/docs/reference/components/workspaces#adminworkspaces) | Workspaces and admin | Every workspace of the app, read-only, for its administrators: a search by name, a page at a time (`AdminWorkspacesTable`), and a drawer with one workspace's members and open invitations (`AdminWorkspaceDrawer`). |
| [`<Gate>`](/docs/reference/components/shell#gate) | Shell, gates and notices | Renders its content only for the people every check it names admits: signed in (`signed-in`), an app-wide role (`role`), the active workspace or a role in it (`workspace`), a feature of the plan (`feature`), or room left on a quota (`quota`, `amount`). |
| [`<BackendNotices>`](/docs/reference/components/shell#backendnotices) | Shell, gates and notices | One region for every notice that holds for the whole session, on every page: an administrator acting as the account, maintenance, a failed payment, a scheduled deletion, low credits, a gift to claim and announcements. |
| [`<AccessDenied>`](/docs/reference/components/shell#accessdenied) | Shell, gates and notices | What a signed-in person sees when a page is not open to them: the page guard's 403 (`definePageMeta({ auth: { role, workspace, feature } })`) on the module's error page or your app's `error.vue`, or a refusal of your own. |
| [`<ConnectionStatus>`](/docs/reference/components/shell#connectionstatus) | Shell, gates and notices | The live connection's state, in words, for a person: nothing while it is up; "Reconnecting…" once a drop has lasted `delay`; "You're offline." as soon as the browser is; and how many changes wait to be sent meanwhile. |
| [`<UploadField>`](/docs/reference/components/shell#uploadfield) | Shell, gates and notices | A labelled file field that uploads through the upload URL `setupStorage` mints, then calls `claim`, where the deployment checks the file. |
| [`<NotificationInbox>`](/docs/reference/components/shell#notificationinbox) | Shell, gates and notices | What the app told a person, in the app: a button whose accessible name carries the unread count, and the list it opens on the browser's own popover, newest first. |
| [`<ContactForm>`](/docs/reference/components/shell#contactform) | Shell, gates and notices | A contact form for visitors, and a feedback form for signed-in people: the same component. |
| [`<AppShell>`](/docs/reference/components/shell#appshell) | Shell, gates and notices | The frame of a signed-in app, for your layout: a header with your brand and links, the workspace switcher, the notification bell and the account menu, then the app-wide notices, then your page in the `<main>` landmark, with the consent dialog and the connection status closing it. |
| [`<AiLabel>`](/docs/reference/components/shell#ailabel) | Shell, gates and notices | The visible "AI-generated" label the EU AI Act (Art. |

<!-- /generated:families -->

::card-group
  :::card{icon="i-lucide-user-round" title="Account" to="/docs/reference/components/account"}
  Sign-in, the waitlist form, consents, profile, security and the account's data.
  :::

  :::card{icon="i-lucide-building-2" title="Workspaces and admin" to="/docs/reference/components/workspaces"}
  Workspace settings, the invitation page, the activity trail and the admin console.
  :::

  :::card{icon="i-lucide-credit-card" title="Billing" to="/docs/reference/components/billing"}
  Pricing, checkout and portal links, history, usage and the upgrade prompt.
  :::

  :::card{icon="i-lucide-shield" title="Shell, gates and notices" to="/docs/reference/components/shell"}
  The gate, the notice region, the app shell, the notification inbox, the access-denied page and the connection status.
  :::

  :::card{icon="i-lucide-file-up" title="Upload and contact forms" to="/docs/reference/components/forms"}
  The checked upload field and the contact and feedback form.
  :::

  :::card{icon="i-lucide-palette" title="Tokens and data hooks" to="/docs/reference/components/theme-tokens"}
  Every `--bk-*` token with its defaults, every `data-*` family, and the cascade layer.
  :::

  :::card{icon="i-lucide-puzzle" title="Parts" to="/docs/reference/components/parts"}
  Planned: every part the components are built from, with what it receives and the hook it keeps.
  :::
::

## The base module's components

These come from `nuxt-convex-module` and follow its guarantees, not the contract above:

| Component | What it is |
|---|---|
| `<Authenticated>`, `<Unauthenticated>`, `<AuthLoading>`, `<AuthRefreshing>` | The auth-state gates: each renders only your slot |
| `<AuthBoundary>` | The session-expiry boundary: it renders only your slots |
| `<StorageImage>` | The base module's `<ConvexImage>` under a neutral name: an `<img>` with the attributes you pass, `alt` included, and your `default` (while the URL loads) and `missing` slots. It has no words of its own, so the `alt` text is yours |

In development, `<ConvexImage>`, `<CheckoutLink>` and `<CustomerPortalLink>` still render their replacement and warn once, naming it; a production build does not know those names.
