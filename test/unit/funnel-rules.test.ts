import { describe, expect, test } from 'vitest'
import { defineFlags, experimentVariant, normalizeOverride } from '../../src/convex/flags'
import { campaignOf, experimentVerdict, funnelValue, guardrailWorse, isSourceAnswer, variantForBucket, weekOf, WEEK_MS, wilsonInterval } from '../../src/convex/funnel-rules'

// The growth funnel's and the experiments' rules, without a deployment:
// weeks, values, intervals, verdicts, variant splits and what defineFlags
// refuses in an experiment.

describe('weeks and values', () => {
  test('a week starts on Monday, 00:00 UTC', () => {
    const wednesday = Date.UTC(2026, 9, 28, 15, 30)
    expect(new Date(weekOf(wednesday)).toISOString()).toBe('2026-10-26T00:00:00.000Z')
    expect(weekOf(Date.UTC(2026, 9, 26))).toBe(Date.UTC(2026, 9, 26))
    expect(weekOf(Date.UTC(2026, 10, 1, 23, 59)) + WEEK_MS).toBe(Date.UTC(2026, 10, 2))
  })

  test('a value is trimmed, lower case and bounded; none is "direct"', () => {
    expect(funnelValue('  Autumn ')).toBe('autumn')
    expect(funnelValue('')).toBe('direct')
    expect(funnelValue(undefined)).toBe('direct')
    expect(funnelValue('x'.repeat(100))).toHaveLength(64)
  })

  test('a campaign is the UTM campaign, else its source', () => {
    expect(campaignOf({ source: 'newsletter', campaign: 'Autumn' })).toBe('autumn')
    expect(campaignOf({ source: 'newsletter' })).toBe('newsletter')
    expect(campaignOf({ medium: 'email' })).toBeNull()
    expect(campaignOf(undefined)).toBeNull()
  })

  test('an answer is a short lower-case name', () => {
    expect(isSourceAnswer('ai-assistant')).toBe(true)
    expect(isSourceAnswer('AI')).toBe(false)
    expect(isSourceAnswer('a'.repeat(33))).toBe(false)
  })
})

describe('results', () => {
  test('the Wilson interval stays inside 0 to 1 and narrows with more people', () => {
    expect(wilsonInterval(0, 0)).toEqual({ rate: 0, low: 0, high: 0 })
    const few = wilsonInterval(5, 10)
    const many = wilsonInterval(500, 1000)
    expect(few.rate).toBe(0.5)
    expect(few.low).toBeGreaterThan(0)
    expect(few.high).toBeLessThan(1)
    expect(many.high - many.low).toBeLessThan(few.high - few.low)
    expect(wilsonInterval(10, 10).high).toBeLessThanOrEqual(1)
  })

  test('names a leader only with enough people and intervals clear of the control', () => {
    const variant = (name: string, exposed: number, converted: number) => ({ name, exposed, goal: wilsonInterval(converted, exposed) })
    expect(experimentVerdict([variant('a', 50, 5), variant('b', 50, 40)])).toEqual({ kind: 'too_few' })
    expect(experimentVerdict([variant('a', 1000, 100), variant('b', 1000, 105)])).toEqual({ kind: 'no_difference' })
    expect(experimentVerdict([variant('a', 1000, 100), variant('b', 1000, 200)])).toEqual({ kind: 'leading', leader: 'b' })
    expect(experimentVerdict([variant('a', 1000, 200), variant('b', 1000, 100)])).toEqual({ kind: 'leading', leader: 'a' })
  })

  test('a guardrail is worse when its interval sits above the control\'s rate', () => {
    expect(guardrailWorse(wilsonInterval(100, 1000), wilsonInterval(20, 1000))).toBe(true)
    expect(guardrailWorse(wilsonInterval(22, 1000), wilsonInterval(20, 1000))).toBe(false)
  })
})

describe('variants', () => {
  test('splits buckets by the weights, evenly without them', () => {
    expect(variantForBucket(['a', 'b'], undefined, 0)).toBe('a')
    expect(variantForBucket(['a', 'b'], undefined, 4999)).toBe('a')
    expect(variantForBucket(['a', 'b'], undefined, 5000)).toBe('b')
    expect(variantForBucket(['a', 'b'], [90, 10], 8999)).toBe('a')
    expect(variantForBucket(['a', 'b'], [90, 10], 9000)).toBe('b')
  })

  test('reads the control while off and signed out, the winner once picked, a stable variant while on', () => {
    const definition = { default: false, variants: ['plans', 'strip'] }
    expect(experimentVariant('headline', { default: false }, null, { userId: 'u1' })).toBeUndefined()
    expect(experimentVariant('headline', definition, null, { userId: 'u1' })).toEqual({ variant: 'plans', running: false, subjectId: 'u1' })
    expect(experimentVariant('headline', definition, { enabled: true }, {})).toEqual({ variant: 'plans', running: false, subjectId: null })
    expect(experimentVariant('headline', definition, { enabled: true, winner: 'strip' }, { userId: 'u1' })).toEqual({ variant: 'strip', running: false, subjectId: 'u1' })
    const on = experimentVariant('headline', definition, { enabled: true }, { userId: 'u1' })!
    expect(on.running).toBe(true)
    expect(experimentVariant('headline', definition, { enabled: true }, { userId: 'u1' })).toEqual(on)
  })

  test('an override\'s winner is a variant\'s name, and none for the package\'s own flags', () => {
    expect(normalizeOverride('headline', { winner: 'strip' })).toEqual({ winner: 'strip' })
    expect(normalizeOverride('headline', { winner: 'Not A Name' })).toMatchObject({ field: 'winner' })
    expect(normalizeOverride('pause_ai', { winner: 'strip' })).toMatchObject({ field: 'winner' })
  })
})

describe('defineFlags refuses an experiment it cannot run', () => {
  const flag = (extra: Record<string, unknown>) => () => defineFlags({ headline: { default: false, description: 'The headline.', ...extra } as never })

  test.each([
    ['one variant', { variants: ['a'] }, /2 to 4/],
    ['five variants', { variants: ['a', 'b', 'c', 'd', 'e'] }, /2 to 4/],
    ['a repeated variant', { variants: ['a', 'a'] }, /once/],
    ['weights that do not match', { variants: ['a', 'b'], weights: [1] }, /weights/],
    ['an unknown goal kind', { variants: ['a', 'b'], goal: 'strip.published' }, /no event kind/],
    ['an unknown guardrail', { variants: ['a', 'b'], guardrails: ['refund'] }, /no event kind/],
    ['a discount on the control', { variants: ['a', 'b'], discounts: { a: 'launch' } }, /discounts/],
    ['a goal without variants', { goal: 'app.x' }, /only with `variants`/],
  ])('%s', (_, extra, message) => {
    expect(flag(extra)).toThrow(message)
  })

  test('takes a full experiment', () => {
    expect(flag({ variants: ['list', 'discount20'], weights: [90, 10], goal: 'billing.subscription_created', guardrails: ['billing.order_refunded'], discounts: { discount20: 'annual20' }, by: 'workspace' })).not.toThrow()
  })
})
