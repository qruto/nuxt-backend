import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installableFinding, installableGaps, installIcons, maskableIcons, namedIconWarnings, ownsManifest, themeColorMeta, webAppManifest } from '../../src/installable'
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

  it('finds RealFaviconGenerator\'s icons when the module\'s own names are not there, and takes the paths an app names', () => {
    icons('web-app-manifest-192x192.png', 'web-app-manifest-512x512.png')
    expect(installIcons(publicDir)).toEqual({ 192: '/web-app-manifest-192x192.png', 512: '/web-app-manifest-512x512.png' })
    expect(installableGaps(publicDir, { name: 'Panels' })).toEqual([])
    expect(installableGaps(publicDir, { name: 'Panels' }, { icons: { 192: '/brand/app-192.png', 512: '/brand/app-512.png' } })).toEqual(['public/brand/app-192.png (192 × 192 px)', 'public/brand/app-512.png (512 × 512 px)'])
  })

  it('lists maskable icons: its own pair when public/ holds it, the two icons when told they are full-bleed, none when told so', () => {
    icons('icon-192.png', 'icon-512.png')
    expect(maskableIcons(publicDir)).toBeNull()
    expect(maskableIcons(publicDir, { maskable: true })).toEqual({ 192: '/icon-192.png', 512: '/icon-512.png' })
    icons('icon-maskable-192.png', 'icon-maskable-512.png')
    expect(maskableIcons(publicDir)).toEqual({ 192: '/icon-maskable-192.png', 512: '/icon-maskable-512.png' })
    expect(maskableIcons(publicDir, { maskable: false })).toBeNull()
  })

  it('carries the colours, the description and the maskable icons the option gives', () => {
    const manifest = webAppManifest('Panels', { themeColor: { light: '#ffb900', dark: '#1e1a4d' }, description: 'Comics from your photos.', maskable: { 192: '/icon-maskable-192.png', 512: '/icon-maskable-512.png' } })
    expect(manifest).toMatchObject({ description: 'Comics from your photos.', theme_color: '#ffb900', background_color: '#ffb900' })
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
    expect(webAppManifest('Panels', { themeColor: '#123456', backgroundColor: '#ffffff' })).toMatchObject({ theme_color: '#123456', background_color: '#ffffff' })
    expect(themeColorMeta({ light: '#ffb900', dark: '#1e1a4d' })).toEqual([
      { name: 'theme-color', content: '#ffb900', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#1e1a4d', media: '(prefers-color-scheme: dark)' },
    ])
    expect(themeColorMeta(undefined)).toEqual([])
  })

  it('leaves an app with a manifest of its own alone', () => {
    expect(ownsManifest(publicDir, ['@vite-pwa/nuxt'])).toBe(true)
    writeFileSync(join(publicDir, 'site.webmanifest'), '{}')
    expect(ownsManifest(publicDir, [])).toBe(true)
    expect(installableFinding(publicDir, null, { modules: [], pushKeys: true })).toEqual([])
  })

  it('leaves an app alone that links a manifest of its own in app.head', () => {
    expect(ownsManifest(publicDir, [], [{ rel: 'icon', href: '/favicon.svg' }])).toBe(false)
    expect(ownsManifest(publicDir, [], [{ rel: 'manifest', href: '/app.webmanifest' }])).toBe(true)
    icons('icon-192.png')
    expect(installableFinding(publicDir, { name: 'Panels' }, { modules: [], pushKeys: true, links: [{ rel: 'manifest', href: '/app.webmanifest' }] })).toEqual([])
  })

  it('leaves out a maskable pair public/ does not hold', () => {
    icons('icon-192.png', 'icon-512.png')
    expect(maskableIcons(publicDir, { maskable: { 192: '/m-192.png', 512: '/m-512.png' } })).toBeNull()
    icons('m-192.png', 'm-512.png')
    expect(maskableIcons(publicDir, { maskable: { 192: '/m-192.png', 512: '/m-512.png' } })).toEqual({ 192: '/m-192.png', 512: '/m-512.png' })
  })

  it('warns at build time for a pair the option names that public/ lacks, icons or maskable', () => {
    const named = { icons: { 192: '/brand/app-192.png', 512: '/brand/app-512.png' }, maskable: { 192: '/m-192.png', 512: '/m-512.png' } } as const
    expect(namedIconWarnings(publicDir, named)).toEqual([
      '`installable.icons` names /brand/app-192.png and /brand/app-512.png, and public/ does not hold both: the module serves no manifest.',
      '`installable.maskable` names /m-192.png and /m-512.png, and public/ does not hold both: the manifest lists no maskable icon.',
    ])
    // Icons missing under the module's own names are doctor's to name, not the build's.
    expect(namedIconWarnings(publicDir)).toEqual([])
    mkdirSync(join(publicDir, 'brand'))
    icons('brand/app-192.png', 'brand/app-512.png', 'm-192.png', 'm-512.png')
    expect(namedIconWarnings(publicDir, named)).toEqual([])
  })

  it('says nothing for an app that turned the manifest off', () => {
    icons('icon-192.png')
    expect(installableFinding(publicDir, { name: 'Panels' }, { modules: [], pushKeys: true, options: false })).toEqual([])
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
