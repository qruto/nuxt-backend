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
/** An argument named like an address: `to`, or any name ending in one (`toAddress`, `ownerEmail`, `recipients`). */
const ADDRESS = /\b(?:to|\w*(?:email|address|recipients?|cc|bcc|replyto))\s*:/i
const PRIVILEGED = /^(?:internal\w+|admin\.\w+)$/

interface Declared { id: string, builder: string, args: string, body: string }

function declarations(templates: Record<string, string>): Declared[] {
  return Object.entries(templates).flatMap(([file, source]) =>
    [...source.replace(/^\/\/ ?/gm, '').matchAll(DECLARATION)].map(([, name, builder, body]) => ({
      id: `${file}:${name}`,
      builder: builder!,
      args: ARGS.exec(body!)?.[1] ?? '',
      body: body!,
    })))
}

/**
 * Whatever the argument is called: a send whose `to` is an argument, read
 * as `args.<name>`, `args['<name>']` or destructured.
 */
function sendsToAnArgument(fn: Declared): boolean {
  if (!/\bsend\w*\s*\(/.test(fn.body)) return false
  const names = [...fn.args.matchAll(/(\w+)\s*:/g)].map(match => match[1]!)
  return [...fn.body.matchAll(/\bto\s*:\s*(args\[|[\w.]+)/g)].some(([, value]) => /^args[.[]/.test(value!) || names.includes(value!))
}

/** The functions a browser can call that would take their recipient from it. */
function relays(templates: Record<string, string>): string[] {
  return declarations(templates)
    .filter(fn => !PRIVILEGED.test(fn.builder))
    .filter(fn => ADDRESS.test(fn.args) || sendsToAnArgument(fn))
    .map(fn => fn.id)
}

describe('the relay probe', () => {
  const relay = (args: string, handler: string) => ({ 'x.ts': `export const relay = action({\n  args: { ${args} },\n  handler: async (ctx, args) => {\n    ${handler}\n  },\n})` })

  it('catches a recipient argument under any address-like name', () => {
    expect(relays(relay('toAddress: v.string()', ''))).toEqual(['x.ts:relay'])
    expect(relays(relay('ownerEmail: v.string()', ''))).toEqual(['x.ts:relay'])
  })

  it('catches a send whose recipient is an argument, whatever it is called', () => {
    expect(relays(relay('target: v.string()', 'await email.send(ctx, { to: args.target, subject: \'Hi\' })'))).toEqual(['x.ts:relay'])
  })

  it('catches a recipient argument read with brackets', () => {
    expect(relays(relay('target: v.string()', 'await email.send(ctx, { to: args[\'target\'], subject: \'Hi\' })'))).toEqual(['x.ts:relay'])
    expect(relays(relay('target: v.string()', 'await email.send(ctx, { to: args["target"], subject: \'Hi\' })'))).toEqual(['x.ts:relay'])
  })

  it('lets a public function send to an address it looked up itself', () => {
    expect(relays(relay('message: v.string()', 'await email.send(ctx, { to: user.email, subject: args.message })'))).toEqual([])
  })
})

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
    expect(relays(templates)).toEqual([])
  })

  it('keeps send internal and puts the any-address send behind the admin role', () => {
    expect(declared.find(fn => fn.id === 'email.ts:send')?.builder).toBe('internalAction')
    expect(declared.find(fn => fn.id === 'email.ts:sendAsAdmin')?.builder).toBe('admin.action')
  })
})
