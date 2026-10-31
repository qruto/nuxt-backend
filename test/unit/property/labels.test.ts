import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { formatLabel, type LabelParams } from '../../../src/convex/labels'

// Property tests (fast-check) for the label formatter every packaged word
// goes through, the app's overrides and translations included. Messages are
// generated from text and `{name}` placeholders: a placeholder with a value
// reads as that value, verbatim; one without stays as written, so a missing
// parameter shows; the plural form is chosen by `count` the vue-i18n way.

/** Message text with none of the formatter's syntax in it. */
const text = fc.string({ maxLength: 12 }).map(value => value.replace(/[{}|]/g, ''))
/**
 * Placeholder names, the ones every object inherits among them: a message
 * naming `{constructor}` with no such parameter must still show the
 * placeholder, not a function's source.
 */
const name = fc.constantFrom('count', 'email', 'brand', 'name', 'constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf')
/** A parameter value, which may itself look like a placeholder. */
const value = fc.oneof(fc.string({ maxLength: 10 }), fc.integer(), fc.constantFrom('{email}', '{count}', '|'))

type Segment = { text: string } | { name: string }
const segments = fc.array(fc.oneof(text.map(t => ({ text: t })), name.map(n => ({ name: n }))), { maxLength: 8 })
const message = (parts: Segment[]) => parts.map(part => ('text' in part ? part.text : `{${part.name}}`)).join('')

/** Parameters for some of the names, as an own-property record. */
const params = fc.array(fc.tuple(name, value), { maxLength: 5 }).map((pairs) => {
  const record: LabelParams = {}
  for (const [key, entry] of pairs) Object.defineProperty(record, key, { value: entry, enumerable: true, writable: true, configurable: true })
  return record
})

describe('formatLabel', () => {
  it('fills each placeholder that has a parameter with its value, verbatim, and leaves the rest as written', () => {
    // The formatter trims the message before it fills it in, so a value with
    // spaces at an edge keeps them. Fenced in `<…>`, the message has no edge
    // to trim, and the filled-in text is compared as it is.
    fc.assert(fc.property(segments, params, (parts, given) => {
      const filled = parts.map(part => ('text' in part ? part.text : Object.hasOwn(given, part.name) ? String(given[part.name]) : `{${part.name}}`)).join('')
      expect(formatLabel(`<${message(parts)}>`, given)).toBe(`<${filled}>`)
    }), {
      // Once failing draws: a value of spaces at the end, and an empty one after a space.
      examples: [
        [[{ name: 'email' }], { email: ' ' }],
        [[{ text: 'a ' }, { name: 'email' }], { email: '' }],
      ],
    })
  })

  it('trims the message before it fills it in, so a value keeps its spaces', () => {
    expect(formatLabel('{email}', { email: ' ' })).toBe(' ')
    expect(formatLabel(' a {email} ', { email: '' })).toBe('a ')
  })

  it('returns a message with no placeholders and one form unchanged, but trimmed', () => {
    fc.assert(fc.property(text, params, (plain, given) => {
      expect(formatLabel(plain, given)).toBe(plain.trim())
    }))
  })

  it('picks the plural form by count: one of two for exactly one, and none, one, many of three', () => {
    const form = text.filter(value => value.trim() !== '')
    fc.assert(fc.property(form, form, form, fc.integer({ min: -1000, max: 1000 }), (none, single, many, count) => {
      const amount = Math.abs(count)
      expect(formatLabel(`${single} | ${many}`, { count })).toBe(amount === 1 ? single.trim() : many.trim())
      expect(formatLabel(`${none} | ${single} | ${many}`, { count })).toBe([none, single, many][Math.min(amount, 2)]!.trim())
    }))
  })

  it('takes the last form for a count that is not a whole number, and the first without one', () => {
    const form = text.filter(value => value.trim() !== '')
    fc.assert(fc.property(form, form, fc.double({ noNaN: true, noDefaultInfinity: true }).filter(count => !Number.isInteger(count)), (single, many, count) => {
      expect(formatLabel(`${single} | ${many}`, { count })).toBe(many.trim())
      expect(formatLabel(`${single} | ${many}`, {})).toBe(single.trim())
    }))
  })

  it('never throws, whatever the message and parameters', () => {
    fc.assert(fc.property(fc.string(), fc.dictionary(fc.string(), value), (raw, given) => {
      expect(() => formatLabel(raw, given)).not.toThrow()
    }))
  })
})
