import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APIError } from 'better-auth/api'
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { authRefusal } from '../../src/convex/client/refusals'
import { BACKEND_ERRORS, backendError, type BackendErrorCode, getBackendError, translateBackendError } from '../../src/convex/errors'
import { createTranslate, LABELS } from '../../src/convex/labels'

// The error catalog against everything that leans on it: every refusal the
// package throws names a code the catalog holds, every code has a label, a
// docs entry (generated, and pinned in test/docs/docs-lookups.test.ts), and the reader turns each source a client
// meets back into the same `{ code, data, message }`.

const root = fileURLToPath(new URL('../..', import.meta.url))
const codes = Object.keys(BACKEND_ERRORS) as BackendErrorCode[]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return entry === '_generated' ? [] : sources(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

const files = [...sources(join(root, 'src/convex')), ...sources(join(root, 'src/runtime'))]
  .map(path => ({ path: relative(root, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }))

/** Every code a throw site names: `backendError('<code>'` and `authRefusal('<code>'`, across the package. */
const thrown = files.flatMap(({ path, text }) =>
  [...text.matchAll(/\b(?:backendError|authRefusal)\(\s*'(\w+)'/g)].map(([, code]) => ({ path, code: code! })))

/** The text between a call's parentheses, from the `(` at `open`, skipping over string literals. */
function callArguments(text: string, open: number): string {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const char = text[i]!
    if (char === '\'' || char === '"' || char === '`') {
      for (i++; i < text.length && text[i] !== char; i++) if (text[i] === '\\') i++
      continue
    }
    if (char === '(') depth++
    else if (char === ')' && --depth === 0) return text.slice(open + 1, i)
  }
  return text.slice(open + 1)
}

/** The literals a field is written with, each arm of a conditional included (`x === 'a' ? 'b' : 'c'` writes `b` and `c`). */
function fieldLiterals(args: string, field: string): string[] {
  return [...args.matchAll(new RegExp(`\\b${field}:\\s*([^,}\\n]+)`, 'g'))].flatMap(([, expression]) =>
    [...expression!.matchAll(/(===\s*)?'([a-z_]+)'/g)].filter(([, compared]) => !compared).map(([, , value]) => value!))
}

/** Every `reason` a throw site writes as a literal, with the `service` beside it when it names one. */
const literals = files.flatMap(({ path, text }) =>
  [...text.matchAll(/\b(?:backendError|authRefusal)\(/g)].flatMap((call) => {
    const args = callArguments(text, call.index! + call[0].length - 1)
    const services = fieldLiterals(args, 'service')
    return fieldLiterals(args, 'reason').flatMap((reason): Array<{ path: string, service: string | undefined, reason: string }> =>
      services.length ? services.map(service => ({ path, service, reason })) : [{ path, service: undefined, reason }])
  }))

const errorsPage = readFileSync(join(root, 'website/content/docs/10.reference/08.backend/5.errors.md'), 'utf8')

/** The Reasons tables' rows, one line each. */
const reasonRows = errorsPage.split('## Reasons')[1]!.split('\n').filter(line => line.startsWith('| `'))

describe('the catalog', () => {
  it('finds the throw sites', () => {
    expect(thrown.length).toBeGreaterThan(40)
  })

  it('holds every code a throw site names', () => {
    expect(thrown.filter(({ code }) => !codes.includes(code as BackendErrorCode)).map(({ path, code }) => `${path}: ${code}`)).toEqual([])
  })

  it('throws every code it holds somewhere', () => {
    expect(codes.filter(code => !thrown.some(site => site.code === code))).toEqual([])
  })

  it('finds the reasons and services the throw sites write', () => {
    const found = new Set(literals.map(({ service, reason }) => service ? `${service}/${reason}` : reason))
    for (const value of ['banned', 'not_owner', 'no_customer', 'not_synced', 'email/test_mode', 'email/unconfigured', 'email/provider_refused', 'billing/provider_refused']) {
      expect(found, value).toContain(value)
    }
  })

  it('documents every reason a throw site writes in the Reasons tables, on its service\'s row', () => {
    const missing = literals.filter(({ service, reason }) => !reasonRows.some(row =>
      row.includes(`\`${reason}\``) && (!service || row.startsWith(`| \`${service}\` |`))))
    expect(missing.map(({ path, service, reason }) => `${path}: ${service ? `${service}/` : ''}${reason}`)).toEqual([])
  })

  it('makes every ConvexError through backendError, and every auth refusal through authRefusal', () => {
    // A bare ConvexError carries no code; a bare APIError reaches the client without one.
    // Code only: a doc comment may show one as an example.
    // Any ConvexError outside the catalog's own module, whatever its argument;
    // an APIError by its status name, since `authRefusal` builds its own from a table.
    const bare = files.flatMap(({ path, text }) => [...text.replace(/^\s*(?:\*|\/\/).*$/gm, '').matchAll(/new (ConvexError)\b|new (APIError)\(\s*'(\w+)'/g)]
      .filter(([, convex]) => !(convex && path === 'src/convex/errors.ts'))
      .map(([, convex, api, status]) => convex ? `${path}: ConvexError` : `${path}: ${api}(${status})`))
    expect(bare).toEqual([
      // The 404s of routes that are off.
      'src/convex/client/guards.ts: APIError(NOT_FOUND)',
    ])
  })

  it.each(codes)('%s has an English label', (code) => {
    expect(typeof (LABELS.errors as Record<string, unknown>)[code]).toBe('string')
  })

  // Each code's entry on the Errors page, and its /e/<code> short link, are
  // generated from the catalog: test/docs/docs-lookups.test.ts holds them.
})

describe('backendError', () => {
  it('builds a ConvexError whose data is the code and its fields, and whose message is the detail', () => {
    const error = backendError('insufficient_credits', { meter: 'credits', balance: 0, need: 2 }, 'balance 0, need 2')
    expect(error).toBeInstanceOf(ConvexError)
    expect(error.data).toEqual({ code: 'insufficient_credits', meter: 'credits', balance: 0, need: 2 })
    expect(error.message).toBe('balance 0, need 2')
  })

  it('reads the label as its message when no detail is given, and drops undefined fields', () => {
    const error = backendError('rate_limited', { limit: 'ai', retryAfter: undefined })
    expect(error.data).toEqual({ code: 'rate_limited', limit: 'ai' })
    expect(error.message).toBe('Too many requests. Try again in a moment.')
  })

  it('checks the data against the code\'s validator', () => {
    expect(() => backendError('forbidden', {} as never)).toThrow(TypeError)
    expect(() => backendError('forbidden', { reason: 'role', extra: true } as never)).toThrow(/does not match its catalog entry/)
    // A key the fields object inherits is no field of the catalog's.
    expect(() => backendError('forbidden', { reason: 'role', constructor: 'x' } as never)).toThrow(/does not match its catalog entry/)
    expect(() => backendError('forbidden', { reason: 'role', toString: 'y' } as never)).toThrow(/does not match its catalog entry/)
    expect(() => backendError('insufficient_credits', { balance: Number.NaN, need: 1 })).toThrow(TypeError)
    expect(() => (backendError as (code: string) => unknown)('nope')).toThrow(/no such code/)
  })

  it('carries a list field, each entry checked: feature_required\'s plans', () => {
    const error = backendError('feature_required', { feature: 'reports', plans: ['pro', 'ultra'] })
    expect(error.data).toEqual({ code: 'feature_required', feature: 'reports', plans: ['pro', 'ultra'] })
    expect(error.message).toBe('Your plan doesn\'t include this. Upgrade to use it.')
    expect(backendError('feature_required', { feature: 'reports', plans: [] }).data.plans).toEqual([])
    expect(() => backendError('feature_required', { feature: 'reports', plans: ['pro', 2] } as never)).toThrow(/does not match its catalog entry/)
    expect(() => backendError('feature_required', { feature: 'reports', plans: 'pro' } as never)).toThrow(/does not match its catalog entry/)
    // The reader keeps the list as the catalog types it, and drops one that is not.
    expect(getBackendError(new ConvexError({ code: 'feature_required', feature: 'reports', plans: ['pro'] })))
      .toEqual({ code: 'feature_required', data: { feature: 'reports', plans: ['pro'] }, message: 'Your plan doesn\'t include this. Upgrade to use it.' })
    expect(getBackendError(new ConvexError({ code: 'feature_required', feature: 'reports', plans: [1] }))!.data).toEqual({ feature: 'reports' })
  })

  it('refuses on an auth route with the code\'s status and the fields in the body', () => {
    const refusal = authRefusal('rate_limited', { limit: 'emailOtp', retryAfter: 4200, message: 'Too many.' })
    expect(refusal).toBeInstanceOf(APIError)
    expect(refusal.statusCode).toBe(429)
    expect(refusal.body).toEqual({ code: 'rate_limited', limit: 'emailOtp', retryAfter: 4200, message: 'Too many.' })
    expect(() => authRefusal('forbidden', { message: 'no reason' } as never)).toThrow(TypeError)
  })

  it('answers the code\'s English label as the body\'s message when the refusal carries no sentence of its own', () => {
    expect(authRefusal('rate_limited', { limit: 'emailOtp', retryAfter: 4200 }).body)
      .toEqual({ code: 'rate_limited', limit: 'emailOtp', retryAfter: 4200, message: 'Too many requests. Try again in 5 seconds.' })
    expect(authRefusal('unauthenticated').body).toEqual({ code: 'unauthenticated', message: 'Sign in to continue.' })
  })
})

describe('getBackendError', () => {
  it('reads a backendError, with the throw site\'s sentence for the person when it wrote one', () => {
    expect(getBackendError(backendError('forbidden', { reason: 'customer_taken', message: 'Use another email.' })))
      .toEqual({ code: 'forbidden', data: { reason: 'customer_taken', message: 'Use another email.' }, message: 'Use another email.' })
    expect(getBackendError(backendError('insufficient_credits', { balance: 1, need: 3 }, 'dev detail')))
      .toEqual({ code: 'insufficient_credits', data: { balance: 1, need: 3 }, message: 'Not enough credits: 1 left, 3 needed. Top up to continue.' })
  })

  it('finds a ConvexError by its marker, not its class: a second copy of convex has its own', () => {
    const foreign = Object.assign(new Error('[CONVEX A(ai:transform)] Server Error'), {
      [Symbol.for('ConvexError')]: true,
      data: { code: 'unauthenticated' },
    })
    expect(getBackendError(foreign)).toEqual({ code: 'unauthenticated', data: {}, message: 'Sign in to continue.' })
  })

  it('reads the rate limiter\'s own RateLimited error as rate_limited, with the wait in seconds', () => {
    const limited = new ConvexError({ kind: 'RateLimited', name: 'billingSync', retryAfter: 1500 })
    expect(getBackendError(limited)).toEqual({
      code: 'rate_limited',
      data: { limit: 'billingSync', retryAfter: 1500 },
      message: 'Too many requests. Try again in 2 seconds.',
    })
  })

  it('reads an auth client result, its error, a thrown APIError and an Error caused by one', () => {
    const body = { code: 'unavailable', service: 'email', reason: 'test_mode', message: 'Test mode.', status: 503, statusText: 'Service Unavailable' }
    const expected = { code: 'unavailable', data: { service: 'email', reason: 'test_mode', message: 'Test mode.' }, message: 'Test mode.' }
    expect(getBackendError({ data: null, error: body })).toEqual(expected)
    expect(getBackendError(body)).toEqual(expected)
    expect(getBackendError(new Error('Test mode.', { cause: body }))).toEqual(expected)
    expect(getBackendError(authRefusal('unavailable', { service: 'email', reason: 'test_mode', message: 'Test mode.' }))).toEqual(expected)
  })

  it('maps Better Auth\'s own 401, 403 and 429 by status, leaving its English sentence out', () => {
    expect(getBackendError({ error: { status: 401, statusText: 'Unauthorized', message: 'Unauthorized' } }))
      .toEqual({ code: 'unauthenticated', data: {}, message: 'Sign in to continue.' })
    expect(getBackendError({ error: { status: 403, code: 'YOU_ARE_NOT_ALLOWED_TO_BAN_USERS', message: 'Not allowed.' } }))
      .toEqual({ code: 'forbidden', data: { reason: 'you_are_not_allowed_to_ban_users' }, message: 'You don\'t have access to this.' })
    expect(getBackendError({ error: { status: 403, code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts' } }))
      .toEqual({ code: 'forbidden', data: { reason: 'too_many_attempts' }, message: 'Too many wrong codes. Ask for a new one.' })
    expect(getBackendError({ error: { status: 429, statusText: 'Too Many Requests' } }))
      .toEqual({ code: 'rate_limited', data: {}, message: 'Too many requests. Try again in a moment.' })
  })

  it('maps Better Auth\'s own 400 codes to the input they refuse, worded by the labels', () => {
    const read = (code: string, message: string) => getBackendError({ data: null, error: { code, message, status: 400, statusText: 'BAD_REQUEST' } })
    expect(read('INVALID_OTP', 'Invalid OTP')).toEqual({ code: 'invalid_input', data: { field: 'otp' }, message: 'That code isn\'t right. Check it, or ask for a new one.' })
    expect(read('OTP_EXPIRED', 'OTP expired')).toEqual({ code: 'invalid_input', data: { field: 'otp', reason: 'otp_expired' }, message: 'That code has expired. Ask for a new one.' })
    expect(read('INVALID_EMAIL', 'Invalid email')!.message).toBe('Enter a valid email address.')
    expect(read('ORGANIZATION_SLUG_ALREADY_TAKEN', 'Slug taken')!.data).toEqual({ field: 'slug' })
    expect(read('AUTH_CANCELLED', 'Auth cancelled')).toEqual({ code: 'invalid_input', data: { field: 'passkey', reason: 'passkey_cancelled' }, message: 'The passkey prompt was closed. Try again, or continue with an email code.' })
    expect(read('ERROR_CEREMONY_ABORTED', 'Registration cancelled')!.data).toEqual({ field: 'passkey', reason: 'passkey_cancelled' })
    expect(read('ERROR_INVALID_DOMAIN', 'The domain is not valid')!.data).toEqual({ field: 'passkey' })
    // A code of Better Auth's the map does not name is no refusal of ours.
    expect(read('SOMETHING_NEW', 'New')).toBeNull()
  })

  it('reads the passkey plugin\'s 401 refusals of a passkey sign-in as the passkey refused, not a missing session', () => {
    const read = (code: string) => getBackendError({ data: null, error: { code, message: 'Refused', status: 401, statusText: 'UNAUTHORIZED' } })
    // A passkey removed from the account and still on the device, which autofill offers.
    expect(read('PASSKEY_NOT_FOUND')).toEqual({ code: 'invalid_input', data: { field: 'passkey' }, message: 'That passkey didn\'t work. Try again, or continue with an email code.' })
    expect(read('AUTHENTICATION_FAILED')!.data).toEqual({ field: 'passkey' })
    // Any other 401 is still a missing session.
    expect(read('UNAUTHORIZED')!.code).toBe('unauthenticated')
  })

  it('never shows a placeholder: a label whose numbers are missing falls back to one without them', () => {
    for (const data of [{ code: 'insufficient_credits' }, { code: 'insufficient_credits', balance: 2 }, { code: 'insufficient_credits', balance: 'x', need: 1 }]) {
      const read = getBackendError(new ConvexError(data))!
      expect(read.message).toBe('Not enough credits. Top up to continue.')
      expect(read.message).not.toMatch(/[{}]/)
    }
    expect(getBackendError(new ConvexError({ code: 'insufficient_credits', balance: 0, need: 2 }))!.message)
      .toBe('Not enough credits: 0 left, 2 needed. Top up to continue.')
  })

  it('says what to do per reason where the code\'s own label would mislead', () => {
    const label = (data: Record<string, string>) => getBackendError(new ConvexError(data))!.message
    expect(label({ code: 'not_ready', reason: 'no_customer' })).toBe('Nothing to show yet — this opens after your first purchase.')
    expect(label({ code: 'not_ready', reason: 'not_synced' })).toMatch(/^Nothing to show yet — /)
    expect(label({ code: 'not_ready', reason: 'something_new' })).toBe('Nothing to show yet.')
    // Only a provider's refusal may pass on a retry.
    expect(label({ code: 'unavailable', service: 'billing', reason: 'provider_refused' })).toMatch(/Try again/)
    for (const reason of ['not_configured', 'test_mode', 'unconfigured']) {
      expect(label({ code: 'unavailable', service: 'email', reason }), reason).not.toMatch(/try again/i)
    }
    expect(label({ code: 'unavailable', service: 'email', reason: 'test_mode' })).toMatch(/this address can't receive mail here/)
  })

  it('is null for anything that is not a refusal', () => {
    expect(getBackendError(new Error('boom'))).toBeNull()
    expect(getBackendError(new ConvexError('an app\'s own string'))).toBeNull()
    expect(getBackendError({ data: { ok: true }, error: null })).toBeNull()
    expect(getBackendError({ error: { status: 500, statusText: 'Internal Server Error' } })).toBeNull()
    expect(getBackendError(undefined)).toBeNull()
    const loop: { cause?: unknown } = {}
    loop.cause = loop
    expect(getBackendError(loop)).toBeNull()
  })
})

describe('translateBackendError', () => {
  // A reader's `errors` labels, as an app's French messages would hold them.
  const french = createTranslate({ errors: { forbidden: 'Accès refusé.', invalid_input_email: 'E-mail incorrect.', rate_limited_for: 'Encore {count} instant. | Encore {count} instants.' } })

  it('words a catalog refusal through the reader\'s labels, field and wait included', () => {
    expect(translateBackendError(getBackendError(backendError('forbidden', { reason: 'role' }))!, french)).toBe('Accès refusé.')
    expect(getBackendError(backendError('invalid_input', { field: 'email' }))!.message).toBe('Enter a valid email address.')
    expect(translateBackendError(getBackendError(backendError('invalid_input', { field: 'email' }))!, french)).toBe('E-mail incorrect.')
    expect(translateBackendError(getBackendError(backendError('rate_limited', { retryAfter: 3000 }))!, french)).toBe('Encore 3 instants.')
  })

  it('keeps a sentence written for the person, and names the code when the labels lack it', () => {
    // useLabels never gets here: its labels fall back to English key by key.
    expect(translateBackendError(getBackendError(backendError('forbidden', { reason: 'role', message: 'Owners only.' }))!, french)).toBe('Owners only.')
    expect(translateBackendError(getBackendError(backendError('no_workspace'))!, french)).toBe('no_workspace')
    expect(translateBackendError(getBackendError(backendError('no_workspace'))!, createTranslate())).toBe(LABELS.errors.no_workspace)
  })

  it('words the package\'s own auth refusals through the reader\'s labels: their message is the label, no sentence of the throw site\'s', () => {
    // What the client reads off the route's answer.
    const answered = (refusal: APIError) => getBackendError({ data: null, error: { ...(refusal.body as object), status: refusal.statusCode } })!
    const limited = answered(authRefusal('rate_limited', { limit: 'emailOtp', retryAfter: 3000 }))
    expect(limited).toEqual({ code: 'rate_limited', data: { limit: 'emailOtp', retryAfter: 3000 }, message: 'Too many requests. Try again in 3 seconds.' })
    expect(translateBackendError(limited, french)).toBe('Encore 3 instants.')
    const testMode = answered(authRefusal('unavailable', { service: 'email', reason: 'test_mode' }))
    expect(testMode.data).toEqual({ service: 'email', reason: 'test_mode' })
    expect(translateBackendError(testMode, createTranslate({ errors: { unavailable_test_mode: 'Mode test (fr).' } }))).toBe('Mode test (fr).')
    const refused = answered(authRefusal('forbidden', { reason: 'sign_in_refused' }))
    expect(translateBackendError(refused, createTranslate({ errors: { forbidden_sign_in_refused: 'Invitation obligatoire.' } }))).toBe('Invitation obligatoire.')
    // An app's own sentence still travels as the app wrote it.
    expect(translateBackendError(answered(authRefusal('forbidden', { reason: 'sign_in_refused', message: 'Invite only.' })), french)).toBe('Invite only.')
  })

  it('runs the chain through the reader\'s own labels before the English ones', () => {
    const english = createTranslate()
    const notMember = getBackendError(backendError('forbidden', { reason: 'not_member' }))!
    // The reader words only the generic refusal: theirs wins over the package's English for the reason.
    expect(translateBackendError(notMember, english, french)).toBe('Accès refusé.')
    // The wait, the reader's own; with no sentence of theirs at all, the English one.
    expect(translateBackendError(getBackendError(backendError('rate_limited', { retryAfter: 1000 }))!, english, french)).toBe('Encore 1 instant.')
    expect(translateBackendError(getBackendError(backendError('no_workspace'))!, english, french)).toBe(LABELS.errors.no_workspace)
    expect(translateBackendError(notMember, english)).toBe(LABELS.errors.forbidden_not_member)
  })
})
