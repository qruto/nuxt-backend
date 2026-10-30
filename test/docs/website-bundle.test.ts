import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkPage, checkSite, chunkStore, DEMO_CEILING, dynamicImports, formatFailures, hasAttribute, isRedirect, pagePrefetches, pageScripts, staticImports } from '../../scripts/check-website-bundle.mjs'
import { at } from './helpers'

// scripts/check-website-bundle.mjs, the gate CI runs on the built docs
// site: what a prerendered page fetches up front, while idle and at mount
// must not reach the backend client, except through a <DeferredBackend>
// block; the homepage never. The docs pages with such a block are exactly
// the `demo: true` ones, and what a demo loads once it starts has a ceiling.

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
  'demo-nested.js': 'import{d}from"./deferred.js";const live=()=>import(`./live-nested.js`);',
  'live-nested.js': 'import{b}from"./convex.js";const more=()=>import(`./nested.js`);export default b;',
  'nested.js': 'export const n="a live part\'s own lazy part";',
  'shell.js': 'const pages=[()=>import(`./other-page.js`)];',
  'other-page.js': 'export default "another page";',
  'demo-shell.js': 'import{d}from"./deferred.js";const live=()=>import(`./live-shell.js`);',
  'live-shell.js': 'import"./shell.js";export default 1;',
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'website-bundle-'))
  for (const [name, code] of Object.entries(CHUNKS)) writeFileSync(join(dir, name), code)
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A prerendered page that names these scripts. */
function page({ entry = 'entry.js', preload = [] as string[], prefetch = [] as string[], live = false, demo = false } = {}) {
  return [
    '<!DOCTYPE html><html><head>',
    ...preload.map(chunk => `<link rel="modulepreload" as="script" crossorigin href="/_nuxt/${chunk}">`),
    entry ? `<script type="module" src="/_nuxt/${entry}" crossorigin></script>` : '',
    ...prefetch.map(chunk => `<link rel="prefetch" as="script" crossorigin href="/_nuxt/${chunk}">`),
    `</head><body><div${demo ? ' data-demo-page=""' : ''}>${live ? '<div data-deferred-backend data-state="idle"></div>' : ''}</div></body></html>`,
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

  it('may load it from a <DeferredBackend> block, when the block scrolls into view or the reader starts it', () => {
    const result = checkPage('/docs/build/data/read-write', page({ preload: ['demo.js', 'deferred.js'], live: true, demo: true }), chunkStore(dir))
    expect(result.failures).toEqual([])
    expect(result.live).toBe(true)
    expect(result.demo).toBe(true)
  })
})

// R3's allowlist: the docs pages that may load the backend client are the
// ones whose frontmatter says `demo: true`, which the page marks on its root.
describe('a demo page', () => {
  const gzipped = (...chunks: string[]) => chunks.reduce((sum, chunk) => sum + gzipSync(CHUNKS[chunk]!).length, 0)

  it('fails when it renders a live block without saying `demo: true`', () => {
    expect(failures('/docs/build/auth/sign-in', page({ preload: ['demo.js', 'deferred.js'], live: true }))).toEqual([expect.stringMatching(/renders a live block, but its frontmatter does not say `demo: true`/)])
  })

  it('fails when it says `demo: true` but renders no live block', () => {
    expect(failures('/docs/build/auth/sign-in', page({ preload: ['page.js'], demo: true }))).toEqual([expect.stringMatching(/says `demo: true`, but renders no live block/)])
  })

  it('reads the marks off the tags, never off the text', () => {
    expect(hasAttribute('<p>add data-demo-page to a page</p>', 'data-demo-page')).toBe(false)
    expect(hasAttribute('<div class="x" data-demo-page="">', 'data-demo-page')).toBe(true)
    expect(hasAttribute('<div data-deferred-backend data-state="idle">', 'data-deferred-backend')).toBe(true)
    expect(hasAttribute('<div data-deferred-backend-x>', 'data-deferred-backend')).toBe(false)
    expect(hasAttribute('<div class="x data-demo-page y" title=\'data-demo-page\'>', 'data-demo-page')).toBe(false)
    expect(hasAttribute('<section data-demo-page>', 'data-demo-page')).toBe(true)
  })

  it('measures what it loads once its block starts: the client and the block\'s live part, less what loaded up front', () => {
    const result = checkPage('/docs/build/auth/sign-in', page({ preload: ['demo.js', 'deferred.js'], live: true, demo: true }), chunkStore(dir))
    expect(result.demoBytes).toBe(gzipped('client.js', 'convex.js', 'live.js'))
    // Loaded up front already (a page that preloads its live part), it costs nothing more.
    expect(checkPage('/docs/build/auth/sign-in', page({ preload: ['demo.js', 'deferred.js', 'live.js'], live: true, demo: true }), chunkStore(dir)).demoBytes).toBe(gzipped('client.js'))
  })

  it('counts what a live part loads on demand in turn, and nothing an up-front chunk does', () => {
    const nested = checkPage('/docs/build/auth/sign-in', page({ preload: ['demo-nested.js', 'deferred.js'], live: true, demo: true }), chunkStore(dir))
    expect(nested.demoBytes).toBe(gzipped('client.js', 'convex.js', 'live-nested.js', 'nested.js'))
    // shell.js loaded up front: the pages it imports on demand are not the demo's.
    const shell = checkPage('/docs/build/auth/sign-in', page({ preload: ['demo-shell.js', 'deferred.js', 'shell.js'], live: true, demo: true }), chunkStore(dir))
    expect(shell.demoBytes).toBe(gzipped('client.js', 'convex.js', 'live-shell.js'))
  })

  it('costs nothing to a page without a block', () => {
    expect(checkPage('/docs/start', page({ preload: ['page.js'] }), chunkStore(dir)).demoBytes).toBe(0)
  })
})

describe('a built site', () => {
  const sites: string[] = []
  /** A public folder: these pages, and the fixture chunks with `extra` ones beside them. */
  function build(pages: Record<string, string>, extra: Record<string, string | Buffer> = {}): string {
    const site = mkdtempSync(join(tmpdir(), 'website-site-'))
    sites.push(site)
    for (const [name, code] of Object.entries({ ...CHUNKS, ...extra })) {
      mkdirSync(join(site, '_nuxt'), { recursive: true })
      writeFileSync(join(site, '_nuxt', name), code)
    }
    for (const [file, html] of Object.entries(pages)) {
      mkdirSync(dirname(join(site, file)), { recursive: true })
      writeFileSync(join(site, file), html)
    }
    return site
  }
  afterAll(() => {
    for (const site of sites) rmSync(site, { recursive: true, force: true })
  })

  it('lists its demo pages and passes within both ceilings', () => {
    const { results, demoHeaviest, failures: found } = checkSite(build({
      'index.html': page(),
      'docs/start.html': page({ preload: ['page.js'] }),
      'docs/build/auth/sign-in.html': page({ preload: ['demo.js', 'deferred.js'], live: true, demo: true }),
    }))
    expect(found).toEqual([])
    expect(results.filter(result => result.live).map(result => result.route)).toEqual(['/docs/build/auth/sign-in'])
    expect(demoHeaviest.route).toBe('/docs/build/auth/sign-in')
  })

  // Random bytes do not compress: gzipped, the live part stays over the ceiling.
  it('fails when a demo loads more than the demo ceiling once it starts', () => {
    const heavy = `export const blob="${randomBytes(DEMO_CEILING).toString('base64')}";`
    const { failures: found } = checkSite(build({
      'index.html': page(),
      'docs/build/auth/sign-in.html': page({ preload: ['heavy-demo.js', 'deferred.js'], live: true, demo: true }),
    }, {
      'heavy-demo.js': 'import{d}from"./deferred.js";const live=()=>import(`./heavy.js`);',
      'heavy.js': heavy,
    }))
    expect(formatFailures(found)).toEqual([expect.stringMatching(new RegExp(`^✗ /docs/build/auth/sign-in loads \\d+ bytes of JavaScript, gzipped, once its demo starts, over the ${DEMO_CEILING} demo ceiling$`))])
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
