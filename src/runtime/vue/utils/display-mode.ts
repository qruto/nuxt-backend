/** The display modes an installed app opens in: the manifest's `display`, or the desktop title-bar overlay. */
const INSTALLED_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'] as const

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
