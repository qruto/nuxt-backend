import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { authFlow } from '../helpers/auth-flow'
import { formatAuthSecret } from '../../src/convex/auth-secrets'
import { resignedValue, secretRotationPlugin } from '../../src/convex/client/secret-rotation'

// The other half of the promise `nuxt-backend env rotate AUTH_SECRET` makes
// (secret-rotation-flow.test.ts holds the browser's cookie): an API client
// that sends its session token as a Bearer stays signed in through the
// rotation, and the re-signing touches nothing it should not, a value no
// live secret signed, a cookie that is no signed value, or anything at all
// while AUTH_SECRET holds one secret.

afterEach(() => {
  vi.unstubAllEnvs()
})

const OLD = 'the-secret-every-app-starts-with-0123456789'
const NEW = 'the-secret-a-rotation-writes-9876543210abcd'
const RETIRED = 'a-secret-retired-long-ago-000000000000000000'
const SITE = 'https://happy-otter-123.convex.site'

async function deployment(db?: Record<string, Array<Record<string, unknown>>>) {
  return authFlow({ build: { authOptions: { secret: undefined } }, ...(db ? { db } : {}) })
}

/** A value signed as the auth library signs a cookie: `<value>.<base64 HMAC-SHA-256>`, URL-encoded. */
const signed = (value: string, secret: string) => encodeURIComponent(`${value}.${createHmac('sha256', secret).update(value).digest('base64')}`)

/** The session the auth library reads for a request with this Bearer, or `null`. */
async function sessionFor(flow: Awaited<ReturnType<typeof deployment>>, bearer: string) {
  const response = await flow.get('/get-session', { bearer })
  expect(response.status).toBe(200)
  return await response.json() as { user: { email: string } } | null
}

const rotated = () => formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEW }, { version: 0, value: OLD }])

describe('rotating AUTH_SECRET, for an API client', () => {
  it('keeps a Bearer session token signed before the rotation working, until the old secret retires', async () => {
    vi.stubEnv('CONVEX_SITE_URL', SITE)
    vi.stubEnv('AUTH_SECRET', OLD)
    const before = await deployment()
    const ada = await before.signedIn('ada@example.com')
    // The token as the bearer plugin's `set-auth-token` hands it out: the session cookie's value.
    const token = /session_token=([^;]+)/.exec(ada.cookie)![1]!
    expect(await sessionFor(before, token)).toMatchObject({ user: { email: 'ada@example.com' } })

    vi.stubEnv('AUTH_SECRET', rotated())
    const during = await deployment(before.db)
    expect(await sessionFor(during, token)).toMatchObject({ user: { email: 'ada@example.com' } })
    // A token signed with the new secret, and the raw token the plugin signs itself, are left as they are and work too.
    expect(await sessionFor(during, signed(ada.token, NEW))).toMatchObject({ user: { email: 'ada@example.com' } })
    expect(await sessionFor(during, ada.token)).toMatchObject({ user: { email: 'ada@example.com' } })

    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEW }]))
    const after = await deployment(before.db)
    expect(await sessionFor(after, token)).toBeNull()
  })

  it('never opens a session for a token a secret no longer live signed', async () => {
    vi.stubEnv('CONVEX_SITE_URL', SITE)
    vi.stubEnv('AUTH_SECRET', OLD)
    const before = await deployment()
    const ada = await before.signedIn('ada@example.com')
    vi.stubEnv('AUTH_SECRET', rotated())
    const during = await deployment(before.db)
    expect(await sessionFor(during, signed(ada.token, RETIRED))).toBeNull()
    const name = /([^=;\s]*session_token)=/.exec(ada.cookie)![1]!
    expect(await (await during.get('/get-session', { cookie: `${name}=${signed(ada.token, RETIRED)}` })).json()).toBeNull()
  })
})

// The plugin's own hook, called directly: what it does to each cookie of a
// header is not visible from a route, which reads only the session's.
describe('the re-signing hook', () => {
  const context = (secrets: string[]) => ({
    secret: secrets[0]!,
    secretConfig: { keys: new Map(secrets.map((secret, index) => [secrets.length - index, secret])), currentVersion: secrets.length },
  })
  const onRequest = (headers: Record<string, string>, secrets: string[]) =>
    (secretRotationPlugin() as unknown as { onRequest: (request: Request, context: unknown) => Promise<{ request: Request } | undefined> })
      .onRequest(new Request('https://app.example.com/api/auth/get-session', { headers }), context(secrets))

  it('re-signs the cookie a previous secret signed, and leaves every other pair of the header as it came', async () => {
    const others = [
      'theme=dark',
      'flag',
      // URL-encoding a decoder refuses.
      'broken=%E0%A4%A',
      'nodot=abcdef',
      'leading=.abc',
      'short=abc.def',
      `current=${signed('token-2', NEW)}`,
      `retired=${signed('token-3', RETIRED)}`,
      // A signature's length and padding, but no base64.
      `garbage=token-4.${'!'.repeat(43)}=`,
    ]
    const header = ['session_token=' + signed('token-1', OLD), ...others].join('; ')
    const result = await onRequest({ cookie: header }, [NEW, OLD])
    expect(result!.request.headers.get('cookie')).toBe([`session_token=${signed('token-1', NEW)}`, ...others].join('; '))
  })

  it('changes nothing while AUTH_SECRET holds one secret, or when no value needs it', async () => {
    const stale = { cookie: `session_token=${signed('token-1', OLD)}`, authorization: `Bearer ${signed('token-1', OLD)}` }
    expect(await onRequest(stale, [NEW])).toBeUndefined()
    expect(await (secretRotationPlugin() as unknown as { onRequest: (request: Request, context: unknown) => Promise<unknown> })
      .onRequest(new Request('https://app.example.com/api/auth/get-session', { headers: stale }), { secret: NEW })).toBeUndefined()
    expect(await onRequest({ cookie: `session_token=${signed('token-1', NEW)}`, authorization: 'Basic YWRhOnNlY3JldA==' }, [NEW, OLD])).toBeUndefined()
  })

  it('re-signs a Bearer token whatever the scheme\'s case, and keeps the cookie header when only the Bearer changed', async () => {
    const result = await onRequest({ authorization: `bearer ${signed('token-1', OLD)}`, cookie: 'theme=dark' }, [NEW, OLD])
    expect(result!.request.headers.get('authorization')).toBe(`Bearer ${signed('token-1', NEW)}`)
    expect(result!.request.headers.get('cookie')).toBe('theme=dark')
  })

  it('reads a value that is not URL-encoded as one that is', async () => {
    const raw = `token-1.${createHmac('sha256', OLD).update('token-1').digest('base64')}`
    expect(await resignedValue(raw, [NEW, OLD])).toBe(signed('token-1', NEW))
    expect(await resignedValue(raw, [NEW])).toBeNull()
  })
})
