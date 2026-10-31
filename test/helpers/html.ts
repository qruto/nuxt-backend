/**
 * Rendered HTML without its comments: the fragment and slot markers a Vue
 * render leaves (`<!--[-->`, `<!--]-->`, `<!--v-if-->`). Replaced until the
 * string stops changing, so a marker that only forms once another is gone
 * goes too.
 */
export function withoutComments(html: string): string {
  let previous: string
  do {
    previous = html
    html = html.replace(/<!--[\s\S]*?-->/g, '')
  } while (html !== previous)
  return html
}
