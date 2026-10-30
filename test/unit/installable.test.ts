import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installableFinding, installableGaps, ownsManifest, webAppManifest } from '../../src/installable'
import { PUSH_WORKER_SOURCE } from '../../src/runtime/server/push-worker-source'

// The installable app: a manifest from the brand name and two icons, what
// doctor says while one is missing, and the push worker the module serves.

let publicDir: string
beforeEach(() => {
  publicDir = mkdtempSync(join(tmpdir(), 'installable-'))
})
afterEach(() => {
  rmSync(publicDir, { recursive: true, force: true })
})

const icons = (...files: string[]) => files.forEach(file => writeFileSync(join(publicDir, file), 'png'))

describe('the web app manifest', () => {
  it('needs both icons and a brand name, and names each one missing', () => {
    expect(installableGaps(publicDir, null)).toEqual(['public/icon-192.png (192 × 192 px)', 'public/icon-512.png (512 × 512 px)', 'app.config\'s `backend.brand.name`'])
    icons('icon-192.png', 'icon-512.png')
    expect(installableGaps(publicDir, { name: 'Panels' })).toEqual([])
  })

  it('opens standalone at the root, with both icons', () => {
    expect(webAppManifest('Panels')).toEqual({
      name: 'Panels',
      short_name: 'Panels',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
    })
  })

  it('leaves an app with a manifest of its own alone', () => {
    expect(ownsManifest(publicDir, ['@vite-pwa/nuxt'])).toBe(true)
    writeFileSync(join(publicDir, 'site.webmanifest'), '{}')
    expect(ownsManifest(publicDir, [])).toBe(true)
    expect(installableFinding(publicDir, null, { modules: [], pushKeys: true })).toEqual([])
  })
})

describe('doctor\'s installable finding', () => {
  it('passes, naming what is missing, until the app reaches for it; then warns; then passes for real', () => {
    expect(installableFinding(publicDir, null, { modules: [], pushKeys: true })).toMatchObject([{ id: 'installable', status: 'pass', message: expect.stringContaining('Not installable yet') }])
    icons('icon-192.png')
    expect(installableFinding(publicDir, { name: 'Panels' }, { modules: [], pushKeys: true })).toMatchObject([{ id: 'installable', status: 'warn', message: expect.stringContaining('public/icon-512.png'), fixHint: expect.stringContaining('icon-512.png') }])
    icons('icon-512.png')
    expect(installableFinding(publicDir, { name: 'Panels' }, { modules: [], pushKeys: false })).toMatchObject([{ id: 'installable', status: 'pass', message: expect.stringContaining('installable') }])
  })
})

describe('the push worker', () => {
  it('shows the declarative message, and opens only the app\'s own pages on a click', () => {
    expect(PUSH_WORKER_SOURCE).toContain('showNotification(title, options)')
    expect(PUSH_WORKER_SOURCE).toContain('target.origin === self.location.origin')
    expect(PUSH_WORKER_SOURCE).not.toContain('import ')
  })
})
