// Escaping for the markup of an email, kept apart so the layout, the blocks and
// the templates all share one function without importing each other.

/**
 * Escape text for HTML: `&`, `<`, `>`, `"` and `'`. Every packaged template
 * runs each value through it; an override that writes its own HTML should do
 * the same with anything a user typed (a name, a workspace name, a gift
 * sender's name), or that user can put markup into an email your domain sends.
 * The `html` tag does it for every value it interpolates.
 *
 * @example
 * ```ts
 * gift: (data, { byDefault }) => ({ ...byDefault(data), html: `<p>From ${escapeHtml(data.purchaserName ?? 'someone')}</p>` })
 * ```
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] ?? c
  ))
}
