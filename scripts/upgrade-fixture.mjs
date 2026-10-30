#!/usr/bin/env node
/**
 * Writes the upgrade fixture: templates/starter as a git ref has it, the
 * files a build needs (backend/, app/ and the app's config), as one JSON
 * file at test/fixtures/upgrade/<label>/starter.json. The upgrade tests
 * (test/unit/upgrade-fixture.test.ts, test/e2e/upgrade.test.ts) write it out
 * to a temporary directory, run `doctor --fix`'s repairs on it and check
 * what they add (ADDED_SINCE_BASE in test/helpers/upgrade-fixture.ts).
 *
 * One file rather than a tree, so the snapshot is never linted, typechecked
 * or scanned as code of this repository.
 *
 * Refresh it at each release, from the starter the last published version
 * shipped (its release tag), and empty ADDED_SINCE_BASE then:
 *
 *   node scripts/upgrade-fixture.mjs <ref> <label>
 *   node scripts/upgrade-fixture.mjs v0.2.0 0.2.0
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const [ref, label] = process.argv.slice(2)
if (!ref || !label || !/^[\w.-]+$/.test(label)) {
  console.error('usage: node scripts/upgrade-fixture.mjs <git ref> <label>')
  process.exit(1)
}

const PREFIX = 'templates/starter/'
/** What a typecheck and a build of the starter need; the rest (README, agent files, dotfiles) is left out. */
const KEEP = /^(?:backend\/.+|app\/.+|nuxt\.config\.ts|package\.json|tsconfig\.json|convex\.json)$/

const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
const commit = git(['rev-parse', `${ref}^{commit}`]).trim()
const files = Object.fromEntries(git(['ls-tree', '-r', '--name-only', commit, PREFIX]).split('\n')
  .filter(path => path.startsWith(PREFIX) && KEEP.test(path.slice(PREFIX.length)))
  .map(path => [path.slice(PREFIX.length), git(['show', `${commit}:${path}`])]))

const dir = join(root, 'test/fixtures/upgrade', label)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'starter.json'), `${JSON.stringify({ ref, commit, files }, null, 2)}\n`)
console.log(`upgrade-fixture: ${Object.keys(files).length} files of ${ref} (${commit.slice(0, 7)}) → test/fixtures/upgrade/${label}/starter.json`)
