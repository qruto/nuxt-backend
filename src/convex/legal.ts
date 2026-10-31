// The facts the packaged legal pages print, and the Privacy page of the docs
// generates from: who processes data for an app on the package, what each
// cookie and storage key the package sets is for, and the data map, the
// account-data registry regrouped by capability. Runtime-neutral (no Vue, no
// Convex runtime), so the pages, the labels they read and the docs lookups
// read one table. Brand names live here as prose; every key is neutral.

import { ACCOUNT_DATA_SOURCES, type AccountDataRecord, type AccountDataSourceKey } from './account-data.js'
import type { StoragePurpose } from './consent-rules.js'
import { PUSH_WORKER_URL } from './web-push.js'

// The capability names and states as the data registry and the health route carry them:
// this file ships as source under src/convex, which src/capabilities does not.
type CapabilityName = AccountDataRecord['capability']
type CapabilityState = 'live' | 'test' | 'missing' | 'failing'

/** The packaged legal pages, by their key under `backend.pages`. */
export type LegalPageKey = 'privacy' | 'terms' | 'subprocessors' | 'accessibility'

/** Every legal page key, in the order a footer lists them. */
export const LEGAL_PAGE_KEYS: readonly LegalPageKey[] = ['privacy', 'terms', 'subprocessors', 'accessibility']

/**
 * The company details the legal pages are filled from
 * (`appConfig.backend.legal`). Each is optional: a page leaves out what is
 * not set, and says in development which ones are missing.
 */
export interface LegalDetails {
  /** The legal entity that runs the app: the controller of its users' data (GDPR Art. 13(1)(a)). */
  company?: string
  /** Its postal address. */
  address?: string
  /** Where people send privacy requests and report an accessibility barrier: an email address or a URL. */
  contact?: string
  /** The data protection officer's contact, when one must be appointed (GDPR Art. 37). */
  dpo?: string
}

/** One processor an app on the package hands personal data to, once its capability is in use. */
export interface Subprocessor {
  /** The capability that brings it in. */
  capability: CapabilityName
  /** Who it is, as its makers write it: a name, never translated, so the pages print it as it is. */
  name: string
  /** What it processes, in a sentence a privacy notice can carry. */
  processes: string
  /** Where it keeps the data. */
  location: string
  /** Its data processing agreement, or terms that stand for one; absent when it publishes none, or when the row names more than one provider (each Services page links theirs). */
  agreement?: string
  /** What turns it on, for the docs: the env it reads. */
  configuredBy: string
}

/**
 * The processors, by a neutral key, in the order the pages list them. A
 * processor is listed while its capability is in use. Keep each in step
 * with its Services page, which links the same agreement.
 */
export const SUBPROCESSORS = {
  deployment: {
    capability: 'data',
    name: 'Convex',
    processes: 'Everything the app stores: accounts, sessions, workspaces, billing state, email records, uploaded files, exports and logs.',
    location: 'The region the deployment was created in: the US, the EU (Dublin), Canada or Australia.',
    agreement: 'https://www.convex.dev/legal/dpa',
    configuredBy: '`CONVEX_DEPLOYMENT`',
  },
  host: {
    capability: 'hosting',
    name: 'Vercel',
    processes: 'Each request to the app, with its network address and browser. On another host, that host instead.',
    location: 'The functions region the app is deployed to; Vercel is a US company.',
    agreement: 'https://vercel.com/legal/dpa',
    configuredBy: 'The host',
  },
  billing: {
    capability: 'billing',
    name: 'Polar',
    processes: 'The customer of each paying account or workspace: name, email address, billing address, payment method, orders, subscriptions and invoices. As merchant of record it sells to customers in its own name, under its own terms.',
    location: 'The US, Canada or elsewhere outside the EEA and the UK.',
    agreement: 'https://polar.sh/legal/checkout-buyer-terms',
    configuredBy: '`BILLING_ACCESS_TOKEN`',
  },
  email: {
    capability: 'email',
    name: 'Resend',
    processes: 'The emails the app sends, their delivery events, and the contacts and topics people subscribe to.',
    location: 'The US; mail leaves from the sending domain\'s region.',
    agreement: 'https://resend.com/legal/dpa',
    configuredBy: '`EMAIL_API_KEY`',
  },
  botCheck: {
    capability: 'protection',
    name: 'Vercel BotID, Cloudflare Turnstile',
    processes: 'Signals of the browser and the request (network address, browser, TLS fingerprint) when someone signs in, signs up or sends a protected form, to tell people from bots.',
    location: 'The US, and the provider\'s network worldwide.',
    configuredBy: '`PROTECTION_*`',
  },
  webPush: {
    capability: 'notifications',
    name: 'The browsers\' push services (Apple, Google, Mozilla, Microsoft)',
    processes: 'The notifications sent to a device a person turned them on for: the device\'s push address, and each message, encrypted so the service reads only where and when it goes.',
    location: 'Each browser maker\'s own network, mostly in the US.',
    configuredBy: '`PUSH_PUBLIC_KEY` and `PUSH_PRIVATE_KEY`',
  },
  aiGateway: {
    capability: 'ai',
    name: 'Convex AI Gateway, Vercel AI Gateway',
    processes: 'The prompts and the answers of the AI features a person uses, which the gateway passes to the model\'s provider; never kept by the app past the request.',
    location: 'The US, or the EU where inference is pinned there.',
    configuredBy: 'A paid Convex plan, or `AI_GATEWAY_API_KEY`',
  },
  monitoring: {
    capability: 'monitoring',
    name: 'Sentry',
    processes: 'Error reports and cron check-ins, scrubbed of addresses, names and credentials, with an account\'s id at most; a masked session replay only after the person allowed it.',
    location: 'The US or the EU, as the organization was created.',
    agreement: 'https://sentry.io/legal/dpa/',
    configuredBy: '`MONITORING_DSN`',
  },
} as const satisfies Record<string, Subprocessor>

/** A processor's key. */
export type SubprocessorKey = keyof typeof SUBPROCESSORS

/** Whether a stored item may be written before the person agrees, or which purpose of the consent manager it waits for. */
export type StorageConsent = 'necessary' | StoragePurpose

/** One cookie or storage key the package writes in a person's browser. */
export interface BrowserStorageItem {
  /** The capability that writes it. */
  capability: CapabilityName
  /** Its name, as the browser shows it. */
  name: string
  /** `push`: the browser's push subscription for the site, and the service worker that shows its messages. */
  kind: 'cookie' | 'localStorage' | 'sessionStorage' | 'push'
  /** A cookie the page's scripts cannot read. */
  httpOnly: boolean
  /** When it is written. */
  set: string
  /** What it is for. */
  why: string
  /** How long it lasts. */
  lasts: string
  /** `necessary`: strictly necessary for what the person asked for, so written without consent (ePrivacy Art. 5(3)); else the purpose it waits for. */
  consent: StorageConsent
}

/**
 * Every cookie and storage key the package writes, by a neutral key. The
 * auth library's cookies carry its `better-auth.` prefix, with `__Secure-`
 * in front over HTTPS. A key added to the package's browser code lands here,
 * or test/unit/legal.test.ts fails.
 */
export const BROWSER_STORAGE = {
  session: {
    capability: 'auth',
    name: 'better-auth.session_token',
    kind: 'cookie',
    httpOnly: true,
    set: 'A person signs in.',
    why: 'Keeps them signed in.',
    lasts: '7 days, renewed while they use the app.',
    consent: 'necessary',
  },
  sessionJwt: {
    capability: 'auth',
    name: 'better-auth.convex_jwt',
    kind: 'cookie',
    httpOnly: true,
    set: 'A person signs in, and as their session renews.',
    why: 'Proves to the backend who is signed in, for the pages the server renders.',
    lasts: '15 minutes.',
    consent: 'necessary',
  },
  signInCode: {
    capability: 'auth',
    name: 'better-auth.sign_in_code',
    kind: 'cookie',
    httpOnly: true,
    set: 'A person asks for a sign-in code.',
    why: 'Makes the code work only in the browser that asked for it.',
    lasts: '5 minutes.',
    consent: 'necessary',
  },
  passkeyChallenge: {
    capability: 'auth',
    name: 'better-auth-passkey',
    kind: 'cookie',
    httpOnly: true,
    set: 'A person signs in with a passkey or adds one.',
    why: 'Holds the challenge the passkey answers.',
    lasts: '5 minutes.',
    consent: 'necessary',
  },
  underAge: {
    capability: 'auth',
    name: 'better-auth.under_age',
    kind: 'cookie',
    httpOnly: true,
    set: 'Someone gives an age under the app\'s minimum at sign-up.',
    why: 'Keeps a second answer from following at once.',
    lasts: '1 day.',
    consent: 'necessary',
  },
  impersonation: {
    capability: 'auth',
    name: 'better-auth.admin_session',
    kind: 'cookie',
    httpOnly: true,
    set: 'An administrator opens the app as another account.',
    why: 'Returns the administrator to their own session when the visit ends.',
    lasts: 'The visit, 30 minutes at most.',
    consent: 'necessary',
  },
  storageChoice: {
    capability: 'auth',
    name: 'backend.storage',
    kind: 'cookie',
    httpOnly: false,
    set: 'A person answers the prompt about optional storage.',
    why: 'Remembers what they allowed, so nothing optional is stored unasked.',
    lasts: '6 months, then the prompt asks again.',
    consent: 'necessary',
  },
  lastSignIn: {
    capability: 'auth',
    name: 'better-auth.last_used_login_method',
    kind: 'cookie',
    httpOnly: false,
    set: 'A person signs in, once they allowed preferences.',
    why: 'Marks the way they signed in last, so the sign-in form can suggest it.',
    lasts: '30 days.',
    consent: 'preferences',
  },
  visitor: {
    capability: 'protection',
    name: '__Host-backend.visitor',
    kind: 'cookie',
    httpOnly: true,
    set: 'A person who is not signed in passes the bot check for something they asked the app to do, such as a free generation.',
    why: 'Counts what this browser did before signing up, and hands it to the account made here.',
    lasts: '1 year.',
    consent: 'necessary',
  },
  invite: {
    capability: 'auth',
    name: 'nuxt-backend:invite',
    kind: 'sessionStorage',
    httpOnly: false,
    set: 'A person opens an invite link or enters an invite code.',
    why: 'Keeps the invite until the sign-in that uses it.',
    lasts: 'Until the tab closes.',
    consent: 'necessary',
  },
  presence: {
    capability: 'email',
    name: 'nuxt-backend:email-presence',
    kind: 'sessionStorage',
    httpOnly: false,
    set: 'A signed-in person opens the app.',
    why: 'Tells the backend their time zone at most once a day, so emails respect their quiet hours.',
    lasts: 'Until the tab closes.',
    consent: 'necessary',
  },
  upgradeDismissed: {
    capability: 'billing',
    name: 'nuxt-backend:upgrade-dismissed',
    kind: 'localStorage',
    httpOnly: false,
    set: 'A person dismisses an upgrade prompt.',
    why: 'Keeps the prompt hidden for the time the app sets. Without preferences allowed, it is kept for the tab only.',
    lasts: 'The app\'s cool-down, a year at most.',
    consent: 'preferences',
  },
  pushSubscription: {
    capability: 'notifications',
    name: PUSH_WORKER_URL,
    kind: 'push',
    httpOnly: false,
    set: 'A signed-in person turns notifications on for a device and allows them in the browser.',
    why: 'The push subscription lets the app send that device notifications. The service worker, where the browser needs one, shows them and opens the app on a click; it caches nothing.',
    lasts: 'Until the person turns notifications off on the device or takes back the site\'s permission.',
    consent: 'necessary',
  },
  replay: {
    capability: 'monitoring',
    name: 'sentryReplaySession',
    kind: 'sessionStorage',
    httpOnly: false,
    set: 'A person allowed session replay, and the app turned it on.',
    why: 'Records, masked, the minute before an error and the rest of that visit, to find what went wrong.',
    lasts: 'Until the tab closes.',
    consent: 'replay',
  },
} as const satisfies Record<string, BrowserStorageItem>

/** A stored item's key. */
export type BrowserStorageKey = keyof typeof BROWSER_STORAGE

/**
 * Text for a person rather than a developer: an aside naming code, such as
 * `` (`setupEmail({ retention })`) ``, goes, and so does any other backtick.
 * Braces, bars and at signs go too: a label's message reads them as syntax.
 */
export function plainText(text: string): string {
  return text.replace(/ \(`[^`]*`\)/g, '').replace(/[`{}|@]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Whether the app uses a capability, by the state its health reports: every
 * state but `missing`. A capability the health does not name (the backend
 * could not be reached) counts as in use, so a page lists too much rather
 * than leave a processor out.
 */
export function capabilityInUse(states: Partial<Record<string, CapabilityState | string>> | null | undefined, capability: CapabilityName): boolean {
  return states?.[capability] !== 'missing'
}

/** One capability of the data map: the participants it keeps. */
export interface DataMapGroup {
  capability: CapabilityName
  participants: AccountDataSourceKey[]
}

/**
 * The data map: the account-data registry by capability, in the order the
 * registry runs its participants, each capability where its first
 * participant stands. `inUse` keeps the capabilities the app uses.
 */
export function dataMap(inUse: (capability: CapabilityName) => boolean = () => true): DataMapGroup[] {
  const groups: DataMapGroup[] = []
  for (const [key, source] of Object.entries(ACCOUNT_DATA_SOURCES) as Array<[AccountDataSourceKey, (typeof ACCOUNT_DATA_SOURCES)[AccountDataSourceKey]]>) {
    if (!inUse(source.capability)) continue
    const group = groups.find(each => each.capability === source.capability)
    if (group) group.participants.push(key)
    else groups.push({ capability: source.capability, participants: [key] })
  }
  return groups
}

/** The processors of the capabilities in use, in list order. */
export function subprocessorsInUse(inUse: (capability: CapabilityName) => boolean = () => true): SubprocessorKey[] {
  return (Object.keys(SUBPROCESSORS) as SubprocessorKey[]).filter(key => inUse(SUBPROCESSORS[key].capability))
}

/** The stored items of the capabilities in use, in list order. */
export function browserStorageInUse(inUse: (capability: CapabilityName) => boolean = () => true): BrowserStorageKey[] {
  return (Object.keys(BROWSER_STORAGE) as BrowserStorageKey[]).filter(key => inUse(BROWSER_STORAGE[key].capability))
}
