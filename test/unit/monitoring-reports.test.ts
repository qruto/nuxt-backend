import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { backendError } from '../../src/convex/errors'
import { createFunctions } from '../../src/convex/integrations/functions'
import { stringifyQuery } from 'vue-router'
import { DATA_COLLECTION, SCRUBBING, scrubbingIntegration } from '../../src/runtime/monitoring/sdk/preset'
import { checkIn, checkingIn, reportError, reportingErrors } from '../../src/convex/integrations/monitoring'
import { alertEvent, backendCallOf, checkInEnvelope, envelopeUrl, errorEvent, eventEnvelope, isReportable, monitoringTags, monitorSlug, parseMonitoringDsn, postEnvelope, REPORT_TIMEOUT_MS, reportingDeployment, scrubEvent, scrubText, stackFrames } from '../../src/convex/monitoring'

// Error reports and cron check-ins as the backend posts them: straight to
// the DSN's ingest endpoint, one envelope each, with no SDK. A stubbed
// fetch stands in for the service; no report leaves the machine.

const DSN = 'https://public-key@o7.ingest.monitor.test/42'
const ENDPOINT = 'https://o7.ingest.monitor.test/api/42/envelope/?sentry_key=public-key&sentry_version=7'

/** An envelope's lines, parsed: its header, then each item's header and payload. */
function lines(body: string): Array<Record<string, unknown>> {
  expect(body.endsWith('\n')).toBe(true)
  return body.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
}

/** A client call's failure as the browser client throws it: a refusal is a `ConvexError` carrying its data. */
const clientFailure = (kind: 'Q' | 'M' | 'A', path: string, data?: unknown) =>
  Object.assign(new Error(`[CONVEX ${kind}(${path})] [Request ID: 1a2b] Server Error\n  Called by client`), data === undefined ? {} : { name: 'ConvexError', data })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MONITORING_DSN', DSN)
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://happy-otter-123.convex.cloud')
  vi.stubEnv('BACKEND_ENVIRONMENT', 'production')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** The envelopes posted so far, each parsed into its lines. */
const posted = () => fetchMock.mock.calls.map(([url, init]) => ({ url: url as string, lines: lines((init as RequestInit).body as string) }))

describe('a DSN', () => {
  it('reads the ingest origin, the project and the public key, and refuses anything else', () => {
    const dsn = parseMonitoringDsn(DSN)
    expect(dsn).toEqual({ dsn: DSN, origin: 'https://o7.ingest.monitor.test', projectId: '42', publicKey: 'public-key' })
    expect(envelopeUrl(dsn!)).toBe(ENDPOINT)
    // A path before the project id is kept, a self-hosted service's prefix.
    expect(parseMonitoringDsn('https://k@monitor.example.com/prefix/9')?.origin).toBe('https://monitor.example.com/prefix')
    for (const value of [undefined, '', 'not a url', 'https://monitor.test/42', 'https://k@monitor.test/project', 'ftp://k@monitor.test/1']) {
      expect(parseMonitoringDsn(value), String(value)).toBeNull()
    }
  })
})

describe('what a report says about a failed call', () => {
  it('reads the function a browser client call ran from the error it threw', () => {
    expect(backendCallOf(clientFailure('M', 'billing:checkout'))).toEqual({ function: 'billing:checkout', kind: 'mutation' })
    expect(backendCallOf(clientFailure('Q', 'auth:getAuthUser'))).toEqual({ function: 'auth:getAuthUser', kind: 'query' })
    expect(backendCallOf(new Error('Server Error'))).toBeNull()
    expect(backendCallOf('nope')).toBeNull()
  })

  it('reports crashes, app errors and unavailable services, never a refusal', () => {
    expect(isReportable(new Error('boom'))).toBe(true)
    expect(isReportable(backendError('unavailable', { service: 'billing', reason: 'provider_refused' }))).toBe(true)
    for (const refusal of [backendError('unauthenticated'), backendError('forbidden', { reason: 'role' }), backendError('invalid_input', { field: 'name' }), backendError('rate_limited', {})]) {
      expect(isReportable(refusal)).toBe(false)
    }
  })

  it('tags the function and the catalog code, and an unavailable service with its reason', () => {
    const failure = clientFailure('A', 'billing:checkout', { code: 'unavailable', service: 'billing', reason: 'provider_refused' })
    expect(monitoringTags(failure, { source: 'browser' })).toEqual({
      'backend.function': 'billing:checkout',
      'backend.code': 'unavailable',
      'backend.reason': 'billing/provider_refused',
      'backend.source': 'browser',
    })
    // A server-side call names its function at the call site; a crash has no code.
    expect(monitoringTags(new Error('Server Error'), { function: 'auth:getAuthUser', source: 'server' })).toEqual({
      'backend.function': 'auth:getAuthUser',
      'backend.code': 'none',
      'backend.source': 'server',
    })
  })
})

describe('an envelope', () => {
  it('carries an error event with its stack, oldest frame first, and its tags', () => {
    const error = new Error('Payment provider down')
    error.stack = 'Error: Payment provider down\n    at charge (/app/backend/billing.ts:10:5)\n    at handler (/app/node_modules/convex/dist/server.js:3:1)\n    at /app/backend/run.ts:1:1'
    expect(stackFrames(error.stack)).toEqual([
      { filename: '/app/backend/run.ts', lineno: 1, colno: 1, in_app: true },
      { function: 'handler', filename: '/app/node_modules/convex/dist/server.js', lineno: 3, colno: 1, in_app: false },
      { function: 'charge', filename: '/app/backend/billing.ts', lineno: 10, colno: 5, in_app: true },
    ])
    const event = errorEvent({ error, tags: { 'backend.code': 'none' }, environment: 'development', serverName: 'happy-otter-123' })
    const [header, item, payload] = lines(eventEnvelope(parseMonitoringDsn(DSN)!, event))
    expect(header).toMatchObject({ event_id: event.event_id, dsn: DSN })
    expect(item).toEqual({ type: 'event' })
    expect(payload).toMatchObject({
      level: 'error',
      platform: 'javascript',
      environment: 'development',
      server_name: 'happy-otter-123',
      tags: { 'backend.code': 'none' },
      exception: { values: [{ type: 'Error', value: 'Payment provider down', stacktrace: { frames: expect.any(Array) } }] },
    })
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/)
    // A thrown string becomes an error of its own.
    expect(errorEvent({ error: 'plain' })).toMatchObject({ exception: { values: [{ value: 'plain' }] } })
  })

  it('carries a check-in, with a schedule that creates the monitor and keeps it in step', () => {
    const dsn = parseMonitoringDsn(DSN)!
    const [, item, payload] = lines(checkInEnvelope(dsn, { monitor: 'backend maintenance', status: 'ok', schedule: { every: { minutes: 60 } }, durationMs: 1500 }))
    expect(item).toEqual({ type: 'check_in' })
    expect(payload).toMatchObject({
      monitor_slug: 'backend-maintenance',
      status: 'ok',
      duration: 1.5,
      monitor_config: { schedule: { type: 'interval', value: 1, unit: 'hour' }, checkin_margin: 10, max_runtime: 30, timezone: 'UTC' },
    })
    const cron = lines(checkInEnvelope(dsn, { monitor: 'Send weekly digest!', status: 'in_progress', schedule: { cron: '15 8 * * 1' } }))[2]
    expect(cron).toMatchObject({ monitor_slug: 'send-weekly-digest', monitor_config: { schedule: { type: 'crontab', value: '15 8 * * 1' } } })
    expect(lines(checkInEnvelope(dsn, { monitor: 'x', status: 'ok', schedule: { every: { seconds: 90 } } }))[2]).toMatchObject({ monitor_config: { schedule: { type: 'interval', value: 2, unit: 'minute' } } })
    expect(lines(checkInEnvelope(dsn, { monitor: 'x', status: 'error' }))[2]).not.toHaveProperty('monitor_config')
    expect(monitorSlug('  ')).toBe('job')
  })

  it('is posted once, and a refused or failed post resolves false', async () => {
    const dsn = parseMonitoringDsn(DSN)!
    expect(await postEnvelope(dsn, 'body\n')).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-sentry-envelope' }, body: 'body\n', signal: expect.any(AbortSignal) })
    expect(await postEnvelope(dsn, 'body\n', async () => new Response('', { status: 429 }))).toBe(false)
    expect(await postEnvelope(dsn, 'body\n', async () => {
      throw new Error('fetch() is not allowed in queries and mutations')
    })).toBe(false)
  })

  it('gives up a post the service holds past the timeout, aborting it, and resolves false', async () => {
    vi.useFakeTimers()
    try {
      const dsn = parseMonitoringDsn(DSN)!
      let signal: AbortSignal | undefined
      const hung = postEnvelope(dsn, 'body\n', async (_url, init) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>(() => {})
      })
      await vi.advanceTimersByTimeAsync(REPORT_TIMEOUT_MS)
      expect(await hung).toBe(false)
      expect(signal?.aborted).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('names the BACKEND_ENVIRONMENT env push gave the deployment, and checks jobs in only from one named, never development or preview', () => {
    const cloud = 'https://happy-otter-123.convex.cloud'
    expect(reportingDeployment({ CONVEX_CLOUD_URL: cloud, BACKEND_ENVIRONMENT: 'production' })).toEqual({ serverName: 'happy-otter-123', environment: 'production', checksIn: true })
    for (const environment of ['development', 'preview']) {
      expect(reportingDeployment({ CONVEX_CLOUD_URL: cloud, BACKEND_ENVIRONMENT: environment })).toEqual({ serverName: 'happy-otter-123', environment, checksIn: false })
    }
    // A demo's errors sit apart from production's, and its jobs check in.
    expect(reportingDeployment({ CONVEX_CLOUD_URL: cloud, BACKEND_ENVIRONMENT: 'sandbox' })).toEqual({ serverName: 'happy-otter-123', environment: 'sandbox', checksIn: true })
    // A value that is none of the four kinds names nothing.
    expect(reportingDeployment({ CONVEX_CLOUD_URL: cloud, BACKEND_ENVIRONMENT: 'staging' })).toEqual({ serverName: 'happy-otter-123', environment: 'happy-otter-123', checksIn: false })
    // Unnamed: reports name the deployment, a local one development, and no job checks in.
    expect(reportingDeployment({ CONVEX_CLOUD_URL: cloud })).toEqual({ serverName: 'happy-otter-123', environment: 'happy-otter-123', checksIn: false })
    expect(reportingDeployment({ CONVEX_CLOUD_URL: 'http://127.0.0.1:3210' })).toEqual({ serverName: '127.0.0.1', environment: 'development', checksIn: false })
    expect(reportingDeployment({})).toEqual({ checksIn: false })
  })
})

describe('reportError and checkIn', () => {
  it('post a report and a check-in to the deployment\'s DSN', async () => {
    expect(await reportError(new Error('boom'), { function: 'digest:send', tags: { job: 'digest' } })).toBe(true)
    expect(await checkIn('send weekly digest', { schedule: { cron: '15 8 * * 1' }, durationMs: 20 })).toBe(true)
    const [report, check] = posted()
    expect(report!.url).toBe(ENDPOINT)
    expect(report!.lines[2]).toMatchObject({
      server_name: 'happy-otter-123',
      environment: 'production',
      tags: { 'backend.function': 'digest:send', 'backend.code': 'none', 'backend.source': 'backend', 'job': 'digest' },
    })
    expect(check!.lines[2]).toMatchObject({ monitor_slug: 'send-weekly-digest', status: 'ok', duration: 0.02, environment: 'production' })
  })

  it('report from a dev deployment under development, and never check its jobs in', async () => {
    vi.stubEnv('BACKEND_ENVIRONMENT', 'development')
    expect(await reportError(new Error('boom'))).toBe(true)
    expect(await checkIn('send weekly digest')).toBe(false)
    expect(posted()).toHaveLength(1)
    expect(posted()[0]!.lines[2]).toMatchObject({ environment: 'development' })
  })

  it('skip a refusal, and post nothing without a DSN that parses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await reportError(backendError('forbidden', { reason: 'role' }))).toBe(false)
    vi.stubEnv('MONITORING_DSN', '')
    expect(await reportError(new Error('boom'))).toBe(false)
    expect(await checkIn('job')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('say when the service refuses one, and once when the DSN does not parse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValue(new Response('', { status: 403 }))
    expect(await checkIn('job')).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[nuxt-backend] monitoring.report_failed: A check-in of "job"'))
    warn.mockClear()
    vi.stubEnv('MONITORING_DSN', 'not-a-dsn')
    expect(await reportError(new Error('boom'))).toBe(false)
    expect(await checkIn('job')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MONITORING_DSN is set but is not a DSN'))
  })

  it('report what a wrapped handler throws, then rethrow it', async () => {
    const handler = reportingErrors(async (_ctx: unknown, input: { n: number }) => {
      if (input.n > 1) throw new Error('too many')
      return input.n
    }, { function: 'imports:run' })
    expect(await handler({}, { n: 1 })).toBe(1)
    await expect(handler({}, { n: 2 })).rejects.toThrow('too many')
    expect(posted()).toHaveLength(1)
    expect(posted()[0]!.lines[2]).toMatchObject({ tags: { 'backend.function': 'imports:run' } })
  })
})

describe('checkingIn', () => {
  it('checks a job in with how long it ran, or as an error with the error reported, then rethrown', async () => {
    const handler = checkingIn('send weekly digest', { cron: '15 8 * * 1' }, async (_ctx: unknown, input: { fail: boolean }) => {
      if (input.fail) throw new Error('digest failed')
      return 'sent'
    })
    expect(await handler({}, { fail: false })).toBe('sent')
    expect(posted()[0]!.lines[2]).toMatchObject({ monitor_slug: 'send-weekly-digest', status: 'ok', monitor_config: expect.objectContaining({ schedule: { type: 'crontab', value: '15 8 * * 1' } }) })
    await expect(handler({}, { fail: true })).rejects.toThrow('digest failed')
    const items = posted().slice(1).map(envelope => envelope.lines[1]!.type)
    expect(items.sort()).toEqual(['check_in', 'event'])
    expect(posted().slice(1).find(envelope => envelope.lines[1]!.type === 'check_in')!.lines[2]).toMatchObject({ status: 'error' })
    expect(posted().slice(1).find(envelope => envelope.lines[1]!.type === 'event')!.lines[2]).toMatchObject({ tags: { 'backend.job': 'send-weekly-digest' } })
  })
})

describe('scrubbing', () => {
  it('replaces addresses, credentials and secret parameters in text', () => {
    expect(scrubText('No account for ada@example.com at /verify?token=abc123&next=/home')).toBe('No account for [email] at /verify?token=[Filtered]&next=/home')
    expect(scrubText('Authorization: Bearer eyJhbGciOi.payload.sig failed')).toBe('Authorization: Bearer [Filtered] failed')
    expect(scrubText('api_key=re_123 code=482913 monkey=banana')).toBe('api_key=[Filtered] code=[Filtered] monkey=banana')
  })

  it('reads a secret word anywhere in a compound name, and an address percent-encoded', () => {
    expect(scrubText('fetch failed: https://x.test/cb?invite_token=a1&resetToken=b2&accessToken=c3&sessionId=d4&x-api-key=e5&otp_code=6'))
      .toBe('fetch failed: https://x.test/cb?invite_token=[Filtered]&resetToken=[Filtered]&accessToken=[Filtered]&sessionId=[Filtered]&x-api-key=[Filtered]&otp_code=[Filtered]')
    expect(scrubText('/verify?email=a%40b.com&code=482913')).toBe('/verify?email=[email]&code=[Filtered]')
    // A status, an error code or a count is no secret.
    expect(scrubText('status_code=502 error_code=access_denied key_id=k1 page=2')).toBe('status_code=502 error_code=access_denied key_id=k1 page=2')
  })

  it('reads a quoted value, a JSON field and a header\'s `name: value`', () => {
    expect(scrubText('rejected code="482913" and otp=\'1234\'')).toBe('rejected code="[Filtered]" and otp=\'[Filtered]\'')
    expect(scrubText('body {"token":"abc123","password": "two words","pin":1234,"page":2}')).toBe('body {"token":"[Filtered]","password": "[Filtered]","pin":1234,"page":2}')
    expect(scrubText('{"auth":{"token":"abc"}}')).toBe('{"auth":{"token":"[Filtered]"}}')
    expect(scrubText('headers: x-api-key: re_live_123, cookie: theme=dark')).toBe('headers: x-api-key: [Filtered], cookie: [Filtered]')
    // A status or a time is no secret.
    expect(scrubText('error_code: E_TIMEOUT at 12:30 status: 502')).toBe('error_code: E_TIMEOUT at 12:30 status: 502')
  })

  it('reads the query of a page carried, percent-encoded, in a redirect', () => {
    const welcome = `/welcome?${stringifyQuery({ redirect: '/share?ref=1&token=abc123&email=a%40b.com' })}`
    expect(welcome).toBe('/welcome?redirect=/share?ref=1%26token=abc123%26email=a%2540b.com')
    expect(scrubText(welcome)).toBe('/welcome?redirect=/share?ref=1%26token=[Filtered]%26email=[email]')
    expect(scrubText('/welcome?redirect=%2Fverify%3Fcode%3D482913%26next%3D%2Fhome')).toBe('/welcome?redirect=%2Fverify%3Fcode%3D[Filtered]%26next%3D%2Fhome')
  })

  it('keeps of a user the id alone, and drops a request\'s cookies, body and secret headers', () => {
    const event = scrubEvent({
      message: 'mail to bob@example.test bounced',
      exception: { values: [{ value: 'Invite for carol@example.com expired' }] },
      request: { url: 'https://app.example.com/accept?code=999', cookies: { session: 'x' }, data: { email: 'a@b.co' }, headers: { Authorization: 'Bearer t', Accept: 'text/html' } },
      breadcrumbs: [{ message: 'fetch /api?signature=zz', data: { url: '/x?otp=1' } }],
      user: { id: 'u1', email: 'ada@example.com', ip_address: '1.2.3.4' },
    })
    expect(event).toEqual({
      message: 'mail to [email] bounced',
      exception: { values: [{ value: 'Invite for [email] expired' }] },
      request: { url: 'https://app.example.com/accept?code=[Filtered]', headers: { Authorization: '[Filtered]', Accept: 'text/html' } },
      breadcrumbs: [{ message: 'fetch /api?signature=[Filtered]', data: { url: '/x?otp=[Filtered]' } }],
      user: { id: 'u1' },
    })
  })

  it('runs on what the app\'s SDK sends: events, breadcrumbs and log lines, and the SDK collects no user, cookie or body', () => {
    expect(SCRUBBING.beforeSend({ message: 'for ada@example.com' })).toEqual({ message: 'for [email]' })
    expect(SCRUBBING.beforeBreadcrumb({ category: 'fetch', data: { url: '/api/auth/verify?token=1' } })).toEqual({ category: 'fetch', data: { url: '/api/auth/verify?token=[Filtered]' } })
    expect(SCRUBBING.beforeSendLog({ message: 'invite to bob@example.test', attributes: { to: 'bob@example.test', count: 2 } })).toEqual({ message: 'invite to [email]', attributes: { to: '[email]', count: 2 } })
    expect(DATA_COLLECTION).toMatchObject({ userInfo: false, cookies: false, httpBodies: [] })
  })

  it('walks a log line\'s attributes, where a console call\'s objects arrive whole, replacing every secret-named field', () => {
    // console.warn('sign-in failed for', { email, code }), then console.error({ token }).
    expect(SCRUBBING.beforeSendLog({ message: 'sign-in failed for', attributes: { 'sentry.message.parameter.0': { email: 'a@b.com', code: '123456' }, 'sentry.origin': 'auto.log.console' } }).attributes)
      .toEqual({ 'sentry.message.parameter.0': { email: '[email]', code: '[Filtered]' }, 'sentry.origin': 'auto.log.console' })
    expect(SCRUBBING.beforeSendLog({ message: '', attributes: { token: 'abc', count: 2 } }).attributes).toEqual({ token: '[Filtered]', count: 2 })
  })

  it('scrubs every span the SDK streams, its name and the text of its attributes, and sends no transaction callback it would ignore', () => {
    const span = SCRUBBING.beforeSendSpan({
      name: 'GET /verify?code=482913',
      attributes: {
        'url.full': 'https://app.test/verify?code=482913&email=a%40b.com',
        'http.query': '?code=482913&email=a%40b.com',
        'http.response.status_code': 200,
        'sentry.sdk.integrations': ['Replay'],
        'custom.measure': { value: '/x?token=1', unit: 'none' },
      },
    })
    expect(span).toEqual({
      name: 'GET /verify?code=[Filtered]',
      attributes: {
        'url.full': 'https://app.test/verify?code=[Filtered]&email=[email]',
        'http.query': '?code=[Filtered]&email=[email]',
        'http.response.status_code': 200,
        'sentry.sdk.integrations': ['Replay'],
        'custom.measure': { value: '/x?token=[Filtered]', unit: 'none' },
      },
    })
    expect(SCRUBBING).not.toHaveProperty('beforeSendTransaction')
  })

  it('scrubs a feedback report, which skips beforeSend, once every event processor is done with it', () => {
    let hook: ((event: Record<string, unknown>) => void) | undefined
    scrubbingIntegration().setup({ on: (_name, callback) => (hook = callback as typeof hook) })
    const feedback = { type: 'feedback', contexts: { feedback: { message: 'stuck', url: 'https://app.test/verify?code=1' } }, request: { url: 'https://app.test/verify?code=1' } }
    hook!(feedback)
    expect(feedback).toEqual({ type: 'feedback', contexts: { feedback: { message: 'stuck', url: 'https://app.test/verify?code=[Filtered]' } }, request: { url: 'https://app.test/verify?code=[Filtered]' } })
    // An error event went through beforeSend already: the hook leaves it.
    const error = { message: 'code=1' }
    hook!(error)
    expect(error).toEqual({ message: 'code=1' })
  })

  it('runs on the backend\'s own error reports', () => {
    const event = errorEvent({ error: new Error('No account for ada@example.com') }) as { exception: { values: Array<{ value: string }> } }
    expect(event.exception.values[0]!.value).toBe('No account for [email]')
  })
})

describe('an alert', () => {
  it('is a message event grouped by its kind and tagged with it', () => {
    expect(alertEvent({ alert: 'ai_spend', message: 'AI jobs cost $9.00 so far today.', level: 'warning', data: { usd: 9 }, environment: 'production' })).toMatchObject({
      level: 'warning',
      environment: 'production',
      message: { formatted: 'AI jobs cost $9.00 so far today.' },
      fingerprint: ['nuxt-backend-alert', 'ai_spend'],
      tags: { 'backend.alert': 'ai_spend', 'backend.source': 'backend' },
      extra: { usd: 9 },
    })
  })
})

describe('the tiers of createFunctions', () => {
  const builder = vi.fn((definition: { handler: (ctx: unknown, args: unknown) => unknown }) => definition)
  const tiers = createFunctions({ query: builder as never, mutation: builder as never, action: builder as never }, { components: { backend: { adapter: { findOne: {} as never, updateOne: {} as never } } } })
  const ctx = {
    // A session signed in just now: the admin tier's writes take a recent sign-in.
    auth: { getUserIdentity: async () => ({ subject: 'user-1', role: 'admin', sessionId: 'session-1', authTime: Date.now() }) },
    runQuery: async () => ({ role: 'admin' }),
  }

  it('report a crash of an action\'s handler and rethrow it; a query\'s is reported where it is called', async () => {
    const action = (tiers.authed.action as unknown as (definition: unknown) => { handler: (ctx: unknown, args: unknown) => Promise<unknown> })({
      args: {},
      handler: async () => {
        throw new Error('provider exploded')
      },
    })
    await expect(action.handler(ctx, {})).rejects.toThrow('provider exploded')
    expect(posted()).toHaveLength(1)
    expect(posted()[0]!.lines[2]).toMatchObject({ exception: { values: [{ value: 'provider exploded' }] }, tags: { 'backend.source': 'backend' } })

    const query = (tiers.authed.query as unknown as (definition: unknown) => { handler: (ctx: unknown, args: unknown) => Promise<unknown> })({
      args: {},
      handler: async () => {
        throw new Error('query crash')
      },
    })
    await expect(query.handler(ctx, {})).rejects.toThrow('query crash')
    expect(posted()).toHaveLength(1)
  })

  it('never report the tier\'s own refusal, or a bare handler\'s success', async () => {
    const signedOut = { ...ctx, auth: { getUserIdentity: async () => null } }
    const action = (tiers.admin.action as unknown as (definition: unknown) => { handler: (ctx: unknown, args: unknown) => Promise<unknown> })(async () => 'done')
    await expect(action.handler(signedOut, {})).rejects.toThrow(/Unauthenticated/)
    expect(await action.handler(ctx, {})).toBe('done')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
