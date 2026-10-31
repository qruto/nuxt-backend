/**
 * The search sections of a page, as Nuxt Content splits it: the text before
 * the first heading is the page's own section (its route), and each heading
 * starts one at `<route>#<anchor>`. A section is generated when most of its
 * lines sit inside a lookup's region, so search can rank it below the
 * sections written by hand (website/shared/search-ranking.ts).
 */

/** A heading's anchor: lower-cased words, markup and punctuation dropped, `-` between words, `_` before a leading digit. */
export function anchorOf(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^(\d)/, '_$1')
}

/** The body of a page: its text after the frontmatter, line by line, with whether each sits inside a region. */
function bodyLines(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0
  let inRegion = false
  let fenced = false
  return lines.slice(start).map((line) => {
    if (line.startsWith('<!-- generated:')) inRegion = true
    const marker = /^<!-- \/?generated:/.test(line)
    if (/^<!-- \/generated:/.test(line)) inRegion = false
    if (line.startsWith('```')) fenced = !fenced
    return { line, inRegion: inRegion || marker, marker, heading: !fenced && /^#{1,6} /.test(line) }
  })
}

/** Every section of a page with whether it is generated; `route` is the page's route. */
export function sectionsOf(route, text) {
  const sections = [{ id: route, inside: 0, total: 0 }]
  const seen = new Map()
  for (const { line, inRegion, marker, heading } of bodyLines(text)) {
    if (heading) {
      const base = anchorOf(line.replace(/^#+ /, ''))
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      sections.push({ id: `${route}#${count ? `${base}-${count}` : base}`, inside: inRegion ? 1 : 0, total: 1 })
      continue
    }
    if (marker || !line.trim()) continue
    const section = sections.at(-1)
    section.total++
    if (inRegion) section.inside++
  }
  return sections.map(({ id, inside, total }) => ({ id, generated: total > 0 && inside * 2 > total }))
}
