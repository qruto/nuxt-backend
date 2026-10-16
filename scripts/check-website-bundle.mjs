#!/usr/bin/env node
// What a visitor's browser runs before a prerendered page of the site is
// usable: the module scripts the page names (its entry and its
// modulepreload links) and every chunk those import statically. Fails when
// that set reaches code that must load on demand
// (website/modules/deferred-backend-client): nuxt-convex-module's client
// plugin, Better Auth's client, convex/browser, and the animation library
// Docus's menu toggle brought in. Prints the heaviest page's initial
// JavaScript, gzipped, and fails above the ceiling.
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

/** The most initial JavaScript, gzipped, any page may ship: what it measured, plus room to grow. */
export const CEILING = 420_000

/** The chunks a script imports statically: `import "./x.js"` and `from "./x.js"`, never `import("./x.js")`. */
export function staticImports(code) {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/([^"']+\.js)["']/g)].map(match => match[1])
}

/** The module scripts a page names: its entry and its modulepreload links, never a prefetch. */
export function pageScripts(html) {
  const sources = (html.match(/<(?:script|link)\s[^>]*>/g) ?? []).map((tag) => {
    if (tag.startsWith('<script') && tag.includes(' type="module"')) return tag.match(/\ssrc="([^"]+)"/)?.[1]
    if (tag.includes(' rel="modulepreload"')) return tag.match(/\shref="([^"]+)"/)?.[1]
    return undefined
  })
  return sources.filter(src => src?.startsWith('/_nuxt/')).map(src => src.slice('/_nuxt/'.length))
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
const routeOf = file => `/${relative(PUBLIC, file)}`.replace(/(?:\/index)?\.html$/, '') || '/'

/** The built chunks, each read and gzipped once. */
function chunkStore() {
  const code = new Map()
  const size = new Map()
  const read = (chunk) => {
    if (!code.has(chunk)) code.set(chunk, readFileSync(join(PUBLIC, '_nuxt', chunk), 'utf8'))
    return code.get(chunk)
  }
  const gzipped = (chunk) => {
    if (!size.has(chunk)) size.set(chunk, gzipSync(read(chunk)).length)
    return size.get(chunk)
  }
  return { read, gzipped, exists: chunk => existsSync(join(PUBLIC, '_nuxt', chunk)) }
}

/** Every chunk a page runs before it is usable: its scripts and what they import statically. */
function initialChunks(html, store) {
  const seen = new Set()
  const queue = pageScripts(html)
  while (queue.length > 0) {
    const chunk = queue.pop()
    if (seen.has(chunk) || !store.exists(chunk)) continue
    seen.add(chunk)
    queue.push(...staticImports(store.read(chunk)))
  }
  return [...seen]
}

/** What a page loads up front that it must not, and its initial JavaScript, gzipped. */
function checkPage(file, store) {
  const route = routeOf(file)
  const chunks = initialChunks(readFileSync(file, 'utf8'), store)
  const failures = DEFERRED.flatMap(({ what, marker }) => {
    const chunk = chunks.find(name => store.read(name).includes(marker))
    return chunk ? [`${route} loads ${what} up front (_nuxt/${chunk})`] : []
  })
  return { route, failures, bytes: chunks.reduce((sum, chunk) => sum + store.gzipped(chunk), 0) }
}

function main() {
  if (!existsSync(join(PUBLIC, '_nuxt'))) {
    console.error(`No built site at ${PUBLIC}: run \`nuxt build website\` first.`)
    process.exit(1)
  }
  const store = chunkStore()
  // The home page and the docs: the pages that defer the backend client.
  const results = htmlFiles(PUBLIC)
    .filter((file) => {
      const route = routeOf(file)
      return route === '/' || route.startsWith('/docs/')
    })
    .map(file => checkPage(file, store))
  const heaviest = results.reduce((top, result) => result.bytes > top.bytes ? result : top, { route: '', bytes: 0 })
  const failures = results.flatMap(result => result.failures)
  if (results.length === 0) failures.push('no prerendered page found: did the build prerender the docs?')
  if (heaviest.bytes > CEILING) failures.push(`${heaviest.route} ships ${heaviest.bytes} bytes of initial JavaScript, gzipped, over the ${CEILING} ceiling`)

  console.log(`Checked ${results.length} prerendered pages. Heaviest initial JavaScript: ${heaviest.route} at ${(heaviest.bytes / 1000).toFixed(1)} kB gzipped (ceiling ${CEILING / 1000} kB).`)
  if (failures.length > 0) {
    console.error(failures.map(failure => `✗ ${failure}`).join('\n'))
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()
