import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkNewDevice, networkRange } from '../../src/convex/client/devices'
import type { SeenDevice } from '../../src/convex/client/runtime'
import { authFlow, ORIGIN } from '../helpers/auth-flow'

// Suppression-aware sign-in and new-device alerts, against real Better Auth
// on a memory database (test/helpers/auth-flow.ts). The backend component's
// two reads stand in as fakes here: the suppression copy (one address) and
// the known devices (the component's `see`, held to the same rules in
// test/convex-component/suppressions-devices.test.ts).

afterEach(() => {
  vi.unstubAllEnvs()
})

const ADA = 'ada@example.com'
const SUPPRESSED = 'suppressed@resend.dev'
const CHROME_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'

/** A memory of each account's devices, answering as the component's `see` does. */
function knownDevices() {
  const seen = new Map<string, Set<string>>()
  const calls: SeenDevice[] = []
  const devices = vi.fn(async (_ctx: unknown, device: SeenDevice) => {
    calls.push(device)
    const mine = seen.get(device.userId) ?? new Set<string>()
    const known = mine.has(device.fingerprint)
    const first = mine.size === 0
    mine.add(device.fingerprint)
    seen.set(device.userId, mine)
    const alert = device.recovery === true || (!known && !first)
    return { alert, email: alert && !device.recovery }
  })
  return { devices, calls }
}

describe('a sign-in code to a suppressed address', () => {
  it('is refused before any code exists, with the same answer for a new address and an account', async () => {
    const suppressed = vi.fn(async (_ctx: unknown, address: string) => address === SUPPRESSED)
    const flow = await authFlow({ runtime: { suppressed } as never })

    const fresh = await flow.post('/email-otp/send-verification-otp', { email: SUPPRESSED, type: 'sign-in' })
    const freshBody = await fresh.json() as Record<string, unknown>
    expect(fresh.status).toBe(503)
    expect(freshBody).toMatchObject({ code: 'unavailable', service: 'email', reason: 'suppressed' })

    // The same refusal once an account holds the address: it tells no one who signed up.
    await flow.signedIn(SUPPRESSED)
    const account = await flow.post('/email-otp/send-verification-otp', { email: SUPPRESSED, type: 'sign-in' })
    expect(account.status).toBe(503)
    expect(await account.json()).toEqual(freshBody)

    // No code was minted or sent, and the address's own budget is untouched.
    expect(flow.db.verification!.filter(row => String(row.identifier).includes(SUPPRESSED))).toHaveLength(0)
    expect(flow.sent.filter(entry => entry.name === 'otp')).toHaveLength(0)
    expect(flow.limiter.total('emailOtp')).toBe(0)
  })

  it('leaves every other address alone', async () => {
    const flow = await authFlow({ runtime: { suppressed: async (_ctx: unknown, address: string) => address === SUPPRESSED } as never })
    const { response, code } = await flow.sendCode(ADA)
    expect(response.status).toBe(200)
    expect(code).toMatch(/^\d{6}$/)
  })
})

describe('new-device alerts', () => {
  /** Sign in with a code from a browser that names itself. */
  async function signInFrom(flow: Awaited<ReturnType<typeof authFlow>>, agent: string) {
    const send = (path: string, body: Record<string, unknown>) => flow.auth.handler(new Request(`${ORIGIN}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': ORIGIN, 'user-agent': agent },
      body: JSON.stringify(body),
    }))
    await send('/email-otp/send-verification-otp', { email: ADA, type: 'sign-in' })
    const response = await send('/sign-in/email-otp', { email: ADA, otp: flow.codeFor(ADA), name: 'Ada' })
    expect(response.status).toBe(200)
  }

  it('records nothing for the first device, and alerts a new one in the app and by email', async () => {
    const { devices, calls } = knownDevices()
    const recordBackendEvent = vi.fn(async (_ctx: unknown, _event: unknown) => null)
    const flow = await authFlow({ runtime: { devices, audit: { recordBackendEvent } } as never })

    await signInFrom(flow, CHROME_MAC)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ browser: 'Chrome', os: 'macOS', fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) })
    expect(recordBackendEvent.mock.calls.map(([, event]) => (event as { type: string }).type)).not.toContain('auth.new_device')

    // The same browser again: a known device.
    await signInFrom(flow, CHROME_MAC)
    expect(calls[1]!.fingerprint).toBe(calls[0]!.fingerprint)
    expect(flow.sent.filter(entry => entry.name === 'newDevice')).toHaveLength(0)

    await signInFrom(flow, FIREFOX_WINDOWS)
    const alerts = recordBackendEvent.mock.calls.map(([, event]) => event as { type: string, data?: unknown, targetId?: string }).filter(event => event.type === 'auth.new_device')
    expect(alerts).toEqual([expect.objectContaining({ type: 'auth.new_device', data: { browser: 'Firefox', os: 'Windows' }, targetId: expect.any(String) })])
    const sent = flow.sent.filter(entry => entry.name === 'newDevice')
    expect(sent).toEqual([{ name: 'newDevice', data: expect.objectContaining({ email: ADA, url: expect.stringMatching(/\/security$/), requestedFrom: expect.objectContaining({ device: { browser: 'Firefox', os: 'Windows' } }) }) }])
    // Nothing of the device is kept as it came: only keyed hashes reach the record.
    expect(calls[2]!.fingerprint).not.toContain('Firefox')
    expect(calls[2]!.device).toMatch(/^[0-9a-f]{64}$/)
  })

  it('sends no email to a person who turned the new-device email off, and keeps the alert in the app', async () => {
    const { devices } = knownDevices()
    const recordBackendEvent = vi.fn(async (_ctx: unknown, _event: unknown) => null)
    const channelOpen = vi.fn(async (_ctx: unknown, _userId: string, type: string, channel: string) => !(type === 'auth.new_device' && channel === 'email'))
    const flow = await authFlow({ runtime: { devices, channelOpen, audit: { recordBackendEvent } } as never })

    await signInFrom(flow, CHROME_MAC)
    await signInFrom(flow, FIREFOX_WINDOWS)
    expect(channelOpen).toHaveBeenCalledWith(expect.anything(), expect.any(String), 'auth.new_device', 'email')
    expect(recordBackendEvent.mock.calls.map(([, event]) => (event as { type: string }).type)).toContain('auth.new_device')
    expect(flow.sent.filter(entry => entry.name === 'newDevice')).toHaveLength(0)
  })

  it('sends the email when the choice cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { devices } = knownDevices()
    const channelOpen = vi.fn(async () => {
      throw new Error('down')
    })
    const flow = await authFlow({ runtime: { devices, channelOpen, audit: { recordBackendEvent: vi.fn(async () => null) } } as never })
    await signInFrom(flow, CHROME_MAC)
    await signInFrom(flow, FIREFOX_WINDOWS)
    expect(flow.sent.filter(entry => entry.name === 'newDevice')).toHaveLength(1)
  })

  it('sends a recovery\'s email to a person who turned the new-device email off', async () => {
    const { devices } = knownDevices()
    const channelOpen = vi.fn(async () => false)
    const flow = await authFlow({ runtime: { devices, channelOpen, audit: { recordBackendEvent: vi.fn(async () => null) } } as never })
    const person = await flow.signedIn(ADA)
    flow.db.passkey!.push({ id: 'pk-1', userId: person.userId, name: 'Laptop', publicKey: 'key', credentialID: 'cred-pk-1', counter: 0, deviceType: 'multiDevice', backedUp: true, createdAt: new Date() })
    const { recoveryCode } = await (await flow.post('/passkey-only/set', { enabled: true }, { cookie: person.cookie })).json() as { recoveryCode: string }
    flow.sent.length = 0
    expect((await flow.post('/sign-in/recovery-code', { email: ADA, recoveryCode })).status).toBe(200)
    expect(flow.sent.map(entry => entry.name)).toEqual(['passkeyRecovered'])
  })

  it('counts a recovery-code sign-in as a new device, its email the recovery\'s own', async () => {
    const { devices, calls } = knownDevices()
    const recordBackendEvent = vi.fn(async (_ctx: unknown, _event: unknown) => null)
    const flow = await authFlow({ runtime: { devices, audit: { recordBackendEvent } } as never })
    const person = await flow.signedIn(ADA)
    flow.db.passkey!.push({ id: 'pk-1', userId: person.userId, name: 'Laptop', publicKey: 'key', credentialID: 'cred-pk-1', counter: 0, deviceType: 'multiDevice', backedUp: true, createdAt: new Date() })
    const on = await flow.post('/passkey-only/set', { enabled: true }, { cookie: person.cookie })
    const { recoveryCode } = await on.json() as { recoveryCode: string }
    flow.sent.length = 0

    const response = await flow.post('/sign-in/recovery-code', { email: ADA, recoveryCode })
    expect(response.status).toBe(200)
    expect(calls.at(-1)).toMatchObject({ userId: person.userId, recovery: true })
    expect(recordBackendEvent.mock.calls.map(([, event]) => event)).toContainEqual(expect.objectContaining({ type: 'auth.new_device', data: { recovery: true } }))
    // One email: the recovery's, which always goes.
    expect(flow.sent.map(entry => entry.name)).toEqual(['passkeyRecovered'])
  })
})

describe('the new-device check', () => {
  it('reads a network range, not the address', () => {
    expect(networkRange('203.0.113.42')).toBe('203.0')
    expect(networkRange('::ffff:203.0.113.42')).toBe('203.0')
    expect(networkRange('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3')
    expect(networkRange('2001:db8::1')).toBe('2001:db8:0')
    expect(networkRange(null)).toBe('')
    expect(networkRange('not an address')).toBe('')
  })

  it('reads one IPv6 range however its address is spelled', () => {
    const range = '2001:db8:0'
    for (const spelling of ['2001:db8::1', '2001:0db8:0000::1', '2001:DB8:0:0:0:0:0:1', '2001:db8:0::5', '2001:db8:0:1::', '2001:db8::ffff:192.0.2.1', '2001:db8::1%eth0']) {
      expect(networkRange(spelling), spelling).toBe(range)
    }
    expect(networkRange('2001:db8:1::1')).toBe('2001:db8:1')
    expect(networkRange('::1')).toBe('0:0:0')
    expect(networkRange('2001:db8::1::2')).toBe('')
    expect(networkRange('2001:db8:zz::1')).toBe('')
    expect(networkRange('1:2:3:4:5:6:7')).toBe('')
  })

  it('hashes the device under every live secret while a rotation\'s window runs', async () => {
    const seen: SeenDevice[] = []
    const devices = vi.fn(async (_ctx: unknown, device: SeenDevice) => {
      seen.push(device)
      return { alert: false, email: false }
    })
    const runtime = { ctx: { runMutation: vi.fn() }, devices } as never
    const session = { userId: 'u1', ipAddress: '203.0.113.42' }
    await checkNewDevice(runtime, session, { context: { secret: 'old' } })
    await checkNewDevice(runtime, session, { context: { secret: 'new', secretConfig: { keys: new Map([[2, 'new'], [1, 'old']]), currentVersion: 2 } } })
    const [before, after] = seen
    expect(before!.previous).toBeUndefined()
    expect(after!.fingerprint).not.toBe(before!.fingerprint)
    expect(after!.previous).toEqual([{ fingerprint: before!.fingerprint, device: before!.device }])
  })

  it('records nothing for an administrator\'s visit', async () => {
    const devices = vi.fn()
    await checkNewDevice({ ctx: { runMutation: vi.fn() }, devices } as never, { userId: 'u1', impersonatedBy: 'admin-1' }, { context: { secret: 's' } })
    expect(devices).not.toHaveBeenCalled()
  })

  it('never fails the sign-in when the check fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const devices = vi.fn(async () => {
      throw new Error('down')
    })
    await expect(checkNewDevice({ ctx: { runMutation: vi.fn() }, devices } as never, { userId: 'u1' }, { context: { secret: 's' } })).resolves.toBeUndefined()
  })
})
