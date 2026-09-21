import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deriveDeploymentUrls, isDevDeploymentId, isLocalDeploymentId, parseEnvFile, resolveSiteUrl, siteFromCloudUrl } from '../../src/deployment'

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

  it('takes the URLs convex dev writes for an anonymous local backend as they are', () => {
    // `convex dev` without an account starts a backend on this machine and
    // records its id *and* its ports; the id is not a cloud slug.
    writeFileSync(join(rootDir, '.env.local'), [
      'CONVEX_DEPLOYMENT=anonymous:anonymous-agent',
      'CONVEX_URL=http://127.0.0.1:3210',
      'CONVEX_SITE_URL=http://127.0.0.1:3211',
    ].join('\n'))
    expect(deriveDeploymentUrls(rootDir, {})).toEqual({
      url: 'http://127.0.0.1:3210',
      siteUrl: 'http://127.0.0.1:3211',
      source: 'deployment',
      deployment: 'anonymous:anonymous-agent',
    })
  })

  it.each(['local:my-app', 'anonymous:anonymous-my-app'])('derives nothing for %s without written URLs', (deployment) => {
    expect(deriveDeploymentUrls(rootDir, { CONVEX_DEPLOYMENT: deployment })).toBeNull()
  })

  it('prefers a written cloud URL over the slug, and maps its .site twin', () => {
    // The `convex dev --start` environment carries CONVEX_URL for the child.
    expect(deriveDeploymentUrls(rootDir, { CONVEX_DEPLOYMENT: 'dev:brave-otter-123', CONVEX_URL: 'https://brave-otter-123.convex.cloud/' })).toEqual({
      url: 'https://brave-otter-123.convex.cloud',
      siteUrl: 'https://brave-otter-123.convex.site',
      source: 'deployment',
      deployment: 'dev:brave-otter-123',
    })
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

describe('resolveSiteUrl', () => {
  const derived = { url: 'https://brave-otter-123.convex.cloud', siteUrl: 'https://brave-otter-123.convex.site', source: 'deployment' as const, deployment: 'brave-otter-123' }

  it('prefers an explicit site URL, then the site-URL env names, then the derived one', () => {
    expect(resolveSiteUrl({ siteUrl: 'https://mine.example', env: { NUXT_PUBLIC_BACKEND_SITE_URL: 'https://env.example' }, derived })).toBe('https://mine.example')
    expect(resolveSiteUrl({ env: { NUXT_PUBLIC_BACKEND_SITE_URL: 'https://env.example' }, derived })).toBe('https://env.example')
    expect(resolveSiteUrl({ env: { NUXT_PUBLIC_CONVEX_SITE_URL: 'https://platform.example' }, derived })).toBe('https://platform.example')
    expect(resolveSiteUrl({ env: {}, derived })).toBe('https://brave-otter-123.convex.site')
  })

  it('maps a client-only cloud URL to its .site twin — the convex deploy --cmd-url-env-var-name build', () => {
    expect(resolveSiteUrl({ env: { NUXT_PUBLIC_CONVEX_URL: 'https://calm-fox-9.convex.cloud' }, derived: null })).toBe('https://calm-fox-9.convex.site')
    expect(resolveSiteUrl({ url: 'https://calm-fox-9.convex.cloud', env: {}, derived: null })).toBe('https://calm-fox-9.convex.site')
  })

  it('stays undefined for self-hosted or unknown client URLs', () => {
    expect(resolveSiteUrl({ env: { NUXT_PUBLIC_CONVEX_URL: 'https://convex.internal.example' }, derived: null })).toBeUndefined()
    expect(resolveSiteUrl({ env: {}, derived: null })).toBeUndefined()
  })
})

describe('deployment classes', () => {
  it('counts cloud dev, CLI-managed local and anonymous local as dev-class — never prod or preview', () => {
    for (const id of ['dev:brave-otter-123', 'local:my-app', 'anonymous:anonymous-my-app']) expect(isDevDeploymentId(id)).toBe(true)
    for (const id of ['prod:calm-heron-42', 'preview:branch-1', 'calm-heron-42', '', null, undefined]) expect(isDevDeploymentId(id)).toBe(false)
  })

  it('knows which of those live on this machine', () => {
    expect(isLocalDeploymentId('local:my-app')).toBe(true)
    expect(isLocalDeploymentId('anonymous:anonymous-my-app')).toBe(true)
    expect(isLocalDeploymentId('dev:brave-otter-123')).toBe(false)
  })
})
