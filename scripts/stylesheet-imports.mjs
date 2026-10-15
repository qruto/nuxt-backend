#!/usr/bin/env node
/**
 * Writes the @import list of src/runtime/vue/components/ui.css from the
 * stylesheets beside it: tokens.css first (every family reads its `--bk-*`
 * defaults), then each family's stylesheet in file-name order. A new
 * component family adds its own stylesheet and never edits a shared list:
 * run `pnpm generate` (or this script).
 *
 * Order between families carries no meaning: each stylesheet styles only its
 * own `[data-<family>]` root, and no component renders another family's.
 *
 *   node scripts/stylesheet-imports.mjs   write ui.css
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const COMPONENTS = join(fileURLToPath(new URL('.', import.meta.url)), '../src/runtime/vue/components')
const UI = join(COMPONENTS, 'ui.css')
const MARKER = '@layer theme, base, components, utilities;\n'

/** The stylesheets ui.css imports, in import order. */
export function stylesheets() {
  const families = readdirSync(COMPONENTS)
    .filter(file => file.endsWith('.css') && file !== 'ui.css' && file !== 'tokens.css')
    .sort()
  return ['tokens.css', ...families]
}

/** ui.css's text: its comment and layer order kept, the import list rewritten. */
export function uiCssText(current = readFileSync(UI, 'utf8')) {
  const head = current.indexOf(MARKER)
  if (head < 0) throw new Error(`ui.css: expected the layer order statement \`${MARKER.trim()}\``)
  const imports = stylesheets().map(file => `@import './${file}' layer(components.backend);`)
  return `${current.slice(0, head + MARKER.length)}\n${imports.join('\n')}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(UI, uiCssText())
  console.log(`stylesheet-imports: ${stylesheets().length} stylesheets`)
}
