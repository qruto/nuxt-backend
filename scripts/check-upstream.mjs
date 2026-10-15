#!/usr/bin/env node
/**
 * Renders .github/upstream.json as the body of the "ci: upstream watch"
 * issue, checking each watch against the npm registry: does the range the
 * upstream package now declares admit the version we wait for, or a later
 * one? (`^1.1.0` supports the 1.x line a watch for 1.0.0 waits on, though
 * 1.0.0 itself is outside it.)
 *
 * Prints the Markdown body on stdout. Under GitHub Actions it also writes
 * `ready` (the ids of the watches that are met, comma-separated) to
 * $GITHUB_OUTPUT, so the report job can tell when that set changes.
 *
 * Usage: node scripts/check-upstream.mjs
 */

import { appendFileSync, readFileSync } from 'node:fs'
import semver from 'semver'

const config = JSON.parse(readFileSync(new URL('../.github/upstream.json', import.meta.url), 'utf8'))

/** An npm package name, scoped or not: nothing else may reach the registry URL. */
const PACKAGE_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/

/** The latest published manifest of a package. */
async function latest(name) {
  if (!PACKAGE_NAME.test(name)) throw new Error(`.github/upstream.json: ${JSON.stringify(name)} is not an npm package name`)
  // fallow-ignore-next-line security-sink -- a fixed origin (the npm registry) and a package name checked against PACKAGE_NAME; runs in the weekly workflow only; verified 2026-10-15
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`)
  if (!response.ok) throw new Error(`${name}: the registry answered ${response.status}`)
  return await response.json()
}

/** A table cell: a `|` inside one ends it early. */
const cell = text => String(text).replaceAll('|', '\\|')

const rows = []
const ready = []
for (const watch of config.watches) {
  const manifest = await latest(watch.package)
  const range = manifest[watch.field]?.[watch.dependency]
  const met = typeof range === 'string' && semver.validRange(range) !== null && semver.intersects(range, `>=${watch.version}`)
  if (met) ready.push(watch.id)
  rows.push(`| ${met ? '✅ ready' : '⏳ waiting'} | ${watch.title} | \`${watch.package}@${manifest.version}\` ${watch.field.replace('Dependencies', '')}: \`${cell(`${watch.dependency} ${range ?? '—'}`)}\` | ${watch.unblocks} |`)
}

const body = [
  'What this package waits on upstream. Kept in step with [.github/upstream.json](../blob/main/.github/upstream.json) by the weekly `upstream` job; edit that file, not this issue.',
  '',
  '## Watches',
  '',
  '| State | Waiting for | Latest | Unblocks |',
  '| --- | --- | --- | --- |',
  ...rows,
  '',
  '## Decisions',
  '',
  ...config.decisions.map(decision => `- **${decision.id}** (${decision.title}): **${decision.state}**. ${decision.note}`),
  '',
  '## Asks',
  '',
  '| Ask | Owner | Blocks | Until then |',
  '| --- | --- | --- | --- |',
  ...config.asks.map(ask => `| ${ask.ask} | [${ask.owner}](https://github.com/${ask.owner}) | ${ask.blocks} | ${ask.fallback} |`),
  '',
  `<!-- ready: ${ready.join(',')} -->`,
].join('\n')

process.stdout.write(`${body}\n`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${ready.join(',')}\n`)
