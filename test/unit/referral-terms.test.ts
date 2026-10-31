import { componentsGeneric } from 'convex/server'
import { describe, expect, it } from 'vitest'
import { setupBilling, setupReferrals } from '../../src/convex/integrations/billing'
import { setupEmail } from '../../src/convex/integrations/email'
import { codeFromInput, DEFAULT_REFERRAL_HOLD_MS, mailboxOf, MIN_REFERRAL_HOLD_MS, monthKey, newShareCode, normalizeShareCode } from '../../src/convex/referral-rules'

// What a referral program accepts at setup, and the vocabulary every side
// reads: a share code as people type, paste and misread it, the mailbox that
// tells a self-referral apart, and the month a reward counts in.

const DAY = 24 * 60 * 60 * 1000
const components = componentsGeneric()
const billing = setupBilling(components as never, { email: setupEmail(components as never) })
const termsOf = (options: Omit<Parameters<typeof setupReferrals>[1], 'billing'>) => setupReferrals(components as never, { billing, ...options }).terms

describe('setupReferrals', () => {
  it('refuses anything but the app\'s setupBilling instance', () => {
    for (const given of [undefined, {}, { api: billing.api }]) {
      expect(() => setupReferrals(components as never, { billing: given as never })).toThrow(/`billing` is not a setupBilling instance/)
    }
  })

  it('holds a reward 30 days by default, never less than the 14-day withdrawal period, and caps nothing', () => {
    expect(termsOf({})).toEqual({ rewards: {}, holdMs: DEFAULT_REFERRAL_HOLD_MS, caps: { perReferrer: null, perMonth: null } })
    expect(DEFAULT_REFERRAL_HOLD_MS).toBe(30 * DAY)
    expect(termsOf({ hold: DAY }).holdMs).toBe(MIN_REFERRAL_HOLD_MS)
    expect(MIN_REFERRAL_HOLD_MS).toBe(14 * DAY)
    expect(termsOf({ hold: 45 * DAY, caps: { perReferrer: 1, perMonth: 1_000_000 } })).toMatchObject({ holdMs: 45 * DAY, caps: { perReferrer: 1, perMonth: 1_000_000 } })
  })

  it('keeps each side\'s reward as it was named, a plan for free months included', () => {
    expect(termsOf({ rewards: { referred: { trialDays: 30 }, referrer: { months: 12, plan: 'pro-annual' } } }).rewards)
      .toEqual({ referred: { trialDays: 30 }, referrer: { months: 12, plan: 'pro-annual' } })
    expect(termsOf({ rewards: { referred: { discount: 'friend_25' }, referrer: { pack: 'credits-100' } } }).rewards)
      .toEqual({ referred: { discount: 'friend_25' }, referrer: { pack: 'credits-100' } })
    expect(termsOf({ rewards: { referrer: { months: 1 } } }).rewards).toEqual({ referrer: { months: 1 } })
  })

  it.each([
    ['a trial of no days', { rewards: { referred: { trialDays: 0 } } }, /rewards\.referred is/],
    ['a trial past 30 days', { rewards: { referred: { trialDays: 31 } } }, /rewards\.referred is/],
    ['a trial of part of a day', { rewards: { referred: { trialDays: 1.5 } } }, /rewards\.referred is/],
    ['a discount key with spaces', { rewards: { referred: { discount: 'a friend' } } }, /rewards\.referred is/],
    ['a discount and a trial at once', { rewards: { referred: { discount: 'friend', trialDays: 7 } } }, /rewards\.referred is/],
    ['no months', { rewards: { referrer: { months: 0 } } }, /rewards\.referrer is/],
    ['more than a year of months', { rewards: { referrer: { months: 13 } } }, /rewards\.referrer is/],
    ['a plan key that is none', { rewards: { referrer: { months: 1, plan: 'pro plan' } } }, /rewards\.referrer is/],
    ['a pack and months at once', { rewards: { referrer: { pack: 'credits', months: 1 } } }, /rewards\.referrer is/],
    ['a pack key longer than 64 characters', { rewards: { referrer: { pack: 'p'.repeat(65) } } }, /rewards\.referrer is/],
    ['a hold of no time', { hold: 0 }, /hold is a number of milliseconds/],
    ['a hold that never ends', { hold: Number.POSITIVE_INFINITY }, /hold is a number of milliseconds/],
    ['a hold that is no number', { hold: '30d' }, /hold is a number of milliseconds/],
    ['a cap of none', { caps: { perReferrer: 0 } }, /caps\.perReferrer is a whole number/],
    ['a cap of part of a reward', { caps: { perMonth: 2.5 } }, /caps\.perMonth is a whole number/],
  ])('refuses %s at setup', (_what, options, message) => {
    expect(() => termsOf(options as never)).toThrow(message)
  })

  it('refuses a referrer reward with a billing setup that resolves its own entities, which hides where the reward would land', () => {
    const own = setupBilling(components as never, { email: setupEmail(components as never), resolveEntity: async () => null })
    for (const referrer of [{ pack: 'credits-100' }, { months: 1 }]) {
      expect(() => setupReferrals(components as never, { billing: own, rewards: { referrer } })).toThrow(/setupReferrals: rewards\.referrer .*setupBilling's `resolveEntity`.* Drop `resolveEntity`.* or `rewards\.referrer`/)
    }
    // The person referred has theirs at checkout, from their own billing: it is kept.
    expect(setupReferrals(components as never, { billing: own, rewards: { referred: { trialDays: 7 } } }).terms.rewards).toEqual({ referred: { trialDays: 7 } })
  })
})

describe('a share code', () => {
  it('is eight characters of an alphabet without characters that look alike, and reads back as itself', () => {
    for (let n = 0; n < 50; n++) {
      const code = newShareCode()
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
      expect(normalizeShareCode(code)).toBe(code)
    }
  })

  it('is read as typed: any case, spaced or dashed, with O for 0 and I or L for 1', () => {
    expect(codeFromInput('ab12cd34')).toBe('AB12CD34')
    expect(codeFromInput('  AB12 CD34 ')).toBe('AB12CD34')
    expect(codeFromInput('ab12-cd34')).toBe('AB12CD34')
    expect(codeFromInput('ABO2CDIL')).toBe('AB02CD11')
  })

  it('is cut from a pasted /r/ link, its query and fragment left out', () => {
    expect(codeFromInput('https://app.example.com/r/ab12cd34')).toBe('AB12CD34')
    expect(codeFromInput('https://app.example.com/r/AB12CD34?utm_source=x#top')).toBe('AB12CD34')
    expect(codeFromInput('/r/AB12CD34/')).toBe('AB12CD34')
  })

  it('is none for input no code can be: too short, too long, or letters the alphabet leaves out', () => {
    for (const input of ['', 'AB12CD3', 'AB12CD345', 'AB12CDU4', 'AB12CD!4', 'https://app.example.com/r/', 'x'.repeat(300)]) {
      expect(codeFromInput(input)).toBeNull()
    }
  })
})

describe('mailboxOf', () => {
  it('reads one person\'s addresses as one mailbox: any case, a +label, dots in the local part', () => {
    const mailbox = mailboxOf('ada.byron@example.com')
    for (const address of ['Ada.Byron@Example.com', 'adabyron+friends@example.com', ' a.d.a.b.y.r.o.n+1@example.com ']) {
      expect(mailboxOf(address)).toBe(mailbox)
    }
    expect(mailbox).toBe('adabyron@example.com')
  })

  it('keeps the domain apart, and an address with nothing before its @ as it is', () => {
    expect(mailboxOf('ada@example.com')).not.toBe(mailboxOf('ada@example.org'))
    // The dots of the domain stay.
    expect(mailboxOf('ada@mail.example.com')).toBe('ada@mail.example.com')
    expect(mailboxOf('@example.com')).toBe('@example.com')
    expect(mailboxOf('not-an-address')).toBe('not-an-address')
    // A local part that starts with the tag is all tag: kept, not emptied.
    expect(mailboxOf('+ada@example.com')).toBe('+ada@example.com')
  })
})

describe('monthKey', () => {
  it('is the UTC calendar month a reward counts in', () => {
    expect(monthKey(Date.UTC(2026, 9, 31, 23, 59, 59, 999))).toBe('2026-10')
    expect(monthKey(Date.UTC(2026, 10, 1))).toBe('2026-11')
    expect(monthKey(Date.UTC(2027, 0, 1))).toBe('2027-01')
  })
})
