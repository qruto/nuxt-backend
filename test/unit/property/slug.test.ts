import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { slugify, workspaceSlug } from '../../../src/runtime/vue/utils/slug'

// Property tests (fast-check) for the slug <WorkspaceSettings> makes from a
// new workspace's name. A slug is a workspace's unique handle, so whatever a
// person types — any script, emoji, punctuation, whitespace — comes out in
// the one shape, the letters and digits they typed kept in order.

/** What a person might type as a workspace name. */
const name = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 60 }),
  fc.string({ unit: fc.constantFrom(...'Acme Co.&-_ 42  \t'.split('')), maxLength: 30 }),
)

describe('slugify', () => {
  it('returns lower-case letters and digits in hyphen-separated runs, nothing at either end', () => {
    fc.assert(fc.property(name, (typed) => {
      expect(slugify(typed)).toMatch(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/)
    }))
  })

  it('keeps every ASCII letter and digit of the name, lower-cased, in order', () => {
    fc.assert(fc.property(name, (typed) => {
      expect(slugify(typed).replace(/-/g, '')).toBe(typed.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
    }))
  })

  it('changes nothing the second time, so a slug typed as one comes back as it was', () => {
    fc.assert(fc.property(name, (typed) => {
      expect(slugify(slugify(typed))).toBe(slugify(typed))
    }))
    fc.assert(fc.property(fc.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), (slug) => {
      expect(slugify(slug)).toBe(slug)
    }))
  })

  it('breaks words apart at anything that is not a letter or digit', () => {
    const word = fc.stringMatching(/^[a-z0-9]{1,8}$/)
    const gap = fc.string({ unit: fc.constantFrom(' ', '-', '_', '.', '&', '/', '\t', 'é', '🙂'), minLength: 1, maxLength: 3 })
    fc.assert(fc.property(fc.array(word, { minLength: 1, maxLength: 5 }), gap, (words, separator) => {
      expect(slugify(words.join(separator))).toBe(words.join('-'))
    }))
  })
})

describe('workspaceSlug', () => {
  it('is the slug of the name, else "workspace", with a suffix of its own: never empty, never shared', () => {
    fc.assert(fc.property(name, (typed) => {
      const slug = workspaceSlug(typed)
      expect(slug).toMatch(/^(?:[a-z0-9]+-)+[0-9a-f]{8}$/)
      expect(slug.slice(0, -9)).toBe(slugify(typed) || 'workspace')
    }))
    expect(workspaceSlug('Мастерская')).toMatch(/^workspace-[0-9a-f]{8}$/)
    expect(workspaceSlug('Acme')).not.toBe(workspaceSlug('Acme'))
  })
})
