import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOG_CODES } from '../../src/convex/log'

// What the package writes to a deployment's logs, held to two rules: every
// line goes through logBackend() with a registered code, and Convex keeps
// logs, so no message carries an address, a name, a subject or a credential
// (the opt-in OTP echo for local development is the one exception).

const root = fileURLToPath(new URL('../..', import.meta.url))
const convexDir = join(root, 'src/convex')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return entry === '_generated' ? [] : sources(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

const files = sources(convexDir).map(path => ({ path: relative(root, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }))

/** Every `logBackend(...)` call: its code and the source of its message argument. */
function calls() {
  const found: { file: string, code: string, message: string }[] = []
  for (const { path, text } of files) {
    let index = text.indexOf('logBackend(')
    while (index >= 0) {
      let depth = 0
      let end = index + 'logBackend'.length
      for (; end < text.length; end++) {
        if (text[end] === '(') depth++
        if (text[end] === ')' && --depth === 0) break
      }
      const args = text.slice(index + 'logBackend('.length, end)
      const head = args.match(/^\s*'(?:info|warn|error)',\s*'([\w.]+)',/)
      // The message and the error argument after it: only `${…}` matters below.
      if (path !== 'src/convex/log.ts') found.push({ file: path, code: head?.[1] ?? '', message: head ? args.slice(head[0].length) : args })
      index = text.indexOf('logBackend(', end)
    }
  }
  return found
}

const PERSONAL = /\$\{[^}]*\b(?:email|emails|to|name|subject|otp|code|address|recipient|user)\b[^}]*\}/

describe('the deployment log', () => {
  it('is written through logBackend only', () => {
    const raw = files.filter(({ path, text }) => path !== 'src/convex/log.ts' && /\bconsole\.(?:log|info|warn|error|debug)\(/.test(text)).map(({ path }) => path)
    expect(raw).toEqual([])
  })

  it('finds the calls', () => {
    expect(calls().length).toBeGreaterThan(10)
  })

  it.each(calls().map(call => [`${call.file} ${call.code}`, call] as const))('%s uses a registered code', (_label, call) => {
    expect(Object.keys(LOG_CODES)).toContain(call.code)
  })

  it.each(calls().filter(call => call.code !== 'auth.otp_echo').map(call => [`${call.file} ${call.code}`, call] as const))('%s carries no personal data', (_label, call) => {
    expect(call.message).not.toMatch(PERSONAL)
  })

  it.each(Object.keys(LOG_CODES))('%s is used and explained in Troubleshooting', (code) => {
    expect(calls().some(call => call.code === code), 'used').toBe(true)
    expect(readFileSync(join(root, 'website/content/docs/05.ship/5.operate/5.troubleshooting.md'), 'utf8')).toContain(`\`${code}\``)
  })
})
