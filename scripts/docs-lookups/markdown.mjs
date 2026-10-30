/** The Markdown the lookups write: tables, code spans and lists, escaped for a table cell. */

/** A code span, wide enough for the backticks inside it. */
export function code(text) {
  const value = String(text)
  const fence = value.includes('`') ? '``' : '`'
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${value}${pad}${fence}`
}

/** Code spans joined with commas, or `empty` when there are none. */
export function codes(values, empty = 'none') {
  return values.length ? values.map(code).join(', ') : empty
}

/** Text that sits in one table cell: one line, its pipes escaped. */
function cell(text) {
  return String(text ?? '').replace(/\s*\n\s*/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim()
}

/** A Markdown table: a header row, its rule, then one row per entry. */
export function table(headers, rows) {
  const line = cells => `| ${cells.map(cell).join(' | ')} |`
  return [line(headers), `|${headers.map(() => '---').join('|')}|`, ...rows.map(line)].join('\n')
}

/** A bulleted list, one item per line. */
export function list(items) {
  return items.map(item => `- ${item}`).join('\n')
}

/** Paragraphs and blocks, separated by blank lines; empty ones dropped. */
export function blocks(...parts) {
  return parts.flat().filter(part => part !== undefined && part !== null && part !== '').join('\n\n')
}

/** A docs link. */
export function link(text, to) {
  return `[${text}](${to})`
}
