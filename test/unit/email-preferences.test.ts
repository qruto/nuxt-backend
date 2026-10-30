import { describe, expect, test, vi } from 'vitest'
import {
  capsProblem,
  confirmationToken,
  LAYOUT_FOOTER_END,
  quietHoursEnd,
  readConfirmationToken,
  readUnsubscribeToken,
  resolveCaps,
  topicsProblem,
  unsubscribeToken,
  withTopicFooter,
} from '../../src/convex/email-preferences'
import { createEmailPreferences } from '../../src/convex/integrations/email-preferences'

// The rules behind email topics, run without a deployment: what setupEmail
// refuses, the signed links, the quiet hours across midnight and time zones,
// the topic footer, and what a send under a topic carries once it passes.

const SECRET = 'unit-secret-0123456789abcdefghijkl'

describe('declarations', () => {
  test('refuse a key, words or defaults the provider would not take', () => {
    expect(topicsProblem({ productNews: { name: 'Product news', description: 'Monthly.', subscribedByDefault: false } })).toBeNull()
    expect(topicsProblem({ 'product-news': { name: 'x', description: 'y', subscribedByDefault: false } })).toMatch(/topic key/)
    expect(topicsProblem({ news: { name: 'x'.repeat(51), description: 'y', subscribedByDefault: false } })).toMatch(/name: 1 to 50/)
    expect(topicsProblem({ news: { name: 'x', description: 'y'.repeat(201), subscribedByDefault: false } })).toMatch(/description: 1 to 200/)
    expect(topicsProblem({ news: { name: 'x', description: 'y' } as never })).toMatch(/subscribedByDefault/)
    expect(topicsProblem({ news: { name: 'x', description: 'y', subscribedByDefault: true, doubleOptIn: true } })).toMatch(/confirm/)
  })

  test('refuse caps that are not whole numbers or clock times', () => {
    expect(capsProblem({ perWeek: 3, quietHours: { start: '21:00', end: '08:00' }, sunsetAfterDays: 180 })).toBeNull()
    expect(capsProblem({ perWeek: 0 })).toMatch(/perWeek/)
    // The cap remembers 50 sends per address: a higher one could never be reached.
    expect(capsProblem({ perWeek: 50 })).toBeNull()
    expect(capsProblem({ perWeek: 70 })).toMatch(/perWeek: a whole number of emails from 1 to 50/)
    expect(capsProblem({ sunsetAfterDays: 1.5 })).toMatch(/sunsetAfterDays/)
    expect(capsProblem({ quietHours: { start: '9pm', end: '08:00' } })).toMatch(/HH:MM/)
    expect(capsProblem({ quietHours: { start: '08:00', end: '08:00' } })).toMatch(/differ/)
    expect(resolveCaps({}).sunsetAfterMs).toBe(180 * 24 * 60 * 60 * 1000)
  })
})

describe('signed links', () => {
  test('an unsubscribe token names its contact and topic, and only under its secret', async () => {
    const token = await unsubscribeToken(SECRET, 'k1234', 'productNews')
    expect(await readUnsubscribeToken(SECRET, token)).toEqual({ contactId: 'k1234', topic: 'productNews' })
    expect(await readUnsubscribeToken('another-secret-0123456789abcdefgh', token)).toBeNull()
    expect(await readUnsubscribeToken(SECRET, token.replace('productNews', 'stripTips'))).toBeNull()
    expect(await readUnsubscribeToken(SECRET, 'garbage')).toBeNull()
  })

  test('a confirmation token lapses', async () => {
    const now = Date.UTC(2026, 9, 27)
    const token = await confirmationToken(SECRET, 'k1234', 'productNews', now + 1000)
    expect(await readConfirmationToken(SECRET, token, now)).toEqual({ contactId: 'k1234', topic: 'productNews' })
    expect(await readConfirmationToken(SECRET, token, now + 1000)).toBeNull()
    expect(await readConfirmationToken(SECRET, await confirmationToken(SECRET, 'k1234', '*', now + 1000), now)).toBeNull()
  })
})

describe('quiet hours', () => {
  const window = resolveCaps({ quietHours: { start: '21:00', end: '08:00' } }).quietHours

  test('hold a send inside the window until its end, across midnight', () => {
    expect(quietHoursEnd(Date.UTC(2026, 9, 27, 12), 'UTC', window)).toBeNull()
    expect(quietHoursEnd(Date.UTC(2026, 9, 27, 22, 30), 'UTC', window)).toBe(Date.UTC(2026, 9, 28, 8))
    expect(quietHoursEnd(Date.UTC(2026, 9, 28, 3, 15), undefined, window)).toBe(Date.UTC(2026, 9, 28, 8))
  })

  test('read the person\'s own time zone', () => {
    // 20:30 UTC is 21:30 in Berlin in December (UTC+1), inside; 15:30 in New York, outside.
    expect(quietHoursEnd(Date.UTC(2026, 11, 1, 20, 30), 'Europe/Berlin', window)).toBe(Date.UTC(2026, 11, 2, 7))
    expect(quietHoursEnd(Date.UTC(2026, 11, 1, 20, 30), 'America/New_York', window)).toBeNull()
  })

  test('end at the wall clock\'s end on a night the clocks change', () => {
    const window = { start: 21 * 60, end: 8 * 60 }
    // 22:00 CEST on 24 October 2026; the clocks go back an hour that night: 08:00 CET is 07:00 UTC.
    expect(quietHoursEnd(Date.UTC(2026, 9, 24, 20), 'Europe/Berlin', window)).toBe(Date.UTC(2026, 9, 25, 7))
    // 22:00 CET on 28 March 2026; the clocks go forward an hour that night: 08:00 CEST is 06:00 UTC.
    expect(quietHoursEnd(Date.UTC(2026, 2, 28, 21), 'Europe/Berlin', window)).toBe(Date.UTC(2026, 2, 29, 6))
    // An end the clocks skip (02:30 that night): the first instant after the window, 03:30 CEST.
    expect(quietHoursEnd(Date.UTC(2026, 2, 28, 21), 'Europe/Berlin', { start: 21 * 60, end: 2 * 60 + 30 })).toBe(Date.UTC(2026, 2, 29, 1, 30))
  })
})

describe('the topic footer', () => {
  test('goes inside the layout\'s footer, else before the body ends, and into the text', () => {
    const footer = { address: 'Panels Ltd, 1 <Example> St', unsubscribeUrl: 'https://app.example.com/unsubscribe?token=a&b', unsubscribeLabel: 'Unsubscribe' }
    const inLayout = withTopicFooter({ html: `<td>Sent by Panels${LAYOUT_FOOTER_END}</td>`, text: 'Hi' }, footer)
    expect(inLayout.html).toContain('Panels Ltd, 1 &lt;Example&gt; St<br><a href="https://app.example.com/unsubscribe?token=a&amp;b"')
    expect(inLayout.html!.indexOf('data-nb-topic-footer')).toBeLessThan(inLayout.html!.indexOf(LAYOUT_FOOTER_END))
    expect(inLayout.text).toBe('Hi\n\nPanels Ltd, 1 <Example> St\nUnsubscribe: https://app.example.com/unsubscribe?token=a&b')
    expect(withTopicFooter({ html: '<html><body><p>Hi</p></body></html>' }, footer).html).toMatch(/data-nb-topic-footer.*<\/body>/)
  })
})

describe('a send under a topic', () => {
  test('carries the RFC 8058 headers, the marketing sender, the footer and the hold of the quiet hours', async () => {
    vi.stubEnv('AUTH_SECRET', SECRET)
    vi.stubEnv('SITE_URL', 'https://app.example.com/')
    vi.stubEnv('CONVEX_SITE_URL', 'https://slug.convex.site')
    vi.stubEnv('EMAIL_MARKETING_FROM', 'Panels News <news@news.example.com>')
    const at = Date.now() + 60_000
    const runMutation = vi.fn().mockResolvedValue({ outcome: 'send', contactId: 'k1234', at })
    const preferences = createEmailPreferences({
      refs: { gate: 'gate' } as never,
      topics: { stripTips: { name: 'Strip tips', description: 'Ideas.', subscribedByDefault: false } },
      caps: {},
      address: () => 'Panels Ltd, Dublin',
      unsubscribePath: '/unsubscribe',
      sendConfirmation: async () => null,
    })
    const prepared = await preferences.prepare({ runMutation } as never, { to: 'Ada@Example.com', html: '<p>Hi</p>', text: 'Hi', headers: [{ name: 'List-Unsubscribe', value: '<mailto:old@example.com>' }] }, 'stripTips', async () => ({ unsubscribe: 'Abmelden' }))
    expect(runMutation).toHaveBeenCalledWith('gate', expect.objectContaining({ email: 'ada@example.com', topic: { key: 'stripTips', subscribedByDefault: false } }))
    const token = await unsubscribeToken(SECRET, 'k1234', 'stripTips')
    expect(prepared).toMatchObject({
      from: 'Panels News <news@news.example.com>',
      deliverAt: at,
      headers: [
        { name: 'List-Unsubscribe', value: `<https://slug.convex.site/email/unsubscribe?token=${encodeURIComponent(token)}>` },
        { name: 'List-Unsubscribe-Post', value: 'List-Unsubscribe=One-Click' },
      ],
    })
    expect(prepared!.text).toContain(`Abmelden: https://app.example.com/unsubscribe?token=${encodeURIComponent(token)}`)
    expect(prepared!.html).toContain('Panels Ltd, Dublin')
    vi.unstubAllEnvs()
  })

  test('links to the unsubscribe page where nuxt.config moved it', async () => {
    vi.stubEnv('AUTH_SECRET', SECRET)
    vi.stubEnv('SITE_URL', 'https://app.example.com')
    vi.stubEnv('CONVEX_SITE_URL', 'https://slug.convex.site')
    const runMutation = vi.fn().mockResolvedValue({ outcome: 'send', contactId: 'k1234', at: Date.now() })
    const preferences = createEmailPreferences({
      refs: { gate: 'gate' } as never,
      topics: { stripTips: { name: 'Strip tips', description: 'Ideas.', subscribedByDefault: false } },
      caps: {},
      address: () => 'Panels Ltd, Dublin',
      unsubscribePath: '/emails/leave',
      sendConfirmation: async () => null,
    })
    const prepared = await preferences.prepare({ runMutation } as never, { to: 'ada@example.com', text: 'Hi' }, 'stripTips', async () => ({ unsubscribe: 'Unsubscribe' }))
    const token = await unsubscribeToken(SECRET, 'k1234', 'stripTips')
    expect(prepared!.text).toContain(`Unsubscribe: https://app.example.com/emails/leave?token=${encodeURIComponent(token)}`)
    vi.unstubAllEnvs()
  })

  test('to two people at once is refused', async () => {
    const preferences = createEmailPreferences({ refs: {} as never, topics: { stripTips: { name: 'x', description: 'y', subscribedByDefault: false } }, caps: {}, address: () => undefined, unsubscribePath: '/unsubscribe', sendConfirmation: async () => null })
    await expect(preferences.prepare({ runMutation: vi.fn() } as never, { to: ['a@example.com', 'b@example.com'] }, 'stripTips', async () => ({ unsubscribe: 'x' }))).rejects.toThrow(/one address/)
  })
})
