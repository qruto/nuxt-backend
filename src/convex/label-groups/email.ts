import type { LabelTree } from '../label-format.js'

/** The emails the package sends: subjects, sentences and buttons. */
const EMAIL_LABELS = {
  // The layout every email shares.
  layout: {
    // The footer, the app's name linked to its site.
    sentBy: 'Sent by {brand}',
    // A topic email's footer link to leave the topic.
    unsubscribe: 'Unsubscribe',
  },
  link: {
    fallback: 'Or paste this link into your browser:',
  },
  // The ready-made lifecycle flows (`setupEmail({ lifecycle })`): each one's email, which `email sync`
  // makes its template at the provider in the default language. Edit them there, or here before the sync.
  lifecycle: {
    welcome: { subject: 'Welcome to {brand}', heading: 'Welcome to {brand}', body: 'Your account is ready. Here is where to start.', action: 'Get started' },
    activationNudge: { subject: 'Your first one is a minute away', heading: 'Ready when you are', body: 'You signed up yesterday and haven\'t made anything yet. It takes a minute to start.', action: 'Start now' },
    firstResult: { subject: 'Your first result is ready', heading: 'It\'s ready', body: 'What you made in {brand} is ready to see.', action: 'See it' },
    creditsLow: { subject: 'Your credits are running low', heading: 'Credits running low', body: 'Your balance has reached its low mark. Add credits to keep going without a pause.', action: 'Add credits' },
    trialEnding: { subject: 'Your trial ends in 7 days', heading: 'Your trial ends in a week', body: 'Your plan continues when the trial ends. Change or cancel it any time before then.', action: 'Review your plan' },
    checkoutAbandoned: { subject: 'Still thinking it over?', heading: 'Your checkout is waiting', body: 'You started a checkout yesterday and didn\'t finish. Pick it up whenever you\'re ready.', action: 'See the plans' },
    winBack: { subject: 'We\'d like to have you back', heading: 'Come back to {brand}', body: 'Your plan has ended, and your account is still here. Pick a plan again any time.', action: 'See the plans' },
    stalled: { subject: 'It\'s been a while', heading: 'We kept your place', body: 'You haven\'t been back in two weeks. Everything you made is where you left it.', action: 'Pick up where you left off' },
    annualSwitch: { subject: 'Save with yearly billing', heading: 'Pay yearly, pay less', body: 'You\'ve paid monthly three times. The yearly price costs less over a year.', action: 'See yearly prices' },
    reviewAsk: { subject: 'How is {brand} working for you?', heading: 'A minute of your time?', body: 'You\'ve been using {brand} for a week. A short review helps other people find it.', action: 'Leave a review' },
  },
  // An announcement's broadcast: the button to its link, when the administrator gave it no words.
  announcement: {
    action: 'Read more',
  },
  otp: {
    subject: {
      'sign-in': 'Your sign-in code',
      // Also the code an email change sends to the current address first.
      'email-verification': 'Confirm your email address',
      'forget-password': 'Reset your password',
      'change-email': 'Confirm your new email',
    },
    expiry: 'This code expires shortly. If you didn\'t request it, you can ignore this email.',
    // A sign-in code asked for a passkey-only account: none is sent.
    passkeyOnly: {
      subject: 'Sign in with your passkey',
      intro: 'Someone asked for a sign-in code for your account. Your account signs in with a passkey only, so no code was sent.',
      recover: 'If you lost your passkey, choose "Lost your passkey?" on the sign-in page and use your recovery code. If you didn\'t ask, you can ignore this email.',
    },
    // The first code of an email change, to the current address.
    emailChange: {
      subject: 'Confirm your email change',
      intro: 'Enter this code to confirm you want to change the email address on your account.',
      warning: 'If you didn\'t ask for this, someone may be signed in to your account. Sign out of your other sessions.',
    },
  },
  // Where a request came from, under a code: "Requested from Chrome on macOS, near Lisbon, Portugal, at 27 Oct 2026, 14:02 WET."
  origin: {
    summary: 'Requested from {details}.',
    device: '{browser} on {os}',
    place: 'near {place}',
    time: 'at {time}',
  },
  // A sign-in from a device the account had not used before.
  newDevice: {
    subject: 'New sign-in to your account',
    intro: 'Your account was just signed in from a device it had not used before.',
    warning: 'If this wasn\'t you, sign that device out now.',
    action: 'Review your devices',
  },
  // A passkey-only account's recovery code signed in.
  passkeyRecovered: {
    subject: 'Your recovery code was used',
    intro: 'Your recovery code was just used to sign in to your account, and a new passkey must be saved before anything else.',
    warning: 'If this wasn\'t you, sign every other device out now.',
    action: 'Review your devices',
  },
  emailChanged: {
    subject: 'Your email address was changed',
    intro: 'The email address on your account is now {newEmail}.',
    warning: 'If you didn\'t make this change, contact us right away.',
  },
  deletionScheduled: {
    subject: 'Your account is scheduled for deletion',
    intro: 'Your account will be deleted on {date}. Until then it works as before.',
    warning: 'If you didn\'t ask for this, keep your account and sign out of your other sessions.',
    action: 'Keep my account',
  },
  deletionCanceled: {
    subject: 'Your account is kept',
    body: 'The deletion of your account is cancelled, and nothing was deleted.',
  },
  welcome: {
    subject: 'Welcome aboard',
    greeting: 'Welcome!',
    greetingNamed: 'Welcome, {name}!',
    body: 'Your account is ready — thanks for joining us.',
  },
  invite: {
    subject: 'Join {workspace}',
    intro: '{inviter} invited you to join {workspace} as {role}.',
    action: 'Accept invitation',
  },
  gift: {
    subject: '{sender} sent you a gift 🎁',
    intro: '{sender} sent you a gift: {item}. Sign in to receive it.',
    sender: 'Someone',
    action: 'Receive your gift',
    // A plan pass: {count} months of {plan}.
    itemPass: '{count} month of {plan} | {count} months of {plan}',
    // The one reminder, a week after.
    reminderSubject: 'Your gift from {sender} is still waiting',
    reminderIntro: '{sender} sent you a gift: {item}. It is still waiting for you. Sign in to receive it.',
  },
  giftPassEnding: {
    subject: 'Your {plan} pass ends on {date}',
    intro: 'The {plan} plan a friend gave {workspace} ends on {date}. Keep it and nothing changes; otherwise the workspace goes back to the free plan and keeps everything it made.',
    action: 'Keep {plan}',
    workspace: 'your workspace',
    // A reverse trial's pass: nobody gave it.
    trialIntro: 'The {plan} trial of {workspace} ends on {date}. Keep {plan} and nothing changes; otherwise the workspace goes back to the free plan and keeps everything it made.',
  },
  renewalReminder: {
    subject: 'Your {plan} plan renews automatically',
    // {every}: one of `every` below.
    intro: 'A reminder of your {plan} plan: it renews automatically at {price} {every}. The next renewal is on {date}.',
    cancel: 'You can cancel online at any time before a renewal, and the plan stays until the end of the period you paid for.',
    action: 'Manage your plan',
    every: {
      day: 'every day | every {count} days',
      week: 'every week | every {count} weeks',
      month: 'every month | every {count} months',
    },
  },
  withdrawalReceipt: {
    subject: 'We received your withdrawal from {plan}',
    intro: 'We received your withdrawal from the {plan} contract on {at} (UTC).',
    next: 'The plan has ended. Any refund due is sent to the original payment method within 14 days.',
  },
  waitlistConfirmation: {
    subject: 'You\'re on the waitlist',
    intro: 'You\'re #{position} of {total} on the waitlist.',
    introUnplaced: 'You\'re on the waitlist.',
    note: 'We admit in waves and may also admit by other criteria. Your place can change. Use this link to check it any time. It needs no sign-in code, so keep the email to yourself.',
    action: 'See your place',
  },
  topicConfirmation: {
    subject: 'Confirm: {topic}',
    intro: 'You asked to receive {topic}. Confirm with one press, and it starts.',
    note: 'If you didn\'t ask, ignore this email: nothing is sent until you confirm. The link works for 7 days.',
    action: 'Confirm',
  },
  // An invitation by address an administrator chose to email ("Email them" on the Access tab).
  accessInvitation: {
    subject: 'You\'re invited to {brand}',
    intro: '{brand} invited you to try it before it opens to everyone. Sign in with this email address to start.',
    action: 'Sign in',
    why: 'You get this email because someone at {brand} invited this address. If you did not expect it, ignore it: nothing happens.',
    privacy: 'How {brand} handles your data: {url}',
  },
  waitlistAdmitted: {
    subject: 'You\'re in',
    intro: 'You\'re in. Sign up with the email address you joined with.',
    action: 'Sign up',
  },
  // A notice through the report page: its receipt and its outcome (DSA Art. 16).
  noticeReceived: {
    subject: 'We received your report',
    intro: 'We received your report about {url}.',
    introUnlinked: 'We received your report.',
    next: 'A person on our team will review it and email you the decision.',
    intimate: 'A request to remove an intimate image shared without consent is decided within 48 hours. We will email you the decision.',
  },
  noticeDecided: {
    subject: 'Our decision on your report',
    removed: 'We reviewed your report about {url} and removed the content.',
    kept: 'We reviewed your report about {url} and decided to keep the content.',
    removedUnlinked: 'We reviewed your report and removed the content.',
    keptUnlinked: 'We reviewed your report and decided to keep the content.',
    handled: 'We reviewed your report about {url} and acted on it.',
    handledUnlinked: 'We reviewed your report and acted on it.',
    reason: 'Why: {reason}',
    redress: 'If you disagree, you can take the decision to a certified out-of-court dispute settlement body or to a court.',
  },
  // The statement of reasons to the author (DSA Art. 17).
  contentRestricted: {
    subject: 'We removed your content',
    intro: 'We removed "{title}". It is no longer shown to anyone.',
    reason: 'Why: {reason}',
    notice: 'We acted on a report sent through our report form.',
    reports: 'We acted on reports from people using the app.',
    illegal: 'We found the content illegal.',
    terms: 'We found that the content breaks our terms.',
    person: 'A person on our team made this decision; no automated tool decided it.',
    appeal: 'You can appeal this decision until {date}.',
    action: 'Appeal the decision',
    redress: 'You can also take the decision to a certified out-of-court dispute settlement body or to a court.',
  },
  appealDecided: {
    subject: 'Our decision on your appeal',
    upheld: 'We reviewed your appeal about "{title}" and kept our decision.',
    reversed: 'We reviewed your appeal about "{title}" and reversed our decision.',
    reason: 'Why: {reason}',
    redress: 'If you disagree, you can take the decision to a certified out-of-court dispute settlement body or to a court.',
  },
} satisfies LabelTree

export default EMAIL_LABELS
