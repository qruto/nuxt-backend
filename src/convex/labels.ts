// Every string the package writes for people, as message templates keyed by
// name, in English. Runtime-neutral (no Vue, no Convex), so an email rendered
// in a Convex function and a page rendered in Vue read the same strings. The
// syntax is vue-i18n's, so a label moves into an app's @nuxtjs/i18n messages
// unchanged: `{name}` interpolates, `|` separates plural forms.

/** Values a label interpolates. `count` also picks the plural form. */
export type LabelParams = Record<string, string | number>

/** Resolve a label by its dotted key and fill it in. */
export type Translate = (key: string, params?: LabelParams) => string

/** A tree of labels: groups of named message templates. */
export interface LabelTree {
  [key: string]: string | LabelTree
}

/**
 * The plural form vue-i18n picks by default: with two forms the first is for
 * one and the second for everything else (zero included); with three, zero,
 * one and many.
 */
function pluralIndex(forms: number, count: number): number {
  const choice = Math.abs(count)
  if (forms === 2) return choice === 1 ? 0 : 1
  return Math.min(choice, forms - 1, 2)
}

/**
 * Fill in one message: choose the plural form by `params.count` when the
 * message has several (`one code | {count} codes`), then replace each
 * `{name}` with its value. A placeholder without a value stays as written,
 * so a missing parameter shows up instead of vanishing.
 */
export function formatLabel(message: string, params: LabelParams = {}): string {
  const forms = message.split('|').map(form => form.trim())
  const count = typeof params.count === 'number' ? params.count : Number(params.count)
  const chosen = forms.length > 1 && Number.isFinite(count) ? forms[pluralIndex(forms.length, count)]! : forms[0]!
  return chosen.replace(/\{(\w+)\}/g, (placeholder, name: string) => name in params ? String(params[name]) : placeholder)
}

/** The message at a dotted key, or `undefined` when the tree has none. */
function lookup(tree: LabelTree, key: string): string | undefined {
  let node: string | LabelTree | undefined = tree
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * A {@link Translate} over the English defaults. An unknown key comes back as
 * the key itself, the way vue-i18n shows a missing message.
 */
export function createTranslate(labels: LabelTree = LABELS): Translate {
  return (key, params) => {
    const message = lookup(labels, key)
    return message === undefined ? key : formatLabel(message, params)
  }
}

/** What the auth flows tell a person they refused. */
const AUTH_LABELS = {
  undeliverable: {
    testMode: 'This app is in test mode and only emails test addresses right now.',
    unconfigured: 'This app can\'t send email yet.',
  },
} satisfies LabelTree

/** The emails the package sends: subjects, sentences and buttons. */
const EMAIL_LABELS = {
  link: {
    fallback: 'Or paste this link into your browser:',
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
    // The first code of an email change, to the current address.
    emailChange: {
      subject: 'Confirm your email change',
      intro: 'Enter this code to confirm you want to change the email address on your account.',
      warning: 'If you didn\'t ask for this, someone may be signed in to your account. Sign out of your other sessions.',
    },
  },
  emailChanged: {
    subject: 'Your email address was changed',
    intro: 'The email address on your account is now {newEmail}.',
    warning: 'If you didn\'t make this change, contact us right away.',
  },
  welcome: {
    subject: 'Welcome aboard',
    greeting: 'Welcome!',
    greetingNamed: 'Welcome, {name}!',
    body: 'Your account is ready — thanks for joining us.',
  },
  deleteAccount: {
    subject: 'Confirm account deletion',
    intro: 'Confirm you want to permanently delete your account. This cannot be undone.',
    action: 'Delete account',
  },
  invite: {
    subject: 'Join {workspace}',
    intro: '{inviter} invited you to join {workspace} as {role}.',
    action: 'Accept invitation',
  },
  gift: {
    subject: '{sender} sent you a gift 🎁',
    intro: '{sender} sent you a gift! Sign in to receive it.',
    sender: 'Someone',
    action: 'Receive your gift',
  },
} satisfies LabelTree

/** The English defaults, by group. */
export const LABELS = {
  auth: AUTH_LABELS,
  email: EMAIL_LABELS,
} satisfies LabelTree
