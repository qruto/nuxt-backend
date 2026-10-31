#!/usr/bin/env node
// What a visitor's browser fetches for a prerendered page of the site, and
// when. Fails when a page reaches code that must load on demand
// (website/modules/deferred-backend-client): nuxt-convex-module's client
// plugin, Better Auth's client, convex/browser, and motion-v, the animation
// library Nuxt UI depends on (Docus's menu toggle used it before 5.15).
//
// - Up front: the module scripts the page names (its entry and its
//   modulepreload links), and every chunk those import statically.
// - While idle: the chunks it prefetches.
// - At mount: the homepage renders a live block or calls for the backend
//   client; any page calls for the client outside a <DeferredBackend> block;
//   or a page with no such block imports that code on demand from its own
//   scripts (a lazy live component, an `import()` at mount). A page with a
//   <DeferredBackend> block loads the client when the block scrolls into
//   view or when the reader starts it, by design; those pages are listed.
//
// The docs pages that hold such a block are exactly the ones whose
// frontmatter says `demo: true` (the page marks its root with it): a live
// block on an unmarked page fails, and so does a marked page with none. What
// a demo page loads once its block starts (the backend client, and what its
// blocks import on demand) is measured too, and the heaviest fails above the
// demo ceiling.
//
// It also fails when a page names no entry script (a changed cdnURL or
// buildAssetsDir would leave nothing to check), and prints the heaviest
// page's initial JavaScript, gzipped, failing above the ceiling.
//
// Run after `nuxt build website`: node scripts/check-website-bundle.mjs

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'

const PUBLIC = 'website/.output/public'

/** Code a page must not load before it is asked for, by a string its chunk always carries. */
export const DEFERRED = [
  { what: 'nuxt-convex-module\'s client plugin', marker: 'nuxt-convex-module:better-auth:client' },
  { what: 'Better Auth\'s client', marker: '/get-session' },
  { what: 'convex/browser', marker: 'Attempting reconnect' },
  { what: 'motion-v', marker: 'MotionValue' },
]

/** How a script calls for the backend client: `useNuxtApp().$loadBackendClient`, which <DeferredBackend> uses. */
export const CLIENT_CALL = '$loadBackendClient'

/** The attribute a <DeferredBackend> block renders, in the prerendered HTML. */
export const LIVE_BLOCK = 'data-deferred-backend'

/** The attribute a docs page with `demo: true` renders on its root (pages/[[lang]]/[...slug].vue). */
export const DEMO_PAGE = 'data-demo-page'

/** The most initial JavaScript, gzipped, any page may ship: what it measured, plus room to grow. */
export const CEILING = 420_000

/** The most JavaScript, gzipped, a demo page may load once its block starts: what it measured, plus room to grow. */
export const DEMO_CEILING = 80_000

/** The chunks a script imports statically: `import "./x.js"` and `from "./x.js"`, never `import("./x.js")`. */
export function staticImports(code) {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)].map(match => match[1])
}

/** The chunks a script imports on demand: `import("./x.js")`, in any quotes the minifier picks. */
export function dynamicImports(code) {
  return [...code.matchAll(/\bimport\(\s*[`"']\.\/([^`"']+\.js)[`"']\s*\)/g)].map(match => match[1])
}

/** The `<script>` and `<link>` tags of a page, as the attributes the checks read. */
function tags(html) {
  return (html.match(/<(?:script|link)\s[^>]*>/g) ?? []).map(tag => ({
    entry: tag.startsWith('<script') && tag.includes(' type="module"'),
    rel: tag.match(/\srel="([^"]+)"/)?.[1],
    as: tag.match(/\sas="([^"]+)"/)?.[1],
    url: tag.match(/\s(?:src|href)="([^"]+)"/)?.[1],
  }))
}

/** A built chunk's file name, for a URL under /_nuxt/. */
const chunkOf = url => url?.startsWith('/_nuxt/') ? url.slice('/_nuxt/'.length) : undefined

/** The module scripts a page names: its entry and its modulepreload links, never a prefetch. */
export function pageScripts(html) {
  return tags(html).filter(tag => tag.entry || tag.rel === 'modulepreload').map(tag => chunkOf(tag.url)).filter(Boolean)
}

/** The page's entry scripts. */
export function pageEntries(html) {
  return tags(html).filter(tag => tag.entry).map(tag => chunkOf(tag.url)).filter(Boolean)
}

/** The scripts a page prefetches while idle. */
export function pagePrefetches(html) {
  return tags(html).filter(tag => tag.rel === 'prefetch' && tag.as === 'script').map(tag => chunkOf(tag.url)).filter(Boolean)
}

/** Whether one of a page's tags carries `attribute`: a page that only mentions it in its text does not. */
export function hasAttribute(html, attribute) {
  return (html.match(/<[a-z][^>]*>/gi) ?? []).some((tag) => {
    // Values emptied first: a class or a title that spells the name is no attribute.
    const bare = tag.replace(/"[^"]*"|'[^']*'/g, '""')
    return [...bare.matchAll(/\s([^\s"'=/>]+)/g)].some(([, name]) => name === attribute)
  })
}

/** A redirect Nitro prerendered for a route rule: a refresh and no script, so no app to load. */
export function isRedirect(html) {
  return /<meta\s+http-equiv="refresh"/i.test(html) && !/<script[\s>]/i.test(html)
}

/** Every prerendered HTML file under `dir` (Nitro writes `/docs/start` as `docs/start.html`). */
function htmlFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return htmlFiles(path)
    return entry.endsWith('.html') && !entry.endsWith('.md.html') ? [path] : []
  })
}

/** The route a prerendered file answers. */
const routeOf = (file, root) => `/${relative(root, file)}`.replace(/(?:\/index)?\.html$/, '') || '/'

/**
 * The built chunks in `dir`, each read, gzipped and followed once: `closure`
 * is the chunks given and everything they import statically, and `carries`
 * names the deferred code a chunk holds itself.
 */
export function chunkStore(dir) {
  const code = new Map()
  const size = new Map()
  const closures = new Map()
  const exists = chunk => existsSync(join(dir, chunk))
  const read = (chunk) => {
    if (!code.has(chunk)) code.set(chunk, readFileSync(join(dir, chunk), 'utf8'))
    return code.get(chunk)
  }
  const gzipped = (chunk) => {
    if (!size.has(chunk)) size.set(chunk, gzipSync(read(chunk)).length)
    return size.get(chunk)
  }
  const reach = (start) => {
    const reached = new Set()
    const queue = [start]
    while (queue.length > 0) {
      const chunk = queue.pop()
      if (reached.has(chunk) || !exists(chunk)) continue
      reached.add(chunk)
      queue.push(...staticImports(read(chunk)))
    }
    return reached
  }
  const closure = (chunks) => {
    const seen = new Set()
    for (const start of chunks) {
      if (!closures.has(start)) closures.set(start, reach(start))
      for (const chunk of closures.get(start)) seen.add(chunk)
    }
    return seen
  }
  const carries = chunk => DEFERRED.filter(({ marker }) => read(chunk).includes(marker))
  let all
  const holding = (what) => {
    all ??= readdirSync(dir).filter(name => name.endsWith('.js'))
    return all.filter(chunk => carries(chunk).some(entry => entry.what === what))
  }
  return { read, gzipped, exists, closure, carries, holding }
}

/** Each piece of deferred code `chunks` hold, with the first chunk that holds it. */
function deferredIn(chunks, store) {
  return DEFERRED.flatMap(({ what }) => {
    const chunk = [...chunks].find(name => store.carries(name).some(entry => entry.what === what))
    return chunk ? [{ what, chunk }] : []
  })
}

/** Up front: the deferred code a page's initial chunks hold. */
function upFront(initial, store) {
  return deferredIn(initial, store).map(({ what, chunk }) => `loads ${what} up front (_nuxt/${chunk})`)
}

/** While idle: the deferred code a page prefetches. */
function whileIdle(html, store) {
  return pagePrefetches(html).filter(store.exists)
    .flatMap(chunk => store.carries(chunk).map(({ what }) => `prefetches ${what} (_nuxt/${chunk})`))
}

/** What a page's own chunks import on demand that reaches deferred code: an `import()` at mount, a lazy component. */
function onDemand(own, store) {
  return own.flatMap(chunk => dynamicImports(store.read(chunk)).flatMap(target =>
    deferredIn(store.closure([target]), store)
      .map(({ what, chunk: holder }) => `may load ${what} at mount: _nuxt/${chunk} imports _nuxt/${target} on demand (_nuxt/${holder})`)))
}

/**
 * At mount: the homepage may not call for the backend client at all, any
 * other page only from a <DeferredBackend> block (`live`), and a page with
 * none may not import that code on demand either.
 */
function atMount(route, live, own, store) {
  const call = own.find(chunk => store.read(chunk).includes(CLIENT_CALL))
  if (route === '/' && (live || call)) return [`renders a live block that loads the backend client${call ? ` (_nuxt/${call})` : ''}: the homepage reads /api/playground/status instead`]
  if (live) return []
  return [
    ...call ? [`calls for the backend client at mount, outside a <DeferredBackend> block (_nuxt/${call})`] : [],
    ...onDemand(own, store),
  ]
}

/**
 * A docs page holds a live block exactly when it says `demo: true`: the
 * pages that may load the backend client from the docs are the demo pages.
 */
function demoPin(route, live, demo) {
  if (!route.startsWith('/docs/') || live === demo) return []
  return [live
    ? 'renders a live block, but its frontmatter does not say `demo: true`'
    : 'says `demo: true`, but renders no live block: drop the field, or add the block']
}

/**
 * What a demo page loads once its block starts, gzipped: the backend client
 * (nuxt-convex-module's client plugin) and what the page's blocks import on
 * demand (their lazy live parts), with everything those import, statically
 * or on demand in turn (a live part's own lazy part), less what the page
 * loaded up front. A chunk loaded up front is not followed: what it imports
 * on demand (the router's pages) is not the demo's. A block's chunk is one
 * of the page's own that reaches the call for the client.
 */
function demoLoad(initial, own, store) {
  const blocks = own.filter(chunk => [...store.closure([chunk])].some(reached => store.read(reached).includes(CLIENT_CALL)))
  const later = new Set()
  const queue = [
    ...store.holding('nuxt-convex-module\'s client plugin'),
    ...blocks.flatMap(chunk => dynamicImports(store.read(chunk))),
  ]
  while (queue.length > 0) {
    const chunk = queue.pop()
    if (later.has(chunk) || initial.has(chunk) || !store.exists(chunk)) continue
    later.add(chunk)
    const code = store.read(chunk)
    queue.push(...staticImports(code), ...dynamicImports(code))
  }
  return [...later].reduce((sum, chunk) => sum + store.gzipped(chunk), 0)
}

/**
 * What a prerendered page loads that it must not, and when: up front, while
 * idle, or at mount (see the top of this file). Each failure is a `{ route,
 * message }`; `live` says the page holds a <DeferredBackend> block, `demo`
 * that it says `demo: true`, and `demoBytes` what it loads once its block
 * starts.
 */
export function checkPage(route, html, store) {
  const entries = pageEntries(html).filter(store.exists)
  if (entries.length === 0) {
    return { route, live: false, demo: false, bytes: 0, demoBytes: 0, failures: [{ route, message: 'names no entry script under /_nuxt/ that the build wrote: did cdnURL or buildAssetsDir change?' }] }
  }
  const initial = store.closure(pageScripts(html))
  const app = store.closure(entries)
  const own = [...initial].filter(chunk => !app.has(chunk))
  const live = hasAttribute(html, LIVE_BLOCK)
  const demo = hasAttribute(html, DEMO_PAGE)
  // The entry's chunks run on every page: a call there is reported once, as theirs.
  const startup = [...app].find(chunk => store.read(chunk).includes(CLIENT_CALL))
  const failures = [
    ...[...upFront(initial, store), ...whileIdle(html, store), ...atMount(route, live, own, store), ...demoPin(route, live, demo)].map(message => ({ route, message })),
    ...startup ? [{ route: 'every page', message: `calls for the backend client at startup (_nuxt/${startup})` }] : [],
  ]
  return {
    route,
    live,
    demo,
    failures,
    bytes: [...initial].reduce((sum, chunk) => sum + store.gzipped(chunk), 0),
    demoBytes: live ? demoLoad(initial, own, store) : 0,
  }
}

/** One line per distinct failure, with the pages it happens on. */
export function formatFailures(failures) {
  const routes = new Map()
  for (const { route, message } of failures) {
    if (!routes.has(message)) routes.set(message, new Set())
    routes.get(message).add(route)
  }
  return [...routes].map(([message, on]) => {
    const list = [...on]
    const more = list.length > 3 ? ` and ${list.length - 3} more pages` : ''
    return `✗ ${list.slice(0, 3).join(', ')}${more} ${message}`
  })
}

/**
 * Every prerendered page under `dir` (a built site's public folder) that
 * defers the backend client, checked: the home page and the docs. Returns
 * the results, the heaviest page up front and the heaviest demo, and every
 * failure, the ceilings' included.
 */
export function checkSite(dir) {
  const store = chunkStore(join(dir, '_nuxt'))
  const results = htmlFiles(dir)
    .map(file => ({ route: routeOf(file, dir), html: readFileSync(file, 'utf8') }))
    .filter(({ route, html }) => (route === '/' || route.startsWith('/docs/')) && !isRedirect(html))
    .map(({ route, html }) => checkPage(route, html, store))
  const heaviest = results.reduce((top, result) => result.bytes > top.bytes ? result : top, { route: '', bytes: 0 })
  const demoHeaviest = results.reduce((top, result) => result.demoBytes > top.demoBytes ? result : top, { route: '', demoBytes: 0 })
  const failures = results.flatMap(result => result.failures)
  if (results.length === 0) failures.push({ route: dir, message: 'holds no prerendered page: did the build prerender the docs?' })
  if (heaviest.bytes > CEILING) failures.push({ route: heaviest.route, message: `ships ${heaviest.bytes} bytes of initial JavaScript, gzipped, over the ${CEILING} ceiling` })
  if (demoHeaviest.demoBytes > DEMO_CEILING) failures.push({ route: demoHeaviest.route, message: `loads ${demoHeaviest.demoBytes} bytes of JavaScript, gzipped, once its demo starts, over the ${DEMO_CEILING} demo ceiling` })
  return { results, heaviest, demoHeaviest, failures }
}

function main() {
  if (!existsSync(join(PUBLIC, '_nuxt'))) {
    console.error(`No built site at ${PUBLIC}: run \`nuxt build website\` first.`)
    process.exit(1)
  }
  const { results, heaviest, demoHeaviest, failures } = checkSite(PUBLIC)
  console.log(`Checked ${results.length} prerendered pages. Heaviest initial JavaScript: ${heaviest.route} at ${(heaviest.bytes / 1000).toFixed(1)} kB gzipped (ceiling ${CEILING / 1000} kB).`)
  const live = results.filter(result => result.live).map(result => result.route)
  console.log(`Pages that load the backend client when a live block scrolls into view or is started: ${live.join(', ') || 'none'}.`)
  if (demoHeaviest.route) console.log(`Heaviest demo: ${demoHeaviest.route} loads ${(demoHeaviest.demoBytes / 1000).toFixed(1)} kB gzipped once it starts (ceiling ${DEMO_CEILING / 1000} kB).`)
  if (failures.length > 0) {
    console.error(formatFailures(failures).join('\n'))
    process.exit(1)
  }
}

// `import.meta.main`, not a comparison with argv[1]: that one is false when
// the path is percent-encoded, on Windows, or through a symlink, and the
// check would pass by never running.
if (import.meta.main) main()
