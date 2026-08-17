import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveDeploymentUrls, parseEnvFile, siteFromCloudUrl } from '../../src/deployment'

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-deployment-'))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('deriveDeploymentUrls', () => {
  it('derives both cloud URLs from the dev slug convex dev writes to .env.local', () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:brave-otter-123\n')
    expect(deriveDeploymentUrls(rootDir, {})).toEqual({
      url: 'https://brave-otter-123.convex.cloud',
      siteUrl: 'https://brave-otter-123.convex.site',
      source: 'deployment',
      deployment: 'dev:brave-otter-123',
    })
  })

  it.each(['prod:calm-heron-42', 'calm-heron-42'])('handles %s', (deployment) => {
    const derived = deriveDeploymentUrls(rootDir, { CONVEX_DEPLOYMENT: deployment })
    expect(derived?.url).toBe('https://calm-heron-42.convex.cloud')
    expect(derived?.siteUrl).toBe('https://calm-heron-42.convex.site')
  })

  it('rejects slugs that could not be a cloud deployment (no URL guessing)', () => {
    for (const bad of ['dev:Not A Slug', 'dev:slug/../evil', 'dev:UPPER', 'dev:']) {
      expect(deriveDeploymentUrls(rootDir, { CONVEX_DEPLOYMENT: bad })).toBeNull()
    }
  })

  it('returns null when nothing is configured', () => {
    expect(deriveDeploymentUrls(rootDir, {})).toBeNull()
  })

  it('derives only the client URL for self-hosted deployments', () => {
    const derived = deriveDeploymentUrls(rootDir, { CONVEX_SELF_HOSTED_URL: 'https://convex.internal.example.com/' })
    expect(derived).toEqual({ url: 'https://convex.internal.example.com', source: 'self-hosted' })
    expect(derived?.siteUrl).toBeUndefined()
  })

  it('prefers process env over .env.local over .env', () => {
    writeFileSync(join(rootDir, '.env'), 'CONVEX_DEPLOYMENT=dev:from-dotenv\n')
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:from-local\n')
    expect(deriveDeploymentUrls(rootDir, {})?.url).toBe('https://from-local.convex.cloud')
    expect(deriveDeploymentUrls(rootDir, { CONVEX_DEPLOYMENT: 'dev:from-process' })?.url)
      .toBe('https://from-process.convex.cloud')
  })

  it('self-hosted wins over a deployment slug (matches the convex CLI)', () => {
    writeFileSync(join(rootDir, '.env.local'), 'CONVEX_DEPLOYMENT=dev:some-slug\nCONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210\n')
    expect(deriveDeploymentUrls(rootDir, {})?.source).toBe('self-hosted')
  })
})

describe('parseEnvFile', () => {
  it('parses KEY=VALUE lines and strips quotes', () => {
    expect(parseEnvFile('A=1\nB="two"\nC=\'three\'\n# comment\nnot a line\n')).toEqual({
      A: '1',
      B: 'two',
      C: 'three',
    })
  })
})

describe('siteFromCloudUrl', () => {
  it('maps only *.convex.cloud origins', () => {
    expect(siteFromCloudUrl('https://brave-otter-123.convex.cloud')).toBe('https://brave-otter-123.convex.site')
    expect(siteFromCloudUrl('https://brave-otter-123.convex.cloud/')).toBe('https://brave-otter-123.convex.site')
    expect(siteFromCloudUrl('https://example.com')).toBeNull()
    expect(siteFromCloudUrl('https://evil.com/x.convex.cloud')).toBeNull()
  })
})
