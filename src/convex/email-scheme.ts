// The dark half of the email layout, by the media query that turns it on.
// Kept apart from the layout itself, so a preview (the DevTools panel, a
// playground page) can show the dark rendering without loading the labels.

/** The media query the layout's dark styles sit under, exactly as the layout writes it. */
export const DARK_SCHEME_QUERY = '@media (prefers-color-scheme: dark)'

/**
 * A rendered email as a reader in `scheme` sees it, whatever the previewing
 * page prefers: `dark` applies the layout's dark styles unconditionally,
 * `light` drops them. A message without the layout comes back unchanged.
 *
 * @experimental It rewrites the layout's own media query, so it follows the
 * layout's markup, which may change in any release (STABILITY.md).
 */
export function forceColorScheme(html: string, scheme: 'light' | 'dark'): string {
  return html.replaceAll(DARK_SCHEME_QUERY, scheme === 'dark' ? '@media all' : '@media not all')
}
