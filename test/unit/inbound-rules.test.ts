import { describe, expect, it } from 'vitest'
import {
  authenticSender,
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  contactEmail,
  contactProblem,
  contactRefOf,
  isReservedLocal,
  newContactRef,
  newReplyToken,
  parseAddress,
  replyAddressFor,
  replyTokenOf,
  routeOf,
} from '../../src/convex/inbound-rules'

describe('addresses', () => {
  it('takes a bare address and a named one apart, in lower case', () => {
    expect(parseAddress(' Ana@Example.COM ')).toEqual({ address: 'ana@example.com', local: 'ana', domain: 'example.com' })
    expect(parseAddress('"Ana B." <Ana@example.com>')).toEqual({ address: 'ana@example.com', local: 'ana', domain: 'example.com', name: 'Ana B.' })
    expect(parseAddress('Ana <ana@example.com>')?.name).toBe('Ana')
  })

  it('refuses what is no address', () => {
    for (const value of ['', 'ana', '@example.com', 'ana@', 'a b@example.com', 'ana@example.com, bo@example.com', '<>', undefined, 12]) {
      expect(parseAddress(value), String(value)).toBeNull()
    }
    expect(parseAddress(`${'a'.repeat(250)}@example.com`)).toBeNull()
  })
})

describe('reply addresses', () => {
  it('make a random token that fits the 64 characters before the @, in lower case', () => {
    const token = newReplyToken()
    expect(token).toMatch(/^[a-z2-7]{16}$/)
    expect(newReplyToken()).not.toBe(token)
    const address = replyAddressFor(token, 'In.Panels.app')
    expect(address).toBe(`reply-${token}@in.panels.app`)
    expect(address.indexOf('@')).toBeLessThanOrEqual(64)
  })

  it('are read back from the local part, and only when shaped so', () => {
    const token = newReplyToken()
    expect(replyTokenOf(`reply-${token}`)).toBe(token)
    expect(replyTokenOf(`REPLY-${token.toUpperCase()}`)).toBe(token)
    expect(replyTokenOf('reply-short')).toBeNull()
    expect(replyTokenOf(`reply-${'1'.repeat(16)}`)).toBeNull()
    expect(replyTokenOf('studio')).toBeNull()
  })
})

describe('routing', () => {
  const options = { domain: 'in.panels.app', support: 'support@panels.app' }

  it('leads a reply address, a workspace slug and the support address', () => {
    const token = newReplyToken()
    expect(routeOf(`reply-${token}@in.panels.app`, options)).toEqual({ kind: 'reply', token })
    expect(routeOf('studio@IN.panels.app', options)).toEqual({ kind: 'workspace', slug: 'studio' })
    expect(routeOf('Support@panels.app', options)).toEqual({ kind: 'support' })
  })

  it('leads nowhere for another domain, and for the names mail servers expect', () => {
    expect(routeOf('studio@elsewhere.app', options)).toBeNull()
    expect(routeOf('not an address', options)).toBeNull()
    for (const name of ['postmaster', 'abuse', 'hostmaster', 'webmaster', 'noreply', 'support']) {
      expect(routeOf(`${name}@in.panels.app`, options), name).toBeNull()
      expect(isReservedLocal(name)).toBe(true)
    }
    expect(isReservedLocal('reply-anything')).toBe(true)
    expect(isReservedLocal('studio')).toBe(false)
  })
})

describe('the sender check', () => {
  it('drops a DMARC failure, and asks a reply for a pass', () => {
    expect(authenticSender({ dmarc: 'fail' }, { strict: false })).toBe(false)
    expect(authenticSender({ dmarc: 'pass' }, { strict: true })).toBe(true)
    expect(authenticSender({ dmarc: 'gray', spf: 'pass', dkim: 'pass' }, { strict: true })).toBe(false)
    expect(authenticSender({ dmarc: 'unknown' }, { strict: true })).toBe(false)
    expect(authenticSender(null, { strict: true })).toBe(false)
    expect(authenticSender({ dmarc: 'gray' }, { strict: false })).toBe(true)
    expect(authenticSender(undefined, { strict: false })).toBe(true)
  })
})

describe('the contact message', () => {
  const stranger = { name: 'Mo', email: 'mo@example.com' }

  it('is 10 to 2,000 characters after trimming', () => {
    expect(contactProblem({ ...stranger, message: ' just long enough ' }, { signedIn: false })).toBeNull()
    expect(contactProblem({ ...stranger, message: `  ${'x'.repeat(CONTACT_MESSAGE_MIN - 1)}  ` }, { signedIn: false })).toEqual({ field: 'message', reason: 'too_short' })
    expect(contactProblem({ ...stranger, message: 'x'.repeat(CONTACT_MESSAGE_MAX) }, { signedIn: false })).toBeNull()
    expect(contactProblem({ ...stranger, message: 'x'.repeat(CONTACT_MESSAGE_MAX + 1) }, { signedIn: false })).toEqual({ field: 'message', reason: 'too_long' })
  })

  it('asks a stranger for a name and an address, and a signed-in account for neither', () => {
    const message = 'A message long enough.'
    expect(contactProblem({ message }, { signedIn: false })).toEqual({ field: 'name', reason: 'required' })
    expect(contactProblem({ name: 'Mo', message }, { signedIn: false })).toEqual({ field: 'email', reason: 'required' })
    expect(contactProblem({ name: 'Mo', email: 'nope', message }, { signedIn: false })).toEqual({ field: 'email', reason: 'malformed' })
    expect(contactProblem({ name: 'Mo', email: 'Mo <mo@example.com>', message }, { signedIn: false })).toEqual({ field: 'email', reason: 'malformed' })
    expect(contactProblem({ message }, { signedIn: true })).toBeNull()
    expect(contactProblem({ name: 'x'.repeat(101), message }, { signedIn: true })).toEqual({ field: 'name', reason: 'too_long' })
  })

  it('reaches the team as plain text with a reference the support inbox hands back', () => {
    const ref = newContactRef()
    expect(ref).toMatch(/^[a-z2-7]{12}$/)
    const { subject, text } = contactEmail({ name: 'Mo\r\nBcc: boss@example.com', email: 'mo@example.com', body: '  Hello team.  ', ref })
    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toBe('Message from Mo Bcc: boss@example.com')
    expect(text).toContain('Hello team.')
    expect(text).toContain('<mo@example.com>')
    expect(contactRefOf(text)).toBe(ref)
    expect(contactRefOf('no reference here')).toBeNull()
    expect(contactRefOf(null)).toBeNull()
  })

  it('finds the reference at the foot, past a line of the visitor\'s own that reads like one', () => {
    const ref = newContactRef()
    const { text } = contactEmail({ name: 'Mo', body: 'My booking:\nReference: 202610271234\nCan I move it?', ref })
    expect(contactRefOf(text)).toBe(ref)
  })
})
