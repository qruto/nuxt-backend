import { useRuntimeConfig } from 'nuxt/server'
import { MOUNTED_EVENT } from '../chunk-recovery'

// Recovery from code that fails to load while a page starts.
//
// The server's HTML paints whatever happens next, so a failed chunk leaves a
// page that looks finished and does nothing: a button with no handler and no
// error for anyone to see, or Nuxt swapping a good page for a 500. A flaky
// phone connection does that, and so does a deploy that replaces chunks under
// an open page. One reload cures both. (Except in WebKit after an HTTP
// error: there a scripted reload is served the same failed file, and only the
// visitor's own navigation fetches it again, so a form that posts, rather
// than one that needs the app, still works on a page that never woke.)
//
// All of this runs inline in the head, because nothing of the app can see
// it: a chunk the entry imports statically fails before any app code runs,
// and one the first route imports fails inside Nuxt's router plugin, ahead of
// every plugin. Its guard is a key of its own, so a page reloads once
// however it failed, and Nuxt's `nuxt:reload` (ten seconds per path) is
// left to Nuxt: a recovery never holds back the reload Nuxt makes when a
// navigation's chunk fails.

/** How long a reload of one path holds off the next, in milliseconds. */
export const RELOAD_GUARD_MS = 60_000

/** Where the guard lives in `sessionStorage`: the path last reloaded, and until when. */
export const RELOAD_GUARD_KEY = 'nuxt-backend:reload'

/**
 * The inline script: it reloads on a failed module script or stylesheet
 * served from `assetsDir` (the app's `app.buildAssetsDir`) before the page
 * has loaded, and on a failed dynamic import (`vite:preloadError`), both
 * only before the app has mounted, which the client plugin tells it
 * (MOUNTED_EVENT). The stylesheets in the head are done before the app
 * runs, so the gate leaves out only the ones Vite adds later for a dynamic
 * import's CSS: one of those fails on a running app, and Nuxt lets the
 * import go on without it. Later failures keep Nuxt's handling: a reload on
 * navigation, nothing for a decoration. Without `sessionStorage` it stays
 * put, since nothing would stop a loop. It writes no DOM sink, so Trusted
 * Types has nothing to refuse.
 */
export function chunkRecoveryScript(assetsDir: string): string {
  // As a JavaScript string that cannot close the script element it sits in.
  const dir = JSON.stringify(assetsDir).replace(/</g, '\\u003c')
  return `(function(){
var dir=${dir},key='${RELOAD_GUARD_KEY}',mounted=false
function recover(){
var now=Date.now(),path=location.pathname
try{
var last=JSON.parse(sessionStorage.getItem(key)||'{}')
if(last.path===path&&last.expires>now)return
sessionStorage.setItem(key,JSON.stringify({path:path,expires:now+${RELOAD_GUARD_MS}}))
}catch(error){return}
location.reload()
}
addEventListener('error',function(event){
var el=event.target
if(mounted||document.readyState==='complete'||!el||!el.tagName)return
var module=el.tagName==='SCRIPT'&&el.type==='module'
var style=el.tagName==='LINK'&&el.rel==='stylesheet'
if((module||style)&&(el.src||el.href||'').indexOf(dir)>=0)recover()
},true)
addEventListener('${MOUNTED_EVENT}',function(){mounted=true})
addEventListener('vite:preloadError',function(){
if(!mounted)recover()
})
})()`
}

/** A `<meta charset>`, which must stay within the first 1024 bytes of the page. */
const CHARSET = /<meta charset="?[\w-]+"?\s*\/?>/i

/**
 * The head with `tag` first, before every script and stylesheet it guards:
 * right after the `<meta charset>`, which keeps its place at the very top.
 */
export function headWithScript(head: string[], tag: string): string[] {
  const index = head.findIndex(chunk => CHARSET.test(chunk))
  if (index === -1) return [tag, ...head]
  const chunk = head[index]!
  const end = chunk.search(CHARSET) + chunk.match(CHARSET)![0].length
  return [...head.slice(0, index), `${chunk.slice(0, end)}${tag}${chunk.slice(end)}`, ...head.slice(index + 1)]
}

/** The part of the Nitro app the plugin uses: the render's HTML hook. */
interface RenderNitroApp {
  hooks: { hook: (name: 'render:html', run: (html: { head: string[] }) => void) => unknown }
}

/**
 * Puts the recovery script first in every server-rendered page of a
 * production build (the module leaves it out of development, and out
 * altogether with `backend.chunkRecovery: false`). Inline, and written
 * with no nonce of its own: nuxt-security's `render:html` pass puts the
 * request's nonce on every `<script>` in the head, without looking for one
 * already there, and it always runs after this one (nuxt-security sorts its
 * Nitro plugins last), so the tag carries the nonce the package's
 * `script-src` trusts exactly once. Where nuxt-security sends no
 * `Content-Security-Policy`, it adds none, and none is needed. A
 * prerendered page has no nonce, and nuxt-security hashes its inline
 * scripts instead. Written on the server alone, never through the head
 * manager, so hydrating never writes it again. `nuxt/server` is its only
 * server import, so the same file runs on Nitro 2 and Nitro 3.
 */
export default function chunkRecoveryPlugin(nitroApp: RenderNitroApp): void {
  const script = chunkRecoveryScript((useRuntimeConfig() as { app?: { buildAssetsDir?: string } }).app?.buildAssetsDir || '/_nuxt/')
  nitroApp.hooks.hook('render:html', (html) => {
    html.head = headWithScript(html.head, `<script>${script}</script>`)
  })
}
