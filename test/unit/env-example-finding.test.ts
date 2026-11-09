import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderEnvExample } from '../../src/capabilities'
import { envExampleFinding, listedEnvNames } from '../../src/env-example'

// doctor's `env-example`: the app's .env.example against the one `init`
// writes, and against what reads its names.

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'env-example-'))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

const write = (path: string, text: string) => {
  mkdirSync(join(rootDir, path, '..'), { recursive: true })
  writeFileSync(join(rootDir, path), text)
}

describe('env-example', () => {
  it('reads the names a dotenv file sets or lists commented out, never a comment\'s prose', () => {
    expect(listedEnvNames('# Add keys as you connect services.\n# ── Email ──\n# EMAIL_API_KEY=\nEMAIL_FROM="Acme <a@b.c>"\nexport SITE_URL=https://x\n  #  EMAIL_REGION =eu-west-1\nlower=1\n')).toEqual(['EMAIL_API_KEY', 'EMAIL_FROM', 'SITE_URL', 'EMAIL_REGION'])
  })

  it('reports nothing without a .env.example, and passes on the one init writes', () => {
    expect(envExampleFinding(rootDir)).toEqual([])
    write('.env.example', renderEnvExample())
    expect(envExampleFinding(rootDir)).toEqual([expect.objectContaining({ id: 'env-example', status: 'pass' })])
  })

  it('names what it lacks of the package\'s, and what it lists that nothing reads', () => {
    write('.env.example', renderEnvExample().replace('# EMAIL_MARKETING_FROM=\n', '').concat('OLD_SEGMENT_ID=\nCOMICS_PAGE_LIMIT=\nCONVEX_DEPLOY_KEY=\nNUXT_PUBLIC_ANALYTICS_ID=\nSENTRY_AUTH_TOKEN=\n'))
    // The app's own config reads one of its names; a dependency's mention is no read of the app's.
    write('nuxt.config.ts', 'export default defineNuxtConfig({ runtimeConfig: { pageLimit: process.env.COMICS_PAGE_LIMIT } })\n')
    write('node_modules/some-lib/index.js', 'process.env.OLD_SEGMENT_ID\n')
    const [found] = envExampleFinding(rootDir)
    expect(found).toMatchObject({ id: 'env-example', capability: 'data', status: 'warn' })
    expect(found!.message).toBe('.env.example has drifted. It lacks EMAIL_MARKETING_FROM, which the package reads. It lists OLD_SEGMENT_ID, which neither the package nor the app\'s code reads.')
    expect(found!.fixHint).toBe('Add `# EMAIL_MARKETING_FROM=` under their groups; remove OLD_SEGMENT_ID, or leave a name a tool outside the app\'s code reads.')
  })

  it('finds a name the backend\'s functions read', () => {
    write('.env.example', `${renderEnvExample()}WAITLIST_SEGMENT=\n`)
    expect(envExampleFinding(rootDir)[0]!.status).toBe('warn')
    write('backend/waitlist.ts', 'const segment = process.env.WAITLIST_SEGMENT\n')
    expect(envExampleFinding(rootDir)[0]!.status).toBe('pass')
  })
})
