/**
 * The display modes an installed app opens in: the manifest's `display`, or
 * the desktop title-bar overlay. Not `fullscreen`: Chromium matches it for a
 * browser tab in fullscreen too (F11), which would hide the install there, so
 * an app installed with `display: 'fullscreen'` reads as not installed.
 */
const INSTALLED_MODES = ['standalone', 'minimal-ui', 'window-controls-overlay'] as const

/**
 * The app runs from the Home Screen or as an installed app: iOS says so on
 * `navigator.standalone`, every other browser through the display mode it
 * opened the window in. `false` on the server.
 */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true
  return INSTALLED_MODES.some(mode => window.matchMedia?.(`(display-mode:${mode})`).matches === true)
}
