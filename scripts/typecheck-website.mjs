#!/usr/bin/env node
/**
 * Typecheck the website, ignoring diagnostics from upstream layer sources
 * (node_modules/docus ships .ts/.vue app code that typechecks against ITS
 * peer set — e.g. `$config.public.i18n` is only typed when @nuxtjs/i18n's
 * augmentation resolves, which shifts with pnpm peer hashing and is not ours
 * to fix). Diagnostics in our own files still fail the check.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const websiteDir = join(fileURLToPath(new URL('..', import.meta.url)), 'website')

let output
try {
  output = execFileSync('npx', ['vue-tsc', '--noEmit'], { cwd: websiteDir, encoding: 'utf-8' })
}
catch (error) {
  output = `${error.stdout ?? ''}${error.stderr ?? ''}`
}

const errors = output.split('\n').filter(line => line.includes('error TS'))
const ours = errors.filter(line => !line.includes('node_modules/'))
const upstream = errors.length - ours.length

if (upstream > 0) {
  console.warn(`[typecheck-website] Ignored ${upstream} diagnostic(s) from upstream layer sources in node_modules.`)
}
if (ours.length > 0) {
  console.error(ours.join('\n'))
  process.exit(1)
}
console.log('[typecheck-website] OK')
