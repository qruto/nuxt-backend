#!/usr/bin/env node
/**
 * `pnpm try:notes` — the review notes left on `pnpm try` (press N on a page)
 * as Markdown, one section per page in the order the pages were first
 * noted, each note with the element it is about and the viewport it was
 * taken in. Reads `.review/notes.jsonl` at the repository root.
 *
 *   pnpm try:notes                 print them
 *   pnpm try:notes --out notes.md  write them to a file
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { root } from './kit.mjs'

/** Where the dev server writes the notes. */
export const NOTES_FILE = join(root, '.review/notes.jsonl')

/** The notes in a JSON Lines text, in order; a line that is no note is skipped. */
export function parseNotes(text) {
  const notes = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const note = JSON.parse(line)
      if (typeof note?.page === 'string' && typeof note?.note === 'string') notes.push(note)
    }
    catch { /* a torn line from an interrupted write */ }
  }
  return notes
}

/** A note's text as one Markdown list item: continuation lines indented under it. */
function item(note) {
  const [first, ...rest] = note.note.trim().split('\n')
  const where = [
    note.selector ? `\`${note.selector.replaceAll('`', '\'')}\`` : 'the whole page',
    note.text ? `“${note.text}”` : null,
    note.viewport?.width ? `${note.viewport.width}×${note.viewport.height}` : null,
    note.at ? note.at.slice(0, 16).replace('T', ' ') : null,
  ].filter(Boolean).join(' · ')
  return [`- ${first}`, ...rest.map(line => `  ${line}`), `  <sub>${where}</sub>`].join('\n')
}

/** The notes as Markdown, grouped by page. */
export function notesMarkdown(notes) {
  if (notes.length === 0) return '# Review notes\n\nNo notes yet: press N on a page of `pnpm try` to leave one.\n'
  const pages = new Map()
  for (const note of notes) {
    const page = note.page.split('#')[0]
    if (!pages.has(page)) pages.set(page, [])
    pages.get(page).push(note)
  }
  const sections = [...pages].map(([page, entries]) => [`## ${page}`, '', ...entries.map(item)].join('\n'))
  return `# Review notes\n\n${notes.length} note${notes.length === 1 ? '' : 's'} on ${pages.size} page${pages.size === 1 ? '' : 's'}.\n\n${sections.join('\n\n')}\n`
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  const out = args[0] === '--out' ? args[1] : args.find(arg => arg.startsWith('--out='))?.slice('--out='.length)
  const markdown = notesMarkdown(existsSync(NOTES_FILE) ? parseNotes(readFileSync(NOTES_FILE, 'utf8')) : [])
  if (out) {
    writeFileSync(resolve(process.cwd(), out), markdown)
    console.log(`Review notes written to ${out}.`)
  }
  else {
    process.stdout.write(markdown)
  }
}
