// Email topics and the sending rules: what an app declares on
// `setupEmail({ topics, caps })`, the checks on it, the signed links of the
// unsubscribe route and of a double opt-in, and the time arithmetic of the
// weekly cap and quiet hours. Runtime-neutral (no Vue, no Convex runtime):
// the app's `setupEmail`, the component that keeps each person's choices and
// the pages that show them read one definition.

import { v } from 'convex/values'
import { base64url, sameText, taggedHmacKey } from './tokens.js'

/** One email topic: what people read on the unsubscribe page and their profile, and how they join it. */
export interface EmailTopic {
  /** What people read: at most 50 characters (the provider's limit). */
  name: string
  /** One line about what the topic sends and how often: at most 200 characters. */
  description: string
  /**
   * Whether people are in the topic until they leave. Keep it `false` for
   * marketing, so people join on purpose. The provider cannot change a
   * topic's default after it creates it.
   */
  subscribedByDefault: boolean
  /** Ask for a confirmation click before a person joins (a newsletter). */
  doubleOptIn?: boolean
  /** Add paying customers unless they object at checkout (the EU soft opt-in). */
  softOptIn?: boolean
  /** The sender of the topic's email; without it `EMAIL_MARKETING_FROM`, then `EMAIL_FROM`. */
  from?: string
}

/** The topics an app sends under, keyed by the name its code sends by. */
export type EmailTopics = Readonly<Record<string, EmailTopic>>

/** A time of day, `HH:MM` on a 24-hour clock. */
export type ClockTime = `${number}:${number}`

/**
 * The rules every non-transactional send follows: email under a topic,
 * lifecycle email, and the email and push channels of notifications.
 */
export interface EmailCaps {
  /** The most non-transactional emails one person gets in any 7 days, across every topic. No default: nothing is capped. */
  perWeek?: number
  /** A window in each person's own time zone; a send that would land inside it waits for its end. No default. */
  quietHours?: { start: ClockTime | string, end: ClockTime | string }
  /** No non-transactional mail after this many days without a click in your email or activity in your app. Default 180. */
  sunsetAfterDays?: number
}

/** The most `perWeek` may be: the weekly cap remembers this many sends of each address. */
export const PER_WEEK_MAX = 50

/** The sunset rule's default: six months. */
export const SUNSET_AFTER_DAYS_DEFAULT = 180

/** The provider's limits on a topic's words. */
export const TOPIC_NAME_MAX = 50
export const TOPIC_DESCRIPTION_MAX = 200

/** How long a double opt-in confirmation link works. */
export const CONFIRMATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const MINUTE_MS = 60 * 1000
export const DAY_MS = 24 * 60 * MINUTE_MS
/** The window the weekly cap counts sends in. */
export const WEEK_MS = 7 * DAY_MS

/** A person's choice about one topic. `pending`: asked to join, waiting for the confirmation click. */
export type TopicState = 'subscribed' | 'unsubscribed' | 'pending'

/**
 * How a choice was made, as the consent ledger records it:
 * - `profile`: on the profile, or with `useEmailPreferences`;
 * - `double-opt-in`: the confirmation click of a double opt-in;
 * - `soft-opt-in`: a paid checkout whose customer did not object;
 * - `unsubscribe-page`: the packaged unsubscribe page;
 * - `one-click`: a mail client's one-click unsubscribe (RFC 8058);
 * - `provider`: the provider's own hosted page or API, reported by webhook;
 * - `erasure`: an account erased.
 */
export type TopicSource = 'profile' | 'double-opt-in' | 'soft-opt-in' | 'unsubscribe-page' | 'one-click' | 'provider' | 'erasure'

/** The topic key that stands for every topic in an unsubscribe link. */
export const ALL_TOPICS = '*'

/** The consent ledger's kind for a topic: `email.topic.<key>`. */
export function topicConsentKind(key: string): string {
  return `email.topic.${key}`
}

/** A topic key: a name your code sends by, such as `productNews`. */
const TOPIC_KEY = /^[a-z][A-Za-z0-9]{0,39}$/

/** A time of day as minutes since midnight, or `null` for anything that is no `HH:MM`. */
export function clockMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** What is wrong with one topic's words, or `null`. */
function wordsProblem(key: string, topic: EmailTopic): string | null {
  if (typeof topic.name !== 'string' || !topic.name.trim() || topic.name.length > TOPIC_NAME_MAX) return `${key}.name: 1 to ${TOPIC_NAME_MAX} characters.`
  if (typeof topic.description !== 'string' || !topic.description.trim() || topic.description.length > TOPIC_DESCRIPTION_MAX) return `${key}.description: 1 to ${TOPIC_DESCRIPTION_MAX} characters.`
  return null
}

/** What is wrong with how one topic is joined and sent, or `null`. */
function joiningProblem(key: string, topic: EmailTopic): string | null {
  if (typeof topic.subscribedByDefault !== 'boolean') return `${key}.subscribedByDefault: say whether people are in the topic until they leave (\`false\` for marketing).`
  if (topic.subscribedByDefault && topic.doubleOptIn) return `${key}: a topic everyone is in by default asks nobody to confirm. Drop \`doubleOptIn\`, or make it \`subscribedByDefault: false\`.`
  if (topic.from !== undefined && (typeof topic.from !== 'string' || !topic.from.includes('@'))) return `${key}.from: an address, alone or as \`Name <address>\`.`
  return null
}

/** What is wrong with the topics an app declares, or `null`. */
export function topicsProblem(topics: EmailTopics): string | null {
  for (const [key, topic] of Object.entries(topics)) {
    if (!TOPIC_KEY.test(key)) return `${key}: a topic key is a name your code sends by, a letter then letters or digits (\`productNews\`), at most 40.`
    const problem = wordsProblem(key, topic) ?? joiningProblem(key, topic)
    if (problem) return problem
  }
  return null
}

/** What is wrong with the sending rules, or `null`. */
export function capsProblem(caps: EmailCaps): string | null {
  if (caps.perWeek !== undefined && !(Number.isInteger(caps.perWeek) && caps.perWeek > 0 && caps.perWeek <= PER_WEEK_MAX)) return `perWeek: a whole number of emails from 1 to ${PER_WEEK_MAX}.`
  if (caps.sunsetAfterDays !== undefined && !(Number.isInteger(caps.sunsetAfterDays) && caps.sunsetAfterDays > 0)) return 'sunsetAfterDays: a whole number of days, at least 1.'
  if (caps.quietHours !== undefined) {
    const start = clockMinutes(caps.quietHours.start)
    const end = clockMinutes(caps.quietHours.end)
    if (start === null || end === null) return 'quietHours: `start` and `end` are times of day, `HH:MM` on a 24-hour clock (`{ start: \'21:00\', end: \'08:00\' }`).'
    if (start === end) return 'quietHours: `start` and `end` differ.'
  }
  return null
}

/** The sending rules as the component applies them: every value resolved. */
/** The sending rules as the app resolved them (`resolveCaps`), as a component function takes them. */
export const vResolvedCaps = v.object({
  perWeek: v.union(v.number(), v.null()),
  quietHours: v.union(v.object({ start: v.number(), end: v.number() }), v.null()),
  sunsetAfterMs: v.number(),
})

export interface ResolvedCaps {
  perWeek: number | null
  quietHours: { start: number, end: number } | null
  sunsetAfterMs: number
}

/** The rules, with the sunset's default and the quiet hours in minutes. */
export function resolveCaps(caps: EmailCaps = {}): ResolvedCaps {
  const start = caps.quietHours ? clockMinutes(caps.quietHours.start) : null
  const end = caps.quietHours ? clockMinutes(caps.quietHours.end) : null
  return {
    perWeek: caps.perWeek ?? null,
    quietHours: start !== null && end !== null ? { start, end } : null,
    sunsetAfterMs: (caps.sunsetAfterDays ?? SUNSET_AFTER_DAYS_DEFAULT) * DAY_MS,
  }
}

/** Whether a string names a time zone the runtime knows (`Europe/Dublin`). */
export function isTimeZone(value: string): boolean {
  if (value.length > 64 || !/^[\w+\-/]+$/.test(value)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  }
  catch {
    return false
  }
}

/** The minutes since midnight at `at` in a time zone; UTC when the zone is unknown. */
export function localMinutes(at: number, timeZone: string | undefined): number {
  const zone = timeZone && isTimeZone(timeZone) ? timeZone : 'UTC'
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0)
  return (hour % 24) * 60 + minute
}

/** Whether a time of day (minutes since midnight) falls in the quiet hours. The window may wrap past midnight. */
function inQuietHours(minutes: number, { start, end }: { start: number, end: number }): boolean {
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}

/**
 * When the quiet hours that `at` falls in end, as epoch ms, or `null` when
 * `at` is outside them. The window may wrap past midnight (`21:00`–`08:00`).
 * A night the zone's clocks change on ends at the wall clock's `end` too.
 */
export function quietHoursEnd(at: number, timeZone: string | undefined, quietHours: { start: number, end: number } | null): number | null {
  if (!quietHours) return null
  const now = localMinutes(at, timeZone)
  if (!inQuietHours(now, quietHours)) return null
  const day = 24 * 60
  let release = at - (at % MINUTE_MS) + ((quietHours.end - now + day) % day) * MINUTE_MS
  // The wait is in wall-clock minutes: an hour the clocks repeat or skip moves the end by it.
  for (let step = 0; step < 2; step++) {
    const off = ((quietHours.end - localMinutes(release, timeZone) + day + day / 2) % day) - day / 2
    const next = release + off * MINUTE_MS
    // An end the clocks skip has no instant: the later one, outside the window, stands.
    if (off === 0 || next <= at || inQuietHours(localMinutes(next, timeZone), quietHours)) break
    release = next
  }
  return release
}

// ── Signed links ─────────────────────────────────────────────────────────

const encoder = new TextEncoder()

/** 128 bits of signature, in base64url characters. */
const SIGNATURE_LENGTH = 22

async function signature(secret: string, use: string, payload: string): Promise<string> {
  // The key is derived from the auth secret, tagged for the link's use and version, so it signs nothing else.
  const key = await taggedHmacKey(secret, `nuxt-backend:${use}`)
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))).slice(0, SIGNATURE_LENGTH)
}

/** The version of the unsubscribe link: a new one signs with a new key, and the old keeps working while it is read. */
const UNSUBSCRIBE_VERSION = '1'

/** A contact id or a topic key as it may stand in a link: no dot, nothing long. */
const LINK_PART = /^[\w*-]{1,64}$/

/**
 * The token of an unsubscribe link: one contact, one topic (or `*`, every
 * topic), signed. It never expires, so a link in an old email still works;
 * its version lets the signing key change. `<version>.<contact>.<topic>.<signature>`.
 */
export async function unsubscribeToken(secret: string, contactId: string, topic: string): Promise<string> {
  const payload = `${UNSUBSCRIBE_VERSION}.${contactId}.${topic}`
  return `${payload}.${await signature(secret, 'email-unsubscribe:v1', payload)}`
}

/** What an unsubscribe token names, or `null` when it was not signed with this secret. */
export async function readUnsubscribeToken(secret: string, token: string): Promise<{ contactId: string, topic: string } | null> {
  const parts = token.trim().split('.')
  if (parts.length !== 4 || parts[0] !== UNSUBSCRIBE_VERSION) return null
  const [, contactId, topic, signed] = parts as [string, string, string, string]
  if (!LINK_PART.test(contactId) || !LINK_PART.test(topic)) return null
  return sameText(await signature(secret, 'email-unsubscribe:v1', `${UNSUBSCRIBE_VERSION}.${contactId}.${topic}`), signed) ? { contactId, topic } : null
}

/**
 * The token of a double opt-in's confirmation link: one contact, one
 * topic, until `expiresAt`. It works once: confirming ends the pending
 * choice it confirms. `c1.<contact>.<topic>.<expiresAt>.<signature>`.
 */
export async function confirmationToken(secret: string, contactId: string, topic: string, expiresAt: number): Promise<string> {
  const payload = `c1.${contactId}.${topic}.${Math.floor(expiresAt).toString(36)}`
  return `${payload}.${await signature(secret, 'email-confirmation:v1', payload)}`
}

/** What a confirmation token names, or `null` when it is not signed with this secret or has lapsed by `now`. */
export async function readConfirmationToken(secret: string, token: string, now = Date.now()): Promise<{ contactId: string, topic: string } | null> {
  const parts = token.trim().split('.')
  if (parts.length !== 5 || parts[0] !== 'c1') return null
  const [, contactId, topic, expires, signed] = parts as [string, string, string, string, string]
  if (!LINK_PART.test(contactId) || !LINK_PART.test(topic) || topic === ALL_TOPICS || !/^[0-9a-z]{1,12}$/.test(expires)) return null
  if (!sameText(await signature(secret, 'email-confirmation:v1', `c1.${contactId}.${topic}.${expires}`), signed)) return null
  return Number.parseInt(expires, 36) > now ? { contactId, topic } : null
}

/** The version of a topic's words a consent was given to: a digest of its description. */
export async function topicVersion(topic: Pick<EmailTopic, 'description'>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(topic.description))
  return [...new Uint8Array(digest).slice(0, 6)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// ── The unsubscribe footer ────────────────────────────────────────────────

/** The footer a topic email carries: the postal address and the unsubscribe link, in HTML and in text. */
export interface TopicFooter {
  address?: string
  unsubscribeUrl: string
  /** The link's words, in the recipient's language. */
  unsubscribeLabel: string
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Where the layout's footer cell ends: a topic email's own footer goes before it. */
export const LAYOUT_FOOTER_END = '<!--nb-footer-end-->'

/**
 * Add a topic email's footer to its HTML and text: inside the layout's
 * footer when the HTML is the package's layout, else before `</body>`, else
 * at the end.
 */
export function withTopicFooter<M extends { html?: string, text?: string }>(message: M, footer: TopicFooter): M {
  const url = escapeText(footer.unsubscribeUrl)
  const lines = [footer.address ? escapeText(footer.address) : null, `<a href="${url}" style="color:inherit;text-decoration:underline">${escapeText(footer.unsubscribeLabel)}</a>`].filter(Boolean)
  const block = `<div data-nb-topic-footer style="margin-top:8px">${lines.join('<br>')}</div>`
  let html = message.html
  if (html !== undefined) {
    if (html.includes(LAYOUT_FOOTER_END)) html = html.replace(LAYOUT_FOOTER_END, `${block}${LAYOUT_FOOTER_END}`)
    else if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `<div style="padding:16px;font-size:13px">${block}</div></body>`)
    else html = `${html}${block}`
  }
  const textFooter = `\n\n${footer.address ? `${footer.address}\n` : ''}${footer.unsubscribeLabel}: ${footer.unsubscribeUrl}`
  const text = message.text !== undefined ? `${message.text}${textFooter}` : undefined
  return { ...message, ...(html !== undefined ? { html } : {}), ...(text !== undefined ? { text } : {}) }
}
