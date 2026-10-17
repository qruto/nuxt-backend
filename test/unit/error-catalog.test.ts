import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APIError } from 'better-auth/api'
import { ConvexError } from 'convex/values'
import { describe, expect, it } from 'vitest'
import { authRefusal } from '../../src/convex/client/refusals'
import { BACKEND_ERRORS, backendError, type BackendErrorCode, getBackendError } from '../../src/convex/errors'
import { LABELS } from '../../src/convex/labels'
import { ERROR_CODES } from '../../website/shared/docs-routes'

// The error catalog against everything that leans on it: every refusal the
// package throws names a code the catalog holds, every code has a label, a
// docs entry and a short link, and the reader turns each source a client
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
      // OAuth protocol answers, whose shape the spec fixes, and the 404s of routes that are off.
      'src/convex/client/agent-consent.ts: APIError(UNAUTHORIZED)',
      'src/convex/client/agent-consent.ts: APIError(NOT_FOUND)',
      'src/convex/client/guards.ts: APIError(NOT_FOUND)',
    ])
  })

  it.each(codes)('%s has an English label', (code) => {
    expect(typeof (LABELS.errors as Record<string, unknown>)[code]).toBe('string')
  })

  it.each(codes)('%s has an entry on the Errors page, with its label and status', (code) => {
    const entry = errorsPage.split(`### \`${code}\``)[1]?.split(/^#{2,3} /m)[0]
    expect(entry, code).toBeDefined()
    expect(entry).toContain((LABELS.errors as Record<string, string>)[code])
    expect(entry).toContain(`| ${BACKEND_ERRORS[code].status} |`)
  })

  it('documents no code the catalog does not hold', () => {
    const documented = [...errorsPage.matchAll(/^### `(\w+)`$/gm)].map(([, code]) => code)
    expect(documented).toEqual(codes)
  })

  it('gives every code a short link, /e/<code>', () => {
    expect([...ERROR_CODES]).toEqual(codes)
  })
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
    expect(() => backendError('insufficient_credits', { balance: Number.NaN, need: 1 })).toThrow(TypeError)
    expect(() => (backendError as (code: string) => unknown)('nope')).toThrow(/no such code/)
  })

  it('refuses on an auth route with the code\'s status and the fields in the body', () => {
    const refusal = authRefusal('rate_limited', { limit: 'emailOtp', retryAfter: 4200, message: 'Too many.' })
    expect(refusal).toBeInstanceOf(APIError)
    expect(refusal.statusCode).toBe(429)
    expect(refusal.body).toEqual({ code: 'rate_limited', limit: 'emailOtp', retryAfter: 4200, message: 'Too many.' })
    expect(() => authRefusal('forbidden', { message: 'no reason' } as never)).toThrow(TypeError)
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

  it('maps Better Auth\'s own 401, 403 and 429 by status', () => {
    expect(getBackendError({ error: { status: 401, statusText: 'Unauthorized' } })).toMatchObject({ code: 'unauthenticated' })
    expect(getBackendError({ error: { status: 403, code: 'YOU_ARE_NOT_ALLOWED_TO_BAN_USERS', message: 'Not allowed.' } }))
      .toEqual({ code: 'forbidden', data: { reason: 'you_are_not_allowed_to_ban_users', message: 'Not allowed.' }, message: 'Not allowed.' })
    expect(getBackendError({ error: { status: 429, statusText: 'Too Many Requests' } }))
      .toEqual({ code: 'rate_limited', data: {}, message: 'Too many requests. Try again in a moment.' })
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
