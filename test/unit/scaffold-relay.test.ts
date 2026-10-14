import { describe, expect, it } from 'vitest'
import { BACKEND_FILE_TEMPLATES, LOCAL_BACKEND_FILE_TEMPLATES } from '../../src/templates'

/**
 * No function a browser can call takes its recipient from the caller. A
 * public action that sends to an address the page chose is an open relay on
 * the app's verified domain for anyone who can sign in, so in the scaffold a
 * function with an address argument is `internal*` or built with `admin.*`.
 * Commented examples count: uncommenting one must not open a relay either.
 */

/** `export const name = builder({ ... args: { ... } })`, with the builder as written. */
const DECLARATION = /export const (\w+) = ([\w.]+(?:\([^)]*\))?(?:\.\w+)?)\(\{([\s\S]*?)\n\}\)/g
const ARGS = /args: \{([^}]*)\}/
const ADDRESS = /\b(?:to|email|recipient|recipients|recipientEmail|address|cc|bcc|replyTo)\s*:/
const PRIVILEGED = /^(?:internal\w+|admin\.\w+)$/

interface Declared { id: string, builder: string, args: string }

function declarations(templates: Record<string, string>): Declared[] {
  return Object.entries(templates).flatMap(([file, source]) =>
    [...source.replace(/^\/\/ ?/gm, '').matchAll(DECLARATION)].map(([, name, builder, body]) => ({
      id: `${file}:${name}`,
      builder: builder!,
      args: ARGS.exec(body!)?.[1] ?? '',
    })))
}

describe.each([
  ['default', BACKEND_FILE_TEMPLATES],
  ['local-install', LOCAL_BACKEND_FILE_TEMPLATES],
])('the %s scaffold', (_, templates) => {
  const declared = declarations(templates)
  const reachable = declared.filter(fn => !PRIVILEGED.test(fn.builder))

  it('declares public functions for the probe to check', () => {
    expect(reachable.map(fn => fn.id)).toEqual(expect.arrayContaining(['ai.ts:transform', 'aggregates.ts:countMessages', 'billing.ts:consumeCredit']))
  })

  it('takes no recipient from a public caller', () => {
    expect(reachable.filter(fn => ADDRESS.test(fn.args)).map(fn => fn.id)).toEqual([])
  })

  it('keeps send internal and puts the any-address send behind the admin role', () => {
    expect(declared.find(fn => fn.id === 'email.ts:send')?.builder).toBe('internalAction')
    expect(declared.find(fn => fn.id === 'email.ts:sendAsAdmin')?.builder).toBe('admin.action')
  })
})
