import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { repositoryFiles } from '../helpers/repository-files'
import { fakeCredential, signingSecret } from '../helpers/secrets'

// No file in the repository carries a value shaped like a provider credential.
// GitHub secret scanning and push protection are the authority on that; this
// test is the early warning, before a push, for the fixtures a test writes.
// Secret scanners match on shape, not on whether a value works: GitHub flagged
// two made-up `whsec_` fixtures in test/unit/webhook-guard.test.ts as live
// Stripe webhook secrets, and a maintainer had to look at each one. A test
// builds what it needs at run time instead (test/helpers/secrets.ts). Short
// placeholders such as `whsec_test` or `re_xxxxxxxxx` match nothing here, the
// same as they match no scanner.

/** The shapes the scanners know, each a prefix and enough token characters after it to read as a key. */
const SHAPES: Array<[name: string, shape: RegExp]> = [
  ['a webhook signing secret (Standard Webhooks, svix, Stripe)', /\bwhsec_[\w+/=-]{16,}/g],
  ['an email provider API key', /\bre_(?:[A-Za-z0-9]{8}_[A-Za-z0-9]{16,}|[A-Za-z0-9]{24,})/g],
  ['a billing provider token or secret', /\bpolar_(?:oat|pat|at|rt|whs|cs|ci|sk|pk)_\w{16,}/g],
  ['a Stripe key', /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g],
  ['a GitHub token', /\b(?:gh[opsu]_[A-Za-z0-9]{30,}|github_pat_\w{30,})/g],
  ['an AWS access key id', /\bAKIA[0-9A-Z]{16}\b/g],
]

/** Vendored agent skills are upstream's text, not ours; the lockfile holds hashes; the rest are binaries. */
const SKIPPED = /^(?:\.agents\/|\.claude\/)|(?:^|\/)pnpm-lock\.yaml$|\.(?:avif|gif|ico|jpe?g|mp4|otf|pdf|png|tgz|ttf|webm|webp|woff2?|zip)$/

describe('secret-shaped literals', () => {
  const files = repositoryFiles().filter(file => !SKIPPED.test(file))

  it('lists the repository', () => {
    expect(files).toEqual(expect.arrayContaining(['package.json', 'test/unit/webhook-guard.test.ts', 'test/helpers/secrets.ts']))
  })

  it('appear nowhere in the repository', () => {
    const found: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const [name, shape] of SHAPES) {
        for (const match of text.matchAll(shape)) {
          const line = text.slice(0, match.index).split('\n').length
          found.push(`${file}:${line}: ${name} (${match[0].slice(0, 12)}…)`)
        }
      }
    }
    expect(found, 'build test credentials at run time with test/helpers/secrets.ts').toEqual([])
  })

  it('catch the shapes a scanner flags, not the placeholders docs use', () => {
    const flagged = (value: string) => SHAPES.some(([, shape]) => new RegExp(shape.source).test(value))
    // Built here, at run time, so this file holds none of them as literals.
    const whsec = ['wh', 'sec_'].join('')
    expect(flagged(signingSecret(32))).toBe(true)
    expect(flagged(signingSecret())).toBe(true)
    expect(flagged(fakeCredential(['po', 'lar_oat_'].join('')))).toBe(true)
    expect(flagged(fakeCredential(['po', 'lar_whs_'].join('')))).toBe(true)
    expect(flagged(fakeCredential(['r', 'e_'].join('')))).toBe(true)
    expect(flagged(`${['r', 'e_'].join('')}${fakeCredential('').slice(0, 8)}_${fakeCredential('').slice(0, 24)}`)).toBe(true)
    for (const placeholder of [`${whsec}test`, `${whsec}...`, 're_xxxxxxxxx', 'polar_oat_expired', 'require_extra_approval_for_unattributed_changes']) {
      expect(flagged(placeholder), placeholder).toBe(false)
    }
  })
})
