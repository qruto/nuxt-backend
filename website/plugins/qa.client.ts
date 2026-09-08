import { watch } from 'vue'

/**
 * QA hooks — `?qa=dark,contrast` stamps classes on `<html>` so a reviewer or a
 * screenshot run can force a theme or an accessibility mode without touching
 * OS settings. Values (comma-separated, any order):
 *
 * - `dark` / `light` → `html.dark` / `html.light`. These are the very classes
 *   Docus's `@nuxtjs/color-mode` writes (empty class suffix), and every token
 *   bridge in `app.css` keys on them — so the whole site follows. Writing the
 *   class directly is fine for QA: color-mode stamps its own class from a head
 *   script before this plugin runs and re-stamps only when its preference
 *   changes, so an override survives the load. `dark` wins if both are given.
 * - `contrast` → `html.qa-contrast` (mirrors `prefers-contrast: more` in
 *   `app.css` — the engraving kill-switch).
 * - `reduced` → `html.qa-reduced` (a hook for components that read it).
 *
 * `.client` plugin: never runs during SSR/prerender. In production it installs
 * nothing unless the query is present; in dev it also follows client-side
 * navigation so the query can be added or dropped without a reload.
 */
const MODES = new Set(['dark', 'light', 'contrast', 'reduced'])

function parseModes(raw: unknown): Set<string> {
  const values = Array.isArray(raw) ? raw : [raw]
  const modes = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    for (const part of value.split(',')) {
      const mode = part.trim().toLowerCase()
      if (MODES.has(mode)) modes.add(mode)
    }
  }
  return modes
}

export default defineNuxtPlugin((nuxtApp) => {
  if (typeof document === 'undefined') return
  const route = useRoute()
  if (!import.meta.dev && !('qa' in route.query)) return

  const apply = () => {
    const modes = parseModes(route.query.qa)
    const html = document.documentElement
    html.classList.toggle('qa-contrast', modes.has('contrast'))
    html.classList.toggle('qa-reduced', modes.has('reduced'))
    if (modes.has('dark')) {
      html.classList.add('dark')
      html.classList.remove('light')
    }
    else if (modes.has('light')) {
      html.classList.add('light')
      html.classList.remove('dark')
    }
  }

  // Stamp before first paint, again once mounted (in case color-mode resolved
  // a system preference on mount), and on every query change.
  watch(() => route.query.qa, apply, { immediate: true })
  nuxtApp.hook('app:mounted', apply)
})
