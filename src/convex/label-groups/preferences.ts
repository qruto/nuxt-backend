import type { LabelTree } from '../label-format.js'

/**
 * Email preferences: the profile's Email section (topics and notification
 * channels), the unsubscribe page a topic email's link opens, and the page a
 * double opt-in's confirmation link opens. `channels.<channel>` names a
 * channel.
 */
const PREFERENCES_LABELS = {
  title: 'Email',
  topicsTitle: 'Emails we send you',
  topicsEmpty: 'There are no emails to choose from.',
  pending: 'Check your inbox to confirm.',
  unsubscribeAll: 'Unsubscribe from all',
  unsubscribedAll: 'You will get no more of these emails.',
  saved: 'Saved.',
  channelsTitle: 'Notifications',
  channelsIntro: 'Choose where each kind of notification reaches you.',
  channels: {
    app: 'In the app',
    email: 'By email',
    push: 'Push',
  },
  unsubscribe: {
    title: 'Unsubscribe',
    intro: 'You get this email because you joined {topic}. Leave it with one press.',
    introAll: 'Leave every email we send you with one press.',
    leave: 'Unsubscribe from {topic}',
    leaveAll: 'Unsubscribe from all emails',
    leaving: 'Unsubscribing…',
    done: 'You are unsubscribed from {topic}.',
    doneAll: 'You are unsubscribed from every email we send you.',
    invalid: 'This link does not work. Open the link in the email again.',
    noToken: 'This link has no code. Open the link in the email again.',
    manage: 'Manage your emails',
  },
  confirm: {
    title: 'Confirm your subscription',
    intro: 'Press the button to start receiving {topic}.',
    action: 'Confirm',
    confirming: 'Confirming…',
    done: 'You are subscribed to {topic}.',
    nothing: 'There is nothing to confirm: the link was used already, or it lapsed. Ask again from your profile.',
    noToken: 'This link has no code. Open the link in the email again.',
  },
} satisfies LabelTree

export default PREFERENCES_LABELS
