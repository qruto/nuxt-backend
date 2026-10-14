#!/usr/bin/env node
/**
 * The docs' house style, applied: sentence case on every page title, every
 * `.navigation.yml` title, and every h1–h3 heading of the hand-written docs.
 * The first word keeps its capital; a later word loses it unless it is a
 * proper noun or a name of its own (PROPER_NOUNS), an acronym, mixed case
 * (DevTools, OAuth), code, or a quoted string (an error message or a log line,
 * quoted as it reads). Fenced code is never touched.
 *
 * `pnpm docs:style` rewrites the files; test/docs/docs-style.test.ts fails
 * while any of them would change, so a rebase that brings old headings back
 * only needs the command re-run.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Names that keep their capitals wherever they stand. Multi-word names are
 * matched whole, before single words.
 */
export const PROPER_NOUNS = [
  'Better Auth', 'Claude Code', 'Convex', 'Nuxt', 'Nitro', 'Vue', 'Vite', 'Polar', 'Resend', 'Vercel',
  'Netlify', 'Cloudflare', 'Docus', 'Markdown', 'TypeScript', 'JavaScript', 'Node', 'GitHub', 'Google',
  'Stripe', 'Turnstile', 'Chrome', 'Safari', 'Firefox', 'Windows', 'macOS', 'Linux', 'Docker', 'Claude',
  'Cursor', 'Inspector', 'Tailwind', 'ESLint', 'Vitest', 'Playwright', 'Content Security Policy',
]

/** Pages written by a generator: their headings come from elsewhere. */
const GENERATED = [/\/10\.reference\/10\.api\//, /\/09\.ship\/5\.releases\/[12]\.(?:changelog|stability)\.md$/]

/** Sentence case for one line of title text. */
export function sentenceCase(text) {
  // Code spans and links' URLs are never words to recase.
  const kept = []
  const keep = (value) => {
    kept.push(value)
    return `\u0000${kept.length - 1}\u0000`
  }
  let out = text.replace(/`[^`]*`/g, keep).replace(/\]\([^)]*\)/g, keep).replace(/"[^"]*"|“[^”]*”/g, keep)
  for (const noun of [...PROPER_NOUNS].sort((a, b) => b.length - a.length)) {
    // fallow-ignore-next-line security-sink -- the pattern is a PROPER_NOUNS entry from this file, regex-escaped; no input reaches it; verified 2026-10-14
    out = out.replace(new RegExp(`\\b${noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), keep)
  }
  let first = true
  out = out.replace(/[A-Z][\w'’-]*/gi, (word) => {
    const lower = (part, index) => (index > 0 || !first) && /^[A-Z][a-z’']*$/.test(part) ? part.toLowerCase() : part
    const recased = word.split('-').map(lower).join('-')
    first = false
    return recased
  })
  // A word protected as a proper noun can still be the first word; nothing
  // else needs restoring. A kept quote can hold a kept code span, so restore
  // until no placeholder is left.
  while (/\0\d+\0/.test(out)) out = out.replace(/\0(\d+)\0/g, (_match, index) => kept[Number(index)])
  return out
}

/** A `title:` line with its value recased, quotes kept; any other line unchanged. */
function recaseTitle(line) {
  if (!line.startsWith('title:')) return line
  const value = line.slice('title:'.length).trim()
  const quote = value[0] === '"' || value[0] === '\'' ? value[0] : ''
  const inner = quote && value.length > 1 && value.endsWith(quote) ? value.slice(1, -1) : value
  return `title: ${quote}${sentenceCase(inner)}${quote}`
}

/** The file's text in house style. */
export function styled(file, text) {
  if (file.endsWith('.navigation.yml')) return text.split('\n').map(recaseTitle).join('\n')
  let fenced = false
  let inFrontmatter = false
  return text.split('\n').map((line, index) => {
    if (index === 0 && line === '---') {
      inFrontmatter = true
      return line
    }
    if (inFrontmatter) {
      if (line === '---') inFrontmatter = false
      return recaseTitle(line)
    }
    if (line.trimStart().startsWith('```') || line.trimStart().startsWith('~~~')) fenced = !fenced
    if (fenced) return line
    const level = line.match(/^#{1,3} /)?.[0]
    return level ? `${level}${sentenceCase(line.slice(level.length))}` : line
  }).join('\n')
}

/** Every hand-written docs file the style applies to. */
export function styledFiles() {
  return execFileSync('git', ['ls-files', 'website/content/docs'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(file => (file.endsWith('.md') || file.endsWith('.navigation.yml')) && !GENERATED.some(pattern => pattern.test(`/${file}`)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let changed = 0
  for (const file of styledFiles()) {
    const path = join(root, file)
    const text = readFileSync(path, 'utf8')
    const next = styled(file, text)
    if (next !== text) {
      writeFileSync(path, next)
      changed++
    }
  }
  console.log(`docs-style: ${changed} file(s) restyled`)
}
