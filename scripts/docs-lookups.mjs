#!/usr/bin/env node
/**
 * The docs' lookups, generated from the code's registries: the environment
 * variables, labels, app config, project and catalog files, entrypoints,
 * composables, components and theme tokens, the backend's helpers, routes,
 * events, errors, hooks and limits, the CLI and its diagnostics, the cheat
 * sheet, each tab's "What you get", and the README inventory. Each lookup
 * owns a marked region of a page (scripts/docs-lookups/regions.mjs), so the
 * prose around it stays hand-written.
 *
 *   node scripts/docs-lookups.mjs          write every lookup (part of `pnpm generate`)
 *   node scripts/docs-lookups.mjs --check  fail when one is stale
 *
 * test/docs/docs-lookups.test.ts runs the same check in the docs tests.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import './lib/ts-resolve.mjs'

const { currentText, expectedText, lookupFiles } = await import('./docs-lookups/index.mjs')
const { root } = await import('./docs-lookups/source.mjs')

const check = process.argv.includes('--check')
const stale = []
for (const file of lookupFiles()) {
  const current = currentText(file)
  const next = expectedText(file, current)
  if (next === current) continue
  stale.push(file)
  if (!check) writeFileSync(join(root, file), next)
}

if (check && stale.length > 0) {
  console.error(`docs-lookups: stale, run \`pnpm docs:lookups\`:\n${stale.map(file => `  ${file}`).join('\n')}`)
  process.exit(1)
}
console.log(`docs-lookups: ${check ? 'checked' : 'wrote'} ${lookupFiles().length} files${stale.length && !check ? `, ${stale.length} changed` : ''}`)
