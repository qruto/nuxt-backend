import { describe, expect, it } from 'vitest'
import { AUTH_SECRET_WINDOW_MS, authLibrarySecretOptions, contextSecrets, firstVerified, formatAuthSecret, liveSecrets, oldestSecret, parseAuthSecret, retirementDue } from '../../src/convex/auth-secrets'

const PLAIN = 'OldSecretFromOpenssl+base64/value=='
const NEW = 'NewSecretFromOpenssl+base64/value=='

describe('parseAuthSecret', () => {
  it('reads a plain secret as the current one, with nothing previous', () => {
    expect(parseAuthSecret(PLAIN)).toEqual({ current: PLAIN, previous: [], entries: null })
    expect(parseAuthSecret('')).toBeNull()
    expect(parseAuthSecret(undefined)).toBeNull()
  })

  it('reads a versioned list current first, and round-trips it', () => {
    const raw = formatAuthSecret([{ version: 1730000000, value: NEW }, { version: 0, value: PLAIN }])
    expect(raw).toBe(`1730000000:${NEW},0:${PLAIN}`)
    expect(parseAuthSecret(raw)).toEqual({ current: NEW, previous: [PLAIN], entries: [{ version: 1730000000, value: NEW }, { version: 0, value: PLAIN }] })
  })

  it('reads a value that is not wholly versioned, or repeats a version, as one plain secret', () => {
    expect(parseAuthSecret(`1:${NEW},plain`)?.entries).toBeNull()
    expect(parseAuthSecret(`1:${NEW},1:${PLAIN}`)?.entries).toBeNull()
  })
})

describe('the secrets each reader takes', () => {
  const rotated = parseAuthSecret(`1730000000:${NEW},0:${PLAIN}`)!

  it('signs with the current, verifies with every live one, hashes codes with the oldest', () => {
    expect(liveSecrets(rotated)).toEqual([NEW, PLAIN])
    expect(oldestSecret(rotated)).toBe(PLAIN)
    expect(oldestSecret(parseAuthSecret(PLAIN)!)).toBe(PLAIN)
  })

  it('hands the auth library its versioned secrets, with the plain one as the fallback', () => {
    expect(authLibrarySecretOptions(parseAuthSecret(PLAIN))).toEqual({ secret: PLAIN })
    expect(authLibrarySecretOptions(rotated)).toEqual({ secret: PLAIN, secrets: [{ version: 1730000000, value: NEW }, { version: 0, value: PLAIN }] })
    expect(authLibrarySecretOptions(parseAuthSecret(`1730000000:${NEW}`))).toEqual({ secret: NEW, secrets: [{ version: 1730000000, value: NEW }] })
    expect(authLibrarySecretOptions(null)).toEqual({})
  })

  it('reads the live secrets off an auth library context, current first', () => {
    expect(contextSecrets({ secret: PLAIN, secretConfig: PLAIN })).toEqual([PLAIN])
    expect(contextSecrets({ secret: NEW, secretConfig: { keys: new Map([[0, 'zero'], [1730000000, NEW], [1720000000, 'older']]), currentVersion: 1730000000, legacySecret: 'zero' } })).toEqual([NEW, 'older', 'zero'])
  })

  it('answers the first secret a check accepts', async () => {
    expect(await firstVerified(['a', 'b'], async secret => secret === 'b' && 'ok')).toBe('ok')
    expect(await firstVerified(['a'], async () => false)).toBeNull()
  })
})

describe('retirementDue', () => {
  it('is due once the window since the current secret began signing has passed', () => {
    const started = 1730000000
    const rotated = parseAuthSecret(`${started}:${NEW},0:${PLAIN}`)!
    expect(retirementDue(rotated, started * 1000 + AUTH_SECRET_WINDOW_MS - 1)).toBe(false)
    expect(retirementDue(rotated, started * 1000 + AUTH_SECRET_WINDOW_MS)).toBe(true)
  })
})
