import type { GenericDataModel } from 'convex/server'
import { type AuthLibrarySecretConfig, contextSecrets } from '../auth-secrets.js'
import { DEFAULT_SECURITY_PATH } from '../constants.js'
import { logBackend } from '../log.js'
import { requestOrigin } from './request-origin.js'
import type { RequestOrigin } from '../email-templates.js'
import { type AuthRuntime, asMutationCtx, hookAdapter, readEnv, type SeenDevice } from './runtime.js'

// New-device alerts. Each new session's device is compared with the
// account's known devices (the backend component's `knownDevices`): a
// keyed hash of its browser, its system and its network range, bound to the
// account, so the fingerprint itself is never kept. A device the account has
// not used before records `auth.new_device` on the activity trail, which the
// notifications capability turns into the in-app notice, and sends the
// `newDevice` email with the device, the place and the time, linking to the
// security page, unless the person turned that email off among their
// notification channels (the same gates the notifications follow). A
// recovery-code sign-in always counts as new; its email is the
// `passkeyRecovered` one the recovery sends, whatever the person chose.
// The account's first device, and an administrator's visit, record nothing.
// The hashes are made under every live auth secret, so a device known
// before an `AUTH_SECRET` rotation is still known after it (the component
// re-keys its row to the current secret).
// Checking never fails the sign-in: a failure is logged.

/** The route a recovery code signs in through. */
const RECOVERY_PATH = '/sign-in/recovery-code'

const encoder = new TextEncoder()

/** HMAC-SHA-256 of `value` under the auth secret, as hex. */
async function keyedHash(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return Array.from(new Uint8Array(mac), byte => byte.toString(16).padStart(2, '0')).join('')
}

const IPV6_GROUP = /^[0-9a-f]{1,4}$/i

/** An IPv4 address written in an IPv6 one's last 32 bits, as two groups. */
function embeddedV4(part: string): string[] | null {
  const octets = part.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
  return [((octets[0]! << 8) | octets[1]!).toString(16), ((octets[2]! << 8) | octets[3]!).toString(16)]
}

/** One side of an IPv6 address's `::`, as its groups; `null` when one is no group. */
function ipv6Side(side: string, last: boolean): string[] | null {
  if (!side) return []
  const parts = side.split(':')
  const tail = parts.at(-1)!
  const v4 = last && tail.includes('.') ? embeddedV4(tail) : null
  if (v4) parts.splice(-1, 1, ...v4)
  return parts.every(part => IPV6_GROUP.test(part)) ? parts : null
}

/**
 * An IPv6 address's eight groups, each lower-case with no leading zeros, `::`
 * expanded and an embedded IPv4 tail read as two: every spelling of one
 * address gives the same groups. `null` for one that is no IPv6 address.
 */
function ipv6Groups(ip: string): string[] | null {
  const halves = ip.replace(/%.*$/, '').split('::')
  if (halves.length > 2) return null
  const compressed = halves.length === 2
  const head = ipv6Side(halves[0]!, !compressed)
  const tail = compressed ? ipv6Side(halves[1]!, true) : []
  if (!head || !tail) return null
  const missing = 8 - head.length - tail.length
  if (compressed ? missing < 1 : missing !== 0) return null
  return [...head, ...Array.from({ length: missing }, () => '0'), ...tail].map(group => Number.parseInt(group, 16).toString(16))
}

/**
 * The network range of an address: an IPv4 address's first two octets (a
 * /16), an IPv6 address's first three groups (a /48), read off its full
 * form so every spelling of one range is the same. A home connection's
 * address moves within its range; a new range reads as a new device.
 * Empty for no address, or one that is neither.
 *
 * @internal
 */
export function networkRange(address: string | null | undefined): string {
  const ip = (address ?? '').trim().replace(/^::ffff:(?=\d+\.)/i, '')
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip)
  if (v4) return `${v4[1]}.${v4[2]}`
  if (!ip.includes(':')) return ''
  return ipv6Groups(ip)?.slice(0, 3).join(':') ?? ''
}

/** A session row as the database hook hands it. */
interface NewSession {
  id?: string
  userId: string
  impersonatedBy?: string | null
  ipAddress?: string | null
  passkeyRecovery?: boolean | null
}

/** What the hook's context carries: the route, the auth secret. */
interface HookCarrier {
  path?: string
  context?: { secret?: string, secretConfig?: AuthLibrarySecretConfig }
}

type MutationRunner = Parameters<NonNullable<AuthRuntime['devices']>>[0]

/** The device a session opened from, as the known devices record it: keyed hashes, and the names the Alerts section shows. */
async function seenDevice(secrets: readonly string[], session: NewSession, origin: RequestOrigin, recovery: boolean): Promise<SeenDevice> {
  const { browser, os } = origin.device ?? {}
  const kind = `${browser ?? ''}|${os ?? ''}`
  const hashes = async (secret: string) => ({
    fingerprint: await keyedHash(secret, `device:${session.userId}:${kind}|${networkRange(session.ipAddress)}`),
    device: await keyedHash(secret, `device-kind:${session.userId}:${kind}`),
  })
  const [current, ...older] = await Promise.all(secrets.map(hashes))
  return {
    userId: session.userId,
    ...current!,
    ...(older.length > 0 ? { previous: older } : {}),
    ...(browser ? { browser } : {}),
    ...(os ? { os } : {}),
    ...(recovery ? { recovery } : {}),
    ...(session.id ? { sessionId: session.id } : {}),
  }
}

/** Record `auth.new_device` on the trail, which the notifications capability turns into the in-app notice. Never fails the sign-in. */
async function recordAlert<DM extends GenericDataModel>(runtime: AuthRuntime<DM>, ctx: MutationRunner, device: SeenDevice): Promise<void> {
  if (!runtime.audit) return
  try {
    await runtime.audit.recordBackendEvent(ctx as never, {
      type: 'auth.new_device',
      actor: { userId: device.userId },
      ...(device.sessionId ? { targetId: device.sessionId } : {}),
      data: { ...(device.browser ? { browser: device.browser } : {}), ...(device.os ? { os: device.os } : {}), ...(device.recovery ? { recovery: true } : {}) },
    })
  }
  catch (error) {
    logBackend('warn', 'audit.record_failed', 'An auth.new_device event was not recorded; the sign-in went through.', error)
  }
}

/**
 * Compare a new session's device with the account's known devices, and
 * alert the person when it is news. An administrator's visit records
 * nothing.
 *
 * @internal
 */
export async function checkNewDevice<DM extends GenericDataModel>(runtime: AuthRuntime<DM> | undefined, session: NewSession, hookCtx: unknown): Promise<void> {
  const ctx = asMutationCtx(runtime?.ctx)
  const carrier = (hookCtx ?? {}) as HookCarrier
  const secret = carrier.context?.secret
  if (!runtime?.devices || !ctx || !secret || session.impersonatedBy) return
  const recovery = carrier.path === RECOVERY_PATH || session.passkeyRecovery === true
  const origin = requestOrigin(hookCtx)
  const device = await seenDevice(contextSecrets({ ...carrier.context, secret }), session, origin, recovery)
  let seen: { alert: boolean, email: boolean }
  try {
    seen = await runtime.devices(ctx, device)
  }
  catch (error) {
    logBackend('warn', 'auth.new_device_unrecorded', 'A sign-in\'s device could not be checked against the account\'s known devices; the sign-in went through.', error)
    return
  }
  if (!seen.alert) return
  await recordAlert(runtime, ctx, device)
  if (seen.email && await emailChosen(runtime, ctx, session.userId)) await sendAlert(runtime, ctx, session, hookCtx, origin)
}

/**
 * Whether the person lets `auth.new_device` reach them by email: the same
 * channel choice their notifications follow. A failed read sends, since
 * an alert lost is worse than one unwanted. A recovery's email, the
 * `passkeyRecovered` one, asks nothing: it always goes.
 */
async function emailChosen<DM extends GenericDataModel>(runtime: AuthRuntime<DM>, ctx: MutationRunner, userId: string): Promise<boolean> {
  if (!runtime.channelOpen) return true
  try {
    return await runtime.channelOpen(ctx, userId, 'auth.new_device', 'email')
  }
  catch (error) {
    logBackend('warn', 'auth.new_device_choice_unread', 'Whether the person turned the new-device email off could not be read; the email goes out.', error)
    return true
  }
}

/** The `newDevice` email, in the account's language, linking to the security page. Best effort. */
async function sendAlert<DM extends GenericDataModel>(runtime: AuthRuntime<DM>, ctx: MutationRunner, session: NewSession, hookCtx: unknown, origin: RequestOrigin): Promise<void> {
  if (!runtime.email) return
  try {
    const user = await hookAdapter(hookCtx)?.findOne({ model: 'user', where: [{ field: 'id', value: session.userId }] }) as { email?: string, locale?: string | null } | null | undefined
    if (!user?.email) return
    const site = readEnv('SITE_URL') ?? ''
    await runtime.email.sendTemplate(ctx, 'newDevice', { email: user.email, requestedFrom: origin, url: `${site}${runtime.paths?.security ?? DEFAULT_SECURITY_PATH}` }, {
      locale: user.locale,
      // Better Auth runs an after-hook again when one after it throws: one email per session.
      ...(session.id ? { idempotencyKey: `nuxt-backend:new-device:${session.id}` } : {}),
    })
  }
  catch (error) {
    logBackend('warn', 'auth.new_device_unsent', 'A new-device alert email was not sent; the alert is in the app and on the activity trail.', error)
  }
}
