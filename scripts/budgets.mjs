#!/usr/bin/env node
/**
 * The size budgets, kept in budgets.json: for each budget, what the package
 * measured when it was last set and the ceiling a check enforces, 5% above.
 * check:tarball reads the `tarball` budget, so a stray build output or a
 * dependency bundled by mistake fails there instead of shipping.
 *
 * Moving a budget is a reviewed diff, never a hand-edited constant: after a
 * change that grows or shrinks the package on purpose,
 *
 *   pnpm pack && pnpm budgets:update
 *
 * measures the tarball beside package.json and rewrites budgets.json. Say in
 * the change why it grew.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BUDGETS = join(root, 'budgets.json')
/** How far above the last measurement a ceiling sits. */
const HEADROOM = 1.05

/** budgets.json, parsed. */
export function readBudgets() {
  return JSON.parse(readFileSync(BUDGETS, 'utf8'))
}

/** Bytes and files under a directory, every regular file counted. */
export function measure(dir) {
  let bytes = 0
  let files = 0
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    files += 1
    bytes += statSync(join(entry.parentPath, entry.name)).size
  }
  return { bytes, files }
}

/** The ceiling for a measurement: bytes rounded up to 10 kB, files up to a whole file. */
export function ceilingFor({ bytes, files }) {
  return {
    bytes: Math.ceil((bytes * HEADROOM) / 10_000) * 10_000,
    files: Math.ceil(files * HEADROOM),
  }
}

/** One message per limit a measurement goes over; empty when it fits the ceiling. */
export function overBudget(measured, ceiling) {
  const over = []
  if (measured.bytes > ceiling.bytes) over.push(`${measured.bytes.toLocaleString('en')} bytes, ceiling ${ceiling.bytes.toLocaleString('en')}`)
  if (measured.files > ceiling.files) over.push(`${measured.files} files, ceiling ${ceiling.files}`)
  return over
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tarballs = readdirSync(root).filter(file => /^nuxt-backend-.*\.tgz$/.test(file))
  if (tarballs.length !== 1) {
    console.error(`budgets: expected one nuxt-backend-*.tgz beside package.json, found ${tarballs.length}. Run \`pnpm pack\` first, and delete stale ones.`)
    process.exit(1)
  }
  const dir = mkdtempSync(join(tmpdir(), 'nuxt-backend-budgets-'))
  try {
    execFileSync('tar', ['-xzf', join(root, tarballs[0]), '-C', dir])
    const measured = measure(join(dir, 'package'))
    const budgets = readBudgets()
    budgets.tarball = { measured, ceiling: ceilingFor(measured) }
    writeFileSync(BUDGETS, `${JSON.stringify(budgets, null, 2)}\n`)
    console.log(`budgets: tarball ${measured.bytes.toLocaleString('en')} bytes in ${measured.files} files, ceiling ${budgets.tarball.ceiling.bytes.toLocaleString('en')} / ${budgets.tarball.ceiling.files}`)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
