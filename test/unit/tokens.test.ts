import { describe, expect, test } from 'vitest'
import { normalizeEmail, randomToken, sha256Hex } from '../../src/convex/tokens'

// The token helpers: random, URL-safe, and stored as a SHA-256 hex.

describe('randomToken', () => {
  test('is 32 random bytes as 43 URL-safe characters by default', () => {
    const token = randomToken()
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(randomToken()).not.toBe(token)
  })

  test('takes the bytes of entropy, written unpadded', () => {
    expect(randomToken(16)).toMatch(/^[\w-]{22}$/)
    expect(randomToken(64)).toMatch(/^[\w-]{86}$/)
    expect(randomToken(33)).toMatch(/^[\w-]{44}$/)
  })

  test('draws every character of the alphabet over many tokens', () => {
    const seen = new Set(Array.from({ length: 400 }, () => randomToken()).join(''))
    expect(seen.size).toBe(64)
  })

  test.each([0, 8, 15, 1025, 32.5, Number.NaN, Number.POSITIVE_INFINITY])('refuses %s bytes', (bytes) => {
    expect(() => randomToken(bytes)).toThrow(TypeError)
  })
})

describe('sha256Hex', () => {
  test('is the lower-case hex SHA-256 of the UTF-8 text', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex('ünï')).toMatch(/^[0-9a-f]{64}$/)
  })

  test('the same token finds its hash and a different one does not', async () => {
    const token = randomToken()
    expect(await sha256Hex(token)).toBe(await sha256Hex(token))
    expect(await sha256Hex(token)).not.toBe(await sha256Hex(randomToken()))
  })
})

describe('normalizeEmail', () => {
  test('trims and lower-cases, and rewrites nothing else', () => {
    expect(normalizeEmail('  Ana@Example.COM ')).toBe('ana@example.com')
    expect(normalizeEmail('ana+tag@example.com')).toBe('ana+tag@example.com')
    expect(normalizeEmail('')).toBe('')
  })
})
