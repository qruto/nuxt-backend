import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { consentFindings } from '../../src/cli/consents'

// doctor --prod on the consents an app declares: a required kind links its
// document, since the agreement line and the prompt that asks again point
// at `url`. The declaration is read from the source, never run.

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A project whose `backend/account.ts` holds `source`; none for `undefined`. */
function project(source?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'consent-doctor-'))
  dirs.push(dir)
  if (source !== undefined) {
    mkdirSync(join(dir, 'backend'))
    writeFileSync(join(dir, 'backend', 'account.ts'), source)
  }
  return dir
}

const account = (consents: string) => `
import { setupAccount } from 'nuxt-backend/account'
import { components } from './_generated/api'
export const account = setupAccount(components, { audit, ${consents} })
`

describe('the consent documents finding', () => {
  it('passes when every required kind links its document', async () => {
    const dir = project(account(`consents: {
      terms: { version: '2026-10-01', url: '/terms', required: true },
      'gallery-rules': { version: '1' },
    }`))
    expect(await consentFindings(dir, { prod: true })).toEqual([expect.objectContaining({ id: 'consent-urls', status: 'pass', message: expect.stringContaining('terms') })])
  })

  it('warns, naming the required kinds without a url (an opt-in needs none)', async () => {
    const dir = project(account(`consents: {
      terms: { version: '2026-10-01', required: true },
      privacy: { version: '2026-10-01', url: '', required: true },
      'gallery-rules': { version: '1' },
      news: { version: '1', required: false },
    }`))
    const [found] = await consentFindings(dir, { prod: true })
    expect(found).toMatchObject({ id: 'consent-urls', status: 'warn', message: expect.stringContaining('terms, privacy have no `url`') })
    expect(found!.message).not.toContain('gallery-rules')
    expect(found!.fixHint).toContain('/terms')
  })

  it('reads a url that is an expression as present, and leaves what it cannot read alone', async () => {
    expect(await consentFindings(project(account(`consents: { terms: { version: '1', url: TERMS_URL, required: true } }`)), { prod: true })).toEqual([expect.objectContaining({ status: 'pass' })])
    expect(await consentFindings(project(account(`consents: CONSENTS`)), { prod: true })).toEqual([])
    expect(await consentFindings(project(account('')), { prod: true })).toEqual([])
    expect(await consentFindings(project('this is not typescript {'), { prod: true })).toEqual([])
  })

  it('runs under --prod only, and only for an app with backend/account.ts', async () => {
    const dir = project(account(`consents: { terms: { version: '1', required: true } }`))
    expect(await consentFindings(dir, { prod: false })).toEqual([])
    expect(await consentFindings(project(), { prod: true })).toEqual([])
  })
})
