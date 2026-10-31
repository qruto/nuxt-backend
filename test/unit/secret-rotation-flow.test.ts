import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHash, createHmac, createPublicKey, verify } from 'node:crypto'
import { authFlow } from '../helpers/auth-flow'
import { authSecrets, firstVerified, formatAuthSecret, liveSecrets } from '../../src/convex/auth-secrets'
import { readUnsubscribeToken, unsubscribeToken } from '../../src/convex/email-preferences'

// The promise `nuxt-backend env rotate AUTH_SECRET` makes, held against real
// Better Auth: after the new secret goes in beside the old one and the
// session signing keys rotate, a session cookie, a session token and a
// signing key stored before the rotation, and an unsubscribe link issued
// before it, all still verify. A change that would sign people out fails
// here before it can ship.

afterEach(() => {
  vi.unstubAllEnvs()
})

const OLD = 'the-secret-every-app-starts-with-0123456789'
const NEW = 'the-secret-a-rotation-writes-9876543210abcd'
const SITE = 'https://happy-otter-123.convex.site'

/** One Better Auth instance reading AUTH_SECRET from the deployment's env, over `db` when given. */
async function deployment(db?: Record<string, Array<Record<string, unknown>>>) {
  return authFlow({ build: { authOptions: { secret: undefined } }, ...(db ? { db } : {}) })
}

async function tokenOf(flow: Awaited<ReturnType<typeof authFlow>>, cookie: string): Promise<string> {
  const response = await flow.get('/convex/token', { cookie })
  expect(response.status).toBe(200)
  return (await response.json() as { token: string }).token
}

type Jwk = { kid: string, alg?: string } & Record<string, unknown>

async function jwksOf(flow: Awaited<ReturnType<typeof authFlow>>): Promise<Jwk[]> {
  const response = await flow.get('/convex/jwks')
  expect(response.status).toBe(200)
  return (await response.json() as { keys: Jwk[] }).keys
}

/** The kid a token's header names. */
function kidOf(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()).kid
}

/** Whether a published key verifies the token's signature, and its issuer and audience are the deployment's. */
function verifies(token: string, keys: Jwk[]): boolean {
  const [header, payload, signature] = token.split('.') as [string, string, string]
  const jwk = keys.find(key => key.kid === kidOf(token))
  if (!jwk) return false
  const { alg } = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg: string }
  const key = createPublicKey({ key: jwk as never, format: 'jwk' })
  const data = Buffer.from(`${header}.${payload}`)
  const bytes = Buffer.from(signature, 'base64url')
  const ok = alg === 'EdDSA' ? verify(null, data, key, bytes) : verify(`sha${alg.slice(2)}`, data, alg.startsWith('ES') ? { key, dsaEncoding: 'ieee-p1363' } : key, bytes)
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { iss: string, aud: string }
  return ok && claims.iss === SITE && claims.aud === 'convex'
}

describe('rotating AUTH_SECRET', () => {
  it('keeps a pre-rotation session, signing key and unsubscribe link working', async () => {
    vi.stubEnv('CONVEX_SITE_URL', SITE)
    vi.stubEnv('AUTH_SECRET', OLD)
    const before = await deployment()
    const ada = await before.signedIn('ada@example.com')
    const oldToken = await tokenOf(before, ada.cookie)
    expect(before.db.jwks).toHaveLength(1)
    const unsubscribe = await unsubscribeToken(OLD, 'contact_1', 'news')

    // The rotation: the new secret beside the old, then the keys rotate (keys:rotate).
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEW }, { version: 0, value: OLD }]))
    for (const row of before.db.jwks!) row.expiresAt = new Date(Date.now() - 1)
    const after = await deployment(before.db)

    // The cookie signed with the old secret still opens the session.
    const session = await after.get('/get-session', { cookie: ada.cookie })
    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({ user: { email: 'ada@example.com' } })

    // The key stored before the rotation is still published, so a token it signed verifies.
    expect(verifies(oldToken, await jwksOf(after))).toBe(true)

    // A new token comes from a new key, encrypted with the new secret.
    const newToken = await tokenOf(after, ada.cookie)
    expect(kidOf(newToken)).not.toBe(kidOf(oldToken))
    expect(verifies(newToken, await jwksOf(after))).toBe(true)
    expect(after.db.jwks).toHaveLength(2)
    expect(String(after.db.jwks!.find(row => !row.expiresAt || new Date(row.expiresAt as Date).getTime() > Date.now())!.privateKey)).toContain('$ba$')

    // An unsubscribe link issued before the rotation still verifies; a new one signs with the new secret.
    const live = liveSecrets(authSecrets())
    expect(live).toEqual([NEW, OLD])
    expect(await firstVerified(live, secret => readUnsubscribeToken(secret, unsubscribe))).toEqual({ contactId: 'contact_1', topic: 'news' })
    expect(await readUnsubscribeToken(NEW, await unsubscribeToken(live[0]!, 'contact_1', 'news'))).toEqual({ contactId: 'contact_1', topic: 'news' })
  })

  it('stops the old secret once it retires', async () => {
    vi.stubEnv('CONVEX_SITE_URL', SITE)
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: 1, value: NEW }]))
    const unsubscribe = await unsubscribeToken(OLD, 'contact_1', 'news')
    expect(await firstVerified(liveSecrets(authSecrets()), secret => readUnsubscribeToken(secret, unsubscribe))).toBeNull()
  })

  it('keeps a passkey recovery code made before a rotation working once the old secret retires', async () => {
    vi.stubEnv('CONVEX_SITE_URL', SITE)
    vi.stubEnv('AUTH_SECRET', OLD)
    const before = await deployment()
    const ada = await before.signedIn('ada@example.com')
    before.db.passkey!.push({ id: 'pk-1', userId: ada.userId, name: 'Laptop', publicKey: 'key', credentialID: 'cred-pk-1', counter: 0, deviceType: 'multiDevice', backedUp: true, createdAt: new Date() })
    const { recoveryCode } = await (await before.post('/passkey-only/set', { enabled: true }, { cookie: ada.cookie })).json() as { recoveryCode: string }

    // Rotated, then the old secret retired: only NEW is left.
    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEW }]))
    const after = await deployment(before.db)
    const response = await after.post('/sign-in/recovery-code', { email: 'ada@example.com', recoveryCode })
    expect(response.status).toBe(200)
  })

  it('keeps a recovery code stored under the keyed scheme working while its secret verifies', async () => {
    vi.stubEnv('CONVEX_SITE_URL', SITE)
    vi.stubEnv('AUTH_SECRET', OLD)
    const before = await deployment()
    const ada = await before.signedIn('ada@example.com')
    before.db.passkey!.push({ id: 'pk-1', userId: ada.userId, name: 'Laptop', publicKey: 'key', credentialID: 'cred-pk-1', counter: 0, deviceType: 'multiDevice', backedUp: true, createdAt: new Date() })
    expect((await before.post('/passkey-only/set', { enabled: true }, { cookie: ada.cookie })).status).toBe(200)
    // A code as the keyed scheme stored it: a MAC under the secret of the time.
    const code = 'AAAAA-BBBBB-CCCCC-DDDDD'
    const keyed = createHmac('sha256', OLD).update(`passkey-recovery:${ada.userId}:AAAAABBBBBCCCCCDDDDD`).digest('hex')
    before.db.user!.find(row => row.id === ada.userId)!.recoveryCodeHash = keyed

    vi.stubEnv('AUTH_SECRET', formatAuthSecret([{ version: Math.floor(Date.now() / 1000), value: NEW }, { version: 0, value: OLD }]))
    const during = await deployment(before.db)
    const recovered = await during.post('/sign-in/recovery-code', { email: 'ada@example.com', recoveryCode: code })
    expect(recovered.status).toBe(200)
    // The code is used up, and the new one it answered is stored plain.
    const { recoveryCode: next } = await recovered.json() as { recoveryCode: string }
    const stored = String(during.db.user!.find(row => row.id === ada.userId)!.recoveryCodeHash)
    expect(stored).toBe(createHash('sha256').update(`passkey-recovery:${ada.userId}:${next.replace(/-/g, '')}`).digest('hex'))
  })
})
