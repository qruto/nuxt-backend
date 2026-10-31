import type { LabelGroup } from '../../src/convex/labels'

// The component contract: one row per component the module registers from
// its own runtime, saying what a person and an app can rely on. The checks
// that hold each row to the component live beside it:
// - test/nuxt/component-contract.test.ts renders every component in every
//   state its row lists and checks the markup, the roles and the names;
// - test/types/component-contract.test-d.ts checks the typed slot names;
// - test/module/registration.test.ts fails on a registered component that
//   has no row here and is not exempt by name;
// - test/docs/component-contract.test.ts keeps the Components reference
//   page in step with the rows.
// A new component lands with its row. CONTRIBUTING.md ("The component
// contract") says what each column means.

/**
 * The states a row can list. The first six are checked the same way on
 * every component that renders markup of its own:
 * - `ready`: the content, with data;
 * - `loading`: a read in flight: something is `aria-busy`;
 * - `empty`: nothing to show: a polite status says so, or nothing renders;
 * - `error`: a read or an action failed: an `alert` says why;
 * - `pending`: an action in flight: the component is `aria-busy`, and the
 *   button says what it waits for;
 * - `refused`: the caller may not do or see this (signed out, a member who
 *   manages no billing, a role or a feature they lack): no control the
 *   server would refuse.
 * The rest are steps of one component's own flow, each rendered and checked
 * for names and roles like the others.
 */
export type ContractState
  = | 'ready' | 'loading' | 'empty' | 'error' | 'pending' | 'refused'
    | 'request-code' | 'verify-code' | 'passkey-offer' | 'recover' | 'waitlisted' | 'invite-code' | 'age' | 'undeliverable' | 'storage'
    | 'accepted' | 'declined' | 'missing' | 'answered' | 'confirm-current'
    | 'trialing' | 'past-due' | 'paused' | 'canceling' | 'changing' | 'confirm-cancel'
    | 'yearly' | 'currencies' | 'promotion' | 'scheduled'
    | 'uploading' | 'claiming' | 'done' | 'sent'
    | 'workspace' | 'teammates' | 'plan' | 'offered'

/** One component's row. */
export interface ComponentContract {
  /** Its `.vue` file under `src/runtime/vue/components/`, without the extension. */
  file: string
  /**
   * The `data-*` family its markup carries: `data-<family>` on its root and
   * on every element it renders, the hooks its stylesheet and an app's CSS
   * select. `null` for a component that renders only the app's slots.
   */
  family: string | null
  /** Its label group, which its `labels` prop overrides. `null` when every word it shows is the app's. */
  labels: LabelGroup | null
  /** Why `family` or `labels` is `null`. */
  why?: string
  /** Its slot names, exactly as its `SlotsType` declares them. */
  slots: readonly string[]
  /** Its events, exactly as its typed `emits` object declares them. */
  emits: readonly string[]
  /** Every state it can be in, each rendered by the contract test. */
  states: readonly ContractState[]
  /** What it guarantees to a person using assistive technology: the Accessibility page's row. */
  a11y: string
}

/** Every component of the package's own, by its registered name. */
export const COMPONENT_CONTRACT = {
  AuthForm: {
    file: 'auth/AuthForm',
    family: 'auth',
    labels: 'auth',
    slots: ['header', 'choose', 'request-code', 'verify-code', 'passkey-offer', 'recover', 'waitlisted', 'invite-code', 'age', 'undeliverable', 'error', 'footer'],
    emits: ['success', 'error', 'step'],
    states: ['ready', 'request-code', 'verify-code', 'passkey-offer', 'recover', 'waitlisted', 'invite-code', 'age', 'undeliverable', 'pending', 'error'],
    a11y: 'Focus moves to the new step\'s first control when the person moved the form on, and stays put on the step it opens on; a busy button keeps focus (`aria-disabled`) and says what it waits for; a refused field is `aria-invalid` and described by the refusal; the "Last used" mark describes its button and adds no stop; the sent-code note and the passkey offer are polite statuses, a failure an alert; the email field autocompletes as `username webauthn`, where the browser offers saved passkeys, and codes as one-time codes; the age question has a visible label and an empty field and never names the minimum, and the agreement line links each required document; an address the provider stopped delivering to reads as an alert, with the same words for every address, and a button back to the email field.',
  },
  ConsentPrompt: {
    file: 'account/ConsentPrompt',
    family: 'consent',
    labels: 'consent',
    slots: ['consent', 'footer'],
    emits: ['granted', 'error'],
    states: ['ready', 'age', 'storage', 'pending', 'error'],
    a11y: 'A required consent holds the page in a modal dialog named by its title, which Escape does not close; each consent is a checkbox with a visible label that names it, untouched until the person ticks it, and its document is a link beside it; a required one says so in words, and the button stays `aria-disabled` until every required box is ticked; the age field has a visible label and no hint of the minimum; the button keeps focus while the answer is saved (`aria-disabled`) and says so, and a failure is an alert. The question about optional storage is a labelled region, not a wall, whose Allow and Decline are the same kind of button.',
  },
  WaitlistForm: {
    file: 'auth/WaitlistForm',
    family: 'waitlist',
    labels: 'waitlist',
    slots: ['join', 'verify', 'status'],
    emits: ['joined', 'signed-in', 'left', 'error'],
    states: ['ready', 'verify-code', 'waitlisted', 'pending', 'error'],
    a11y: 'Every field has a visible label, and the launch-news box is unticked until the person ticks it; the sent-code note is a polite status, a refusal an alert that the refused field is described by and marks `aria-invalid`; a busy button keeps focus (`aria-disabled`) and says what it waits for, and the wrapper is `aria-busy`; the place is a polite status that reads in words, the honest words about admission sit beside it, and the share link is a labelled read-only field with a copy button; no names and no leaderboards are ever shown.',
  },
  ProfileSettings: {
    file: 'account/ProfileSettings',
    family: 'profile',
    labels: 'profile',
    slots: ['identity', 'name', 'email', 'language', 'preferences', 'footer'],
    emits: ['name-saved', 'email-changed', 'error'],
    states: ['ready', 'confirm-current', 'pending', 'error'],
    a11y: 'Every field has a visible label; a refused address or code is `aria-invalid` and described by its hint and the refusal; focus moves to the code once the person asked for one; a busy button keeps focus (`aria-disabled`) and says what it waits for; an outcome is a polite status, a failure an alert.',
  },
  SecuritySettings: {
    file: 'account/SecuritySettings',
    family: 'security',
    labels: 'security',
    slots: ['passkeys', 'passkey', 'sessions', 'session', 'alerts', 'danger', 'footer'],
    emits: ['passkey-added', 'passkey-removed', 'session-revoked', 'sessions-revoked', 'signed-out', 'error'],
    states: ['ready', 'loading', 'pending', 'error'],
    a11y: 'Each row\'s buttons are named after the passkey or the session they act on; the rename field is named and takes focus when the person starts a rename; a busy button keeps focus (`aria-disabled`) and says what it waits for; when the button pressed goes with its action (a revoked session, a removed passkey, no other session left), focus moves to the outcome or the next button of its section; the session list\'s loading note is a polite status and its failure an alert; each alert is one sentence naming the device and the time, and its sign-out button names the device it signs out.',
  },
  AcceptInvitation: {
    file: 'workspaces/AcceptInvitation',
    family: 'invitation',
    labels: 'invitation',
    slots: ['loading', 'ready', 'accepted', 'declined', 'missing', 'error'],
    emits: ['accepted', 'declined', 'error'],
    states: ['loading', 'ready', 'pending', 'accepted', 'declined', 'missing', 'error'],
    a11y: 'Every message is a live region: an outcome a polite status, a dead link or a failure an alert; the wrapper is `aria-busy` while the invitation loads and while an answer is on its way, and the answering button says so and keeps focus (`aria-disabled`).',
  },
  PricingTable: {
    file: 'billing/PricingTable',
    family: 'pricing',
    labels: 'pricing',
    slots: ['header', 'interval', 'currency', 'loading', 'empty', 'plan', 'plan-action', 'contact', 'packs', 'pack', 'portal', 'error', 'footer'],
    emits: ['update:interval', 'checkout', 'plan-changed', 'canceled', 'uncanceled', 'topped-up', 'error'],
    states: ['loading', 'empty', 'ready', 'yearly', 'currencies', 'promotion', 'pending', 'confirm-cancel', 'error', 'refused'],
    a11y: 'The monthly / yearly switch is a fieldset of radios sharing one name under a legend, so the arrow keys move between them and the choice is announced; the currency switch is a select inside its label, each currency named in the reader\'s language; a promotion is a line of text on each price it applies to, its name, its terms, the regular price after it and its end as a date, never a countdown or a struck-through price; each plan, pack and the contact card is a group named by its name, which also describes its buttons, so a row of the same words reads apart in any language; the current plan\'s "Cancel plan" says whether it is expanded and opens one group named by its first line, with what ends when and one button that cancels, nothing else; Escape or the same button closes it and keeps focus there, and once the cancellation went through focus stays on the plan\'s button; a busy button keeps focus (`aria-disabled`), says what it waits for, and a status announces it; loading and empty are polite statuses, a failure an alert; the table is `aria-busy` while the plans load or an action runs; a member who manages no billing reads one note instead of buttons.',
  },
  BillingCheckoutLink: {
    file: 'billing/BillingCheckoutLink',
    family: 'billing',
    labels: null,
    why: 'The link\'s words are the app\'s default slot, which receives `pending`.',
    slots: ['default'],
    emits: ['error'],
    states: ['ready', 'pending', 'refused'],
    a11y: 'A real link, named by your slot; `aria-busy` and `aria-disabled` while the checkout is being created, keeping focus; nothing at all for a caller who manages no billing.',
  },
  BillingPortalLink: {
    file: 'billing/BillingPortalLink',
    family: 'billing',
    labels: null,
    why: 'The link\'s words are the app\'s default slot, which receives `pending`.',
    slots: ['default'],
    emits: ['error'],
    states: ['ready', 'pending', 'refused'],
    a11y: 'A real link, named by your slot; `aria-busy` and `aria-disabled` while the portal session is being created, keeping focus; nothing at all for a caller who manages no billing.',
  },
  BillingHistory: {
    file: 'billing/BillingHistory',
    family: 'history',
    labels: 'history',
    slots: ['header', 'loading', 'empty', 'order', 'pager', 'error', 'footer'],
    emits: ['invoice', 'error'],
    states: ['loading', 'empty', 'ready', 'pending', 'error'],
    a11y: 'Each charge is a group named by its date and description, which also describe its invoice button; loading and empty are polite statuses, a failure an alert with no empty note beside it; a busy invoice or pager button keeps focus (`aria-disabled`), says what it waits for, and a status announces it; once no page is left in a pager button\'s direction, focus moves to the other one; `aria-busy` while a page or an invoice loads.',
  },
  UsageHistory: {
    file: 'billing/UsageHistory',
    family: 'usage',
    labels: 'usage',
    slots: ['header', 'loading', 'empty', 'event', 'pager', 'error', 'footer'],
    emits: [],
    states: ['loading', 'empty', 'ready', 'pending', 'error'],
    a11y: 'Loading and empty are polite statuses, a failure an alert with no empty note beside it; `aria-busy` while a page loads; the pager button pressed keeps focus (`aria-disabled`) and says the page loads, a status announcing it, and once no page is left in its direction focus moves to the other one.',
  },
  AccountData: {
    file: 'account/AccountData',
    family: 'account',
    labels: 'account',
    slots: ['export', 'delete', 'error', 'footer'],
    emits: ['exported', 'scheduled', 'kept', 'error'],
    states: ['ready', 'loading', 'pending', 'error', 'refused', 'scheduled'],
    a11y: 'Each section is a region named by its heading; the confirmation field has a visible label naming the address to type, and a hint it is described by, which says so when the address typed is not the account\'s, the field then `aria-invalid`; the delete button stays focusable and `aria-disabled` until the address matches; Enter in the field schedules the deletion as the button does; once a deletion is scheduled the section says when it happens in words and offers one button that keeps the account; a busy button keeps focus (`aria-disabled`) and says what it waits for, and once the file is ready focus moves to its download link; the outcome is a polite status, a failure an alert; an administrator acting as the account reads a note instead of either control.',
  },
  AuditLog: {
    file: 'workspaces/AuditLog',
    family: 'audit',
    labels: 'audit',
    slots: ['header', 'loading', 'empty', 'event', 'pager', 'error', 'footer'],
    emits: [],
    states: ['loading', 'empty', 'ready', 'pending', 'error', 'refused'],
    a11y: 'Each event is one sentence with its time as a `<time>`, then what the sentence leaves out; loading and empty are polite statuses, a failure an alert with no empty note beside it; `aria-busy` while a page loads; the pager button pressed keeps focus (`aria-disabled`) and says the page loads, a status announcing it, and once no page is left in its direction focus moves to the other one.',
  },
  AdminUsers: {
    file: 'admin/AdminUsers',
    family: 'admin',
    labels: 'admin',
    slots: ['header', 'loading', 'empty', 'user', 'pager', 'error', 'footer'],
    emits: ['role-changed', 'banned', 'unbanned', 'sessions-revoked', 'impersonated', 'error'],
    states: ['loading', 'empty', 'ready', 'pending', 'error', 'refused'],
    a11y: 'The accounts are a table with a header row, each row headed by its account, whose name also names its "View" button; the search is a labelled search field in a `search` landmark; "View" opens a native modal dialog named by the account, which takes focus on its close button, keeps it inside, closes on Escape or "Close" and gives focus back to the "View" pressed; every field in it has a visible label; a busy button keeps focus (`aria-disabled`) and says what it waits for; an outcome is a polite status, a failure an alert; loading and empty are polite statuses; nothing at all for a caller who is no administrator.',
  },
  AdminWorkspaces: {
    file: 'admin/AdminWorkspaces',
    family: 'admin',
    labels: 'admin',
    slots: ['header', 'loading', 'empty', 'workspace', 'pager', 'error', 'footer'],
    emits: ['impersonated', 'error'],
    states: ['loading', 'empty', 'ready', 'pending', 'error', 'refused'],
    a11y: 'The workspaces are a table with a header row, each row headed by its workspace, whose name also names its "View" button; the search is a labelled search field in a `search` landmark; "View" opens a native modal dialog named by the workspace, which says it is read-only, takes focus on its close button, closes on Escape or "Close" and gives focus back; each member\'s "Impersonate" is named by the member; a busy button keeps focus (`aria-disabled`) and says what it waits for; a failure is an alert; nothing at all for a caller who is no administrator.',
  },
  UpgradePrompt: {
    file: 'billing/UpgradePrompt',
    family: 'upgrade',
    labels: 'upgrade',
    slots: ['default', 'message', 'action'],
    emits: ['dismissed'],
    states: ['loading', 'ready', 'refused'],
    a11y: 'The sentence is a polite status, so the plans it names are announced as they load, and the prompt is `aria-busy` until they have; the action is a real link, named by the plan it opens, and the one stop the prompt adds; a member who manages no billing reads who to ask instead, with no link.',
  },
  CancelFlow: {
    file: 'billing/CancelFlow',
    family: 'cancel-flow',
    labels: 'cancelFlow',
    slots: ['question', 'offer', 'end'],
    emits: ['close', 'canceled', 'kept', 'error'],
    states: ['ready', 'pending', 'offered', 'done', 'error'],
    a11y: 'The flow is a region named by its heading; the reasons are a group of radio buttons named by the optional question, and the comment a field with a visible label; "Cancel my plan" is a button on every step and finishes at once; the offer is a polite status with its real terms, and its accept button looks like "Cancel my plan", with no countdown; the end is a status that says when the plan ends, with "Keep my plan"; Escape closes the flow except while a step is on its way; a busy button keeps focus (`aria-disabled`) and says what it waits for; a failure is an alert.',
  },
  WithdrawalButton: {
    file: 'billing/WithdrawalButton',
    family: 'withdrawal',
    labels: 'withdrawal',
    slots: [],
    emits: ['withdrawn', 'error'],
    states: ['refused'],
    a11y: 'A real button labelled "Withdraw from contract here" that says what it controls; its confirm step is a group named by its question, with "Confirm withdrawal" and "Go back", and Escape goes back; the receipt is a status with the date and time; a busy button keeps focus and says what it waits for; a failure is an alert; nothing at all outside the withdrawal period or for a member who manages no billing.',
  },
  ReferralCard: {
    file: 'billing/ReferralCard',
    family: 'referral',
    labels: 'referral',
    slots: [],
    emits: ['copied', 'shared', 'error'],
    states: ['ready', 'loading', 'error', 'refused'],
    a11y: 'A section named by its heading; the link is a read-only field with a visible label, described by the text shared with it, so it can be selected by hand where the clipboard is refused; "Copy link" says when it copied, and "Share" appears only where the browser has a share sheet; the friends it brought are a polite status; the choice to carry the code on shared pages is a checkbox with a visible label and a note; loading is a busy polite status, a failure an alert; nothing renders for a signed-out visitor.',
  },
  WorkspaceSettings: {
    file: 'workspaces/WorkspaceSettings',
    family: 'settings',
    labels: 'settings',
    slots: ['workspaces', 'workspace', 'create', 'billing', 'credits', 'footer'],
    emits: ['workspace-created', 'workspace-switched', 'plan-canceled', 'plan-uncanceled', 'plan-resumed', 'change-canceled', 'topped-up', 'error'],
    states: ['ready', 'loading', 'pending', 'error', 'refused', 'trialing', 'past-due', 'paused', 'canceling', 'changing', 'confirm-cancel'],
    a11y: 'Each workspace row is named by its name and slug, which also describe its switch button; the active row is `aria-current` and, in the default rows (not a `workspace` slot of yours), takes focus once a switch the person made has landed; the plan\'s state is words (a trial, a failed payment, a pause, a cancellation or a change and its date), never colour alone; "Cancel plan" says whether it is expanded and opens one group named by its heading, with what ends when and one button that cancels, nothing else; Escape or the same button closes it and keeps focus there, and once a cancellation went through focus moves to the plan\'s state; a busy button keeps focus, and a status announces what it waits for, the outcome, that the plan or the credits load, and that a purchase is being finished; the create field has a visible label; a failure is an alert.',
  },
  Gate: {
    file: 'shell/Gate',
    family: 'quota',
    labels: 'quota',
    slots: ['default', 'fallback', 'placeholder', 'error'],
    emits: [],
    states: ['loading', 'ready', 'refused', 'error'],
    a11y: 'Renders exactly one slot, so each state is as accessible as what you put in it; never the content while the checks load (the placeholder, on the server render too), and never the content or the fallback when the plan cannot be read. With `quota` and no slot of yours: loading is a busy polite status, a failed read an alert, and with no room left a polite status says how many are used of how many and names the plans that allow more, its one stop a real link, named by the plan it opens, or for a member who manages no billing who to ask instead.',
  },
  BackendNotices: {
    file: 'shell/BackendNotices',
    family: null,
    labels: null,
    why: 'Each notice is its own family and reads its own label group: `impersonation`, `maintenance`, `deletion`, `credits`, `gift` and `announcement`.',
    slots: ['impersonation', 'maintenance', 'past-due', 'deletion', 'low-credits', 'gift', 'announcement'],
    emits: [],
    states: ['empty', 'ready'],
    a11y: 'One region, empty while no notice applies, each notice inside it in order of importance: a complementary region named in words for an administrator\'s visit, for maintenance and for a scheduled deletion, never by colour alone, and polite live regions that announce low credits, a gift to claim and an announcement, each announcement a group named by its words with a Dismiss button that names it too; "Keep my account" keeps focus while the deletion is cancelled and says so; "Stop impersonating" keeps focus while the visit ends and says so; a dismissed notice leaves focus where it was, or on the next announcement\'s Dismiss button when its own went with it; a failure is an alert.',
  },
  AccessDenied: {
    file: 'shell/AccessDenied',
    family: 'access',
    labels: 'access',
    slots: ['title', 'message', 'actions'],
    emits: ['signed-out', 'error'],
    states: ['ready', 'pending', 'error'],
    a11y: 'A region named by its heading, which takes focus on the error page when the link that led there went away; the reason and the signed-in account are text, not colour; the switch-account button keeps focus while signing out (`aria-disabled`) and says so; a failed sign-out is an alert.',
  },
  ReauthenticateDialog: {
    file: 'auth/ReauthenticateDialog',
    family: 'reauthenticate',
    labels: 'reauthenticate',
    slots: ['choose', 'verify-code', 'error', 'footer'],
    emits: ['reauthenticated', 'cancelled', 'error', 'step'],
    states: ['empty', 'ready', 'verify-code', 'pending', 'error'],
    a11y: 'A native modal dialog named by its heading: it opens on its first control, keeps focus inside, closes on Escape or "Cancel", and gives focus back to the control that opened it; the code field has a visible label, autocompletes as a one-time code and is described by the sent-code note, a polite status; a busy button keeps focus (`aria-disabled`) and says what it waits for; a failure is an alert. Nothing renders until a sensitive action asks.',
  },
  ConnectionStatus: {
    file: 'shell/ConnectionStatus',
    family: 'connection',
    labels: 'connection',
    slots: ['default'],
    emits: [],
    states: ['empty', 'ready'],
    a11y: 'An empty polite live region stays mounted, and the words appear in it once a drop has lasted the delay or the browser goes offline, so they are announced; nothing to press, since the client reconnects and sends the waiting changes on its own.',
  },
  UploadField: {
    file: 'shell/UploadField',
    family: 'upload',
    labels: 'upload',
    slots: ['default', 'file', 'error'],
    emits: ['update:modelValue', 'error'],
    states: ['ready', 'uploading', 'claiming', 'done', 'refused', 'error'],
    a11y: 'The field is named by its visible label; the picker is a button that opens the browser\'s own file dialog, so the keyboard path needs no drop; while a file uploads it shows a labelled progress bar and a Cancel button, and the field is `aria-busy`; each step (uploading, checking, done, canceled) is said in a polite status, and a refusal is an alert the input is described by.',
  },
  NotificationInbox: {
    file: 'shell/NotificationInbox',
    family: 'notifications',
    labels: 'notifications',
    slots: ['notification', 'empty'],
    emits: [],
    states: ['ready', 'loading', 'empty', 'error', 'pending', 'refused'],
    a11y: 'The button\'s accessible name carries the unread count ("Notifications, 3 unread"), and the badge beside it is hidden from assistive technology so the count is not read twice; the list is a non-modal popover named by its heading, which the browser closes on Escape and light dismiss and returns focus from to the button; an unread notification says so in a hidden word beside the dot, a notification without a place to go is a button that marks it read, and the first page loads in a polite status, an empty inbox says so in one, and a failure is an alert. A signed-out visitor gets nothing to press.',
  },
  ContactForm: {
    file: 'shell/ContactForm',
    family: 'contact',
    labels: 'contact',
    slots: ['fields', 'sent', 'error'],
    emits: ['sent', 'error'],
    states: ['ready', 'pending', 'sent', 'error', 'refused'],
    a11y: 'Every field has a visible label, and the message is described by a line that gives its length range and count; the honeypot is hidden from people and from assistive technology; the send button stays focused while the message is on its way (`aria-disabled`) and says so; a persistent polite live region announces the sending and the confirmation, and a refusal is an alert the field it names is described by, worded to say what to do next.',
  },
  AppShell: {
    file: 'shell/AppShell',
    family: 'shell',
    labels: 'shell',
    slots: ['brand', 'nav', 'actions', 'default'],
    emits: [],
    states: ['ready', 'loading', 'refused'],
    a11y: 'The first stop is a skip link to the page; the header is the one banner landmark, the app\'s links sit in a navigation landmark named by the `navigation` label, and the page is the one `main` landmark. The account menu and the workspace switcher are disclosures on the browser\'s own popover: the button names the account or the workspace first and says what it opens, Escape or a click outside closes the panel and focus returns to the button, and the open state is `aria-expanded`. The current workspace is `aria-current` and says so in words, a role is a word and never a colour, and a switch, a creation and a sign-out are said in a polite status, a failure in an alert. A busy button keeps focus (`aria-disabled`).',
  },
  OnboardingFlow: {
    file: 'account/OnboardingFlow',
    family: 'onboarding',
    labels: 'onboarding',
    slots: ['profile', 'workspace', 'teammates', 'plan'],
    emits: ['done', 'step'],
    states: ['ready', 'workspace', 'teammates', 'plan', 'pending', 'done', 'error'],
    a11y: 'The steps are an ordered list named by the `steps` label, the current one `aria-current="step"` and the done ones marked in words by their state, with the position in words ("Step 2 of 4") beside it; when the person moves on, focus moves to the new step\'s section so a screen reader starts at its heading, and a polite status says where they are; every field has a visible label, a refused picture address is `aria-invalid` and described by its hint; a busy button keeps focus (`aria-disabled`) and says what it waits for, the flow is `aria-busy`, a failure is an alert, and every step can be skipped from the keyboard.',
  },
  ActivationChecklist: {
    file: 'account/ActivationChecklist',
    family: 'activation',
    labels: 'activation',
    slots: ['task', 'congratulations'],
    emits: ['dismissed', 'completed'],
    states: ['ready', 'loading', 'empty', 'pending', 'done', 'refused'],
    a11y: 'It is a region named by its title; the progress is the native `<progress>` named "Progress" with the count in words ("2 of 4 done"); each task is a list item that says done or to do in words, never by its mark alone, and an open task is a link named by its label; the Dismiss button keeps focus while it runs (`aria-disabled`) and says so; the congratulation is a polite status in a region that stays mounted so it is announced, and an administrator\'s read-only view says so in place of the button.',
  },
  HowDidYouHear: {
    file: 'account/HowDidYouHear',
    family: 'source',
    labels: 'source',
    slots: ['option'],
    emits: ['done', 'error'],
    states: ['ready', 'loading', 'pending', 'error', 'done', 'answered', 'refused'],
    a11y: 'It is a form named by its question, the answers a radio group in a fieldset whose legend is the question and whose hint describes each answer; the "Somewhere else" field appears once its answer is picked, with a visible label; Continue keeps focus while it saves (`aria-disabled`) and says so, and Skip waits with it; a failure is an alert, and the thanks, the note to someone who answered before and the loading are a polite status in a region that stays mounted.',
  },
  AiLabel: {
    file: 'shell/AiLabel',
    family: 'ai-label',
    labels: 'ai',
    slots: ['default'],
    emits: [],
    states: ['ready', 'done'],
    a11y: 'Plain text that says the content is AI-generated, never a colour or an icon alone; with a provenance record it is a button that opens its details as a native popover (opened and closed by the keyboard, Escape closing it and focus returning to the button), a dialog named by its heading, whose verify link says where it goes.',
  },
} as const satisfies Record<string, ComponentContract>

/** A contracted component's registered name. */
export type ContractedComponent = keyof typeof COMPONENT_CONTRACT

/**
 * Components an app sees that the contract does not cover, by name, each
 * with its reason: the base module's own components, which follow its
 * guarantees, and the development-only stand-ins for renamed ones.
 */
export const CONTRACT_EXEMPT: Readonly<Record<string, string>> = {
  Authenticated: 'The base module\'s auth-state gate: it renders only your slot.',
  Unauthenticated: 'The base module\'s auth-state gate: it renders only your slot.',
  AuthLoading: 'The base module\'s auth-state gate: it renders only your slot.',
  AuthRefreshing: 'The base module\'s auth-state gate: it renders only your slot.',
  AuthBoundary: 'The base module\'s session-expiry boundary: it renders only your slots.',
  StorageImage: 'The base module\'s `<ConvexImage>` under a neutral name: an `<img>` with the attributes you pass, `alt` included, and your `default` (loading) and `missing` slots; no words of its own.',
  ConvexImage: 'A development-only stand-in: it renders `<StorageImage>` and warns once to rename it.',
  CheckoutLink: 'A development-only stand-in: it renders `<BillingCheckoutLink>` and warns once to rename it.',
  CustomerPortalLink: 'A development-only stand-in: it renders `<BillingPortalLink>` and warns once to rename it.',
}
