import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkPage, chunkStore, dynamicImports, formatFailures, isRedirect, pagePrefetches, pageScripts, staticImports } from '../../scripts/check-website-bundle.mjs'
import { at } from './helpers'

// scripts/check-website-bundle.mjs, the gate CI runs on the built docs
// site: what a prerendered page fetches up front, while idle and at mount
// must not reach the backend client, except through a <DeferredBackend>
// block; the homepage never.

/** A built site's chunks, in a folder of their own. */
let dir: string
const CHUNKS: Record<string, string> = {
  'entry.js': 'import{a}from"./vue.js";const routes=[()=>import(`./client.js`)];',
  'vue.js': 'export const a=1;',
  'page.js': 'import{a}from"./vue.js";export default{};',
  'registry.js': 'const map={DemoCounter:()=>import(`./demo.js`)};',
  'demo.js': 'import{d}from"./deferred.js";const live=()=>import(`./live.js`);',
  'deferred.js': 'const{$loadBackendClient:e}=useNuxtApp();export const d=e;',
  'live.js': 'import{b}from"./convex.js";export default b;',
  'convex.js': 'console.warn("Attempting reconnect");export const b=1;',
  'client.js': 'const n="nuxt-convex-module:better-auth:client";import"./convex.js";',
  'eager.js': 'onMounted(()=>import("./convex.js"));',
  'lazy-live.js': 'const C=defineAsyncComponent(()=>import(`./live.js`));',
  'startup.js': 'useNuxtApp().$loadBackendClient();',
  'entry-startup.js': 'import"./startup.js";',
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'website-bundle-'))
  for (const [name, code] of Object.entries(CHUNKS)) writeFileSync(join(dir, name), code)
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A prerendered page that names these scripts. */
function page({ entry = 'entry.js', preload = [] as string[], prefetch = [] as string[], live = false } = {}) {
  return [
    '<!DOCTYPE html><html><head>',
    ...preload.map(chunk => `<link rel="modulepreload" as="script" crossorigin href="/_nuxt/${chunk}">`),
    entry ? `<script type="module" src="/_nuxt/${entry}" crossorigin></script>` : '',
    ...prefetch.map(chunk => `<link rel="prefetch" as="script" crossorigin href="/_nuxt/${chunk}">`),
    `</head><body>${live ? '<div data-deferred-backend></div>' : ''}</body></html>`,
  ].join('')
}
const failures = (route: string, html: string) => checkPage(route, html, chunkStore(dir)).failures.map((failure: { message: string }) => failure.message)

describe('reading a built page', () => {
  it('follows static imports and leaves dynamic ones to load later', () => {
    expect(staticImports('import{a as b}from"./A.js";import"./B.js";export{c}from"./C.js";const d=()=>import("./D.js")')).toEqual(['A.js', 'B.js', 'C.js'])
  })

  it('finds an import on demand in whatever quotes the minifier wrote', () => {
    expect(dynamicImports('import(`./A.js`);import("./B.js");import( \'./C.js\' );import(`#entry`)')).toEqual(['A.js', 'B.js', 'C.js'])
  })

  it('starts from the module entry and the modulepreloads of a page, and reads its prefetches apart', () => {
    const html = '<link rel="modulepreload" as="script" crossorigin href="/_nuxt/P.js"><link rel="prefetch" as="script" crossorigin href="/_nuxt/Q.js"><link rel="prefetch" as="style" href="/_nuxt/S.css"><script type="module" src="/_nuxt/E.js" crossorigin></script><script src="/other.js"></script>'
    expect(pageScripts(html)).toEqual(['P.js', 'E.js'])
    expect(pagePrefetches(html)).toEqual(['Q.js'])
  })

  it('skips the redirects Nitro prerenders, which load no app', () => {
    expect(isRedirect('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/docs/reference/api"></head></html>')).toBe(true)
    expect(isRedirect(page())).toBe(false)
  })
})

describe('a docs page', () => {
  it('passes when nothing it loads reaches the client', () => {
    expect(failures('/docs/start', page({ preload: ['page.js', 'registry.js'] }))).toEqual([])
  })

  it('fails when it names no entry script: a changed cdnURL would leave nothing to check', () => {
    expect(failures('/docs/start', page({ entry: '' }))).toEqual([expect.stringMatching(/names no entry script/)])
  })

  it('fails when it loads the client up front', () => {
    expect(failures('/docs/start', page({ preload: ['live.js'] }))).toEqual([expect.stringMatching(/loads convex\/browser up front/)])
  })

  it('fails when it prefetches the client while idle', () => {
    expect(failures('/docs/start', page({ prefetch: ['page.js', 'client.js'] }))).toEqual([expect.stringMatching(/prefetches nuxt-convex-module's client plugin \(_nuxt\/client\.js\)/)])
  })

  it('fails when it calls for the client at mount outside a <DeferredBackend> block', () => {
    expect(failures('/docs/start', page({ preload: ['deferred.js'] }))).toEqual([expect.stringMatching(/calls for the backend client at mount, outside a <DeferredBackend> block/)])
  })

  it('fails when its own scripts import the client on demand: an import() at mount, a lazy live component', () => {
    expect(failures('/docs/start', page({ preload: ['eager.js'] }))).toEqual([expect.stringMatching(/may load convex\/browser at mount: _nuxt\/eager\.js imports _nuxt\/convex\.js/)])
    expect(failures('/docs/start', page({ preload: ['lazy-live.js'] }))).toEqual([expect.stringMatching(/may load convex\/browser at mount: _nuxt\/lazy-live\.js imports _nuxt\/live\.js/)])
  })

  it('may load it from a <DeferredBackend> block, when the block scrolls into view', () => {
    const result = checkPage('/docs/data/queries-and-mutations', page({ preload: ['demo.js', 'deferred.js'], live: true }), chunkStore(dir))
    expect(result.failures).toEqual([])
    expect(result.live).toBe(true)
  })
})

describe('the homepage', () => {
  it('fails when it renders a live block, or calls for the client at all', () => {
    expect(failures('/', page({ live: true }))).toEqual([expect.stringMatching(/renders a live block that loads the backend client/)])
    expect(failures('/', page({ preload: ['deferred.js'], live: true }))).toEqual([expect.stringMatching(/renders a live block that loads the backend client \(_nuxt\/deferred\.js\)/)])
  })
})

describe('every page', () => {
  it('fails, once, when the entry calls for the client at startup', () => {
    const all = [checkPage('/', page({ entry: 'entry-startup.js' }), chunkStore(dir)), checkPage('/docs/start', page({ entry: 'entry-startup.js' }), chunkStore(dir))]
    expect(formatFailures(all.flatMap(result => result.failures))).toEqual(['✗ every page calls for the backend client at startup (_nuxt/startup.js)'])
  })

  it('reports one line per failure, with the pages it happens on', () => {
    const lines = formatFailures(['/a', '/b', '/c', '/d', '/e'].map(route => ({ route, message: 'prefetches convex/browser (_nuxt/convex.js)' })))
    expect(lines).toEqual(['✗ /a, /b, /c and 2 more pages prefetches convex/browser (_nuxt/convex.js)'])
  })
})

// The check runs on CI's checkout path. Compared with argv[1], a path with
// spaces, a Windows path or a symlink (macOS's /tmp) would skip it and exit
// 0 without checking anything.
it('runs when started through a symlink', () => {
  const linked = mkdtempSync(join(tmpdir(), 'website-bundle-link-'))
  try {
    symlinkSync(at('scripts/check-website-bundle.mjs'), join(linked, 'gate.mjs'))
    mkdirSync(join(linked, 'empty'))
    const run = spawnSync(process.execPath, [join(linked, 'gate.mjs')], { cwd: join(linked, 'empty'), encoding: 'utf8' })
    expect(run.stderr).toContain('No built site at website/.output/public')
    expect(run.status).toBe(1)
  }
  finally {
    rmSync(linked, { recursive: true, force: true })
  }
})
