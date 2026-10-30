import type { LabelTree } from '../label-format.js'

/**
 * `<NotificationInbox>`: the words around the list, and the words of every
 * kind of the catalog that notifies, as a `title` and a `body` under the
 * kind's area (`workspace.member_removed.title`). A kind of an app's own
 * has its words under its type without `app.` (`strip_shared.title`).
 * Placeholders: `{actor}` is who did it, `{workspace}` the workspace it
 * happened in, `{amount}` an amount in its currency, and the rest are the
 * kind's own fields (`{role}`, `{balance}`). The component's own keys
 * always hold a capital letter, so they never meet a kind's.
 */
const NOTIFICATIONS_LABELS = {
  // The button's name, and its name with the unread count: spoken, not only shown.
  bellName: 'Notifications',
  bellNameUnread: 'Notifications, {count} unread',
  bellNameUnreadMore: 'Notifications, more than {count} unread',
  // The count on the button when there are more than it shows.
  countMore: '{count}+',
  listName: 'Notifications',
  markAllRead: 'Mark all as read',
  markingRead: 'Marking as read…',
  markRead: 'Mark as read',
  // Visually hidden before an unread notification's words.
  unreadMark: 'Unread',
  emptyInbox: 'You are all caught up.',
  loadMore: 'Show older',
  loadingInbox: 'Loading notifications…',
  closeInbox: 'Close',
  // The words for who did it, when no name is known.
  actorSomeone: 'Someone',
  actorAdministrator: 'An administrator',
  actorApp: 'The app',
  actorErased: 'A former member',
  workspaceUnnamed: 'a workspace',
  // A kind with no words of its own: an app's kind nobody wrote labels for.
  fallbackTitle: 'New activity',
  // A notification by email: its button, and the line under it.
  emailOpen: 'Open',
  emailNote: 'You can choose which notifications reach you by email on your profile.',
  auth: {
    passkey_added: { title: 'A passkey was added', body: 'If this was not you, remove it in your security settings.' },
    passkey_removed: { title: 'A passkey was removed', body: 'If this was not you, review your security settings.' },
    passkey_only_changed: { title: 'Passkey-only sign-in changed', body: 'Review how you sign in in your security settings.' },
    email_changed: { title: 'Your email address changed', body: 'If this was not you, review your security settings right away.' },
    new_device: { title: 'New sign-in to your account', body: 'A device you had not used before signed in. If this was not you, sign it out in your security settings.' },
  },
  workspace: {
    invitation_accepted: { title: '{actor} joined {workspace}', body: 'They accepted your invitation.' },
    member_removed: { title: 'You were removed from {workspace}', body: 'You no longer have access to it.' },
    member_role_changed: { title: 'Your role in {workspace} changed', body: 'You are now {role}.' },
  },
  admin: {
    role_changed: { title: 'Your role changed', body: 'An administrator set your role to {role}.' },
  },
  billing: {
    plan_changed: { title: 'The plan of {workspace} changed', body: '{actor} changed the subscription.' },
    subscription_created: { title: 'A subscription started', body: 'The plan of {workspace} is active.' },
    subscription_canceled: { title: 'A subscription was canceled', body: 'It stays active until the end of the period.' },
    subscription_revoked: { title: 'A subscription ended', body: 'The plan of {workspace} is no longer active.' },
    subscription_past_due: { title: 'A payment failed', body: 'Update the payment method of {workspace} to keep its plan.' },
    order_paid: { title: 'Payment received', body: 'An order of {amount} was paid.' },
    order_refunded: { title: 'An order was refunded', body: '{amount} was refunded.' },
    credits_low: { title: 'Credits are running low', body: '{balance} credits are left in {workspace}.' },
    credits_exhausted: { title: 'Credits ran out', body: 'Top up {workspace} to keep going.' },
    save_offer_accepted: { title: 'The plan of {workspace} was kept', body: '{actor} took an offer instead of canceling.' },
    contract_withdrawn: { title: 'A purchase was withdrawn', body: '{actor} withdrew from the plan of {workspace}.' },
    trial_pass_started: { title: 'Your trial started', body: '{workspace} has the full plan for the trial, with no card.' },
  },
  gift: {
    purchased: { title: 'A gift was bought', body: 'Its recipient was told.' },
    claimed: { title: 'A gift was claimed', body: 'It landed in {workspace}.' },
    pass_started: { title: 'A plan pass started', body: '{workspace} has the gifted plan, with no card and no renewal.' },
    pass_ending: { title: 'A plan pass ends in a week', body: 'Choose the plan for {workspace} to keep it.' },
    pass_ended: { title: 'A plan pass ended', body: 'The gifted plan of {workspace} is over.' },
    refunded: { title: 'A gift was refunded', body: 'It was refunded before anyone claimed it.' },
  },
  referral: {
    claimed: { title: 'Someone signed up with your link', body: 'Your reward follows once their hold passes.' },
    rewarded: { title: 'A referral was rewarded', body: 'Your reward was granted.' },
  },
  email: {
    bounced: { title: 'An email to you bounced', body: 'Check that your address is right and still open.' },
  },
} satisfies LabelTree

export default NOTIFICATIONS_LABELS
