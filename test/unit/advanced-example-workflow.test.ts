import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// examples/advanced hand-rolls its sign-up follow-up with `workflow.define`
// rather than `defineEmailSequence`. Users copy it, so it keeps the promise
// the packaged sequence makes: after the sleep it reads the account again,
// writes nobody once the account is gone, and writes the current address.
// The example is a standalone app whose dependencies and codegen are not
// installed here, so its module body runs with stand-ins for its imports.

type Definition = { handler: (step: unknown, args: { userId: string, email: string, name: string }) => Promise<void> }

function loadOnSignup(): Definition {
  const source = readFileSync(new URL('../../examples/advanced/backend/workflows.ts', import.meta.url), 'utf8')
  const imports = [...source.matchAll(/^import .* from '(.+)'$/gm)].map(([, from]) => from)
  expect(imports.sort()).toEqual(['./_generated/api', 'convex/values', 'nuxt-backend/workflows'])
  const body = ts.transpileModule(source.replace(/^import .*$/gm, ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: Record<string, unknown> = {}
  const stand = {
    setupWorkflows: () => ({ define: (definition: Definition) => definition }),
    v: { string: () => 'string' },
    components: { backend: { adapter: { findOne: 'backend:adapter.findOne' }, email: { send: 'backend:email.send' } } },
  }
  // The example's own module body, with its imports stood in.
  new Function('exports', ...Object.keys(stand), body)(exports, ...Object.values(stand))
  return exports.onSignup as Definition
}

/** A workflow step that records what it runs, with the account `findOne` finds. */
function stepWith(account: { email: string, name: string } | null) {
  return {
    sleep: vi.fn(async () => {}),
    runQuery: vi.fn(async () => account),
    runMutation: vi.fn(async () => null),
  }
}

const started = { userId: 'user_ada', email: 'ada@old.example', name: 'Ada' }

describe('the advanced example\'s onSignup', () => {
  it('reads the account after the sleep and writes its current address and name', async () => {
    const step = stepWith({ email: 'ada@new.example', name: 'Ada L.' })
    await loadOnSignup().handler(step, started)

    expect(step.sleep.mock.invocationCallOrder[0]).toBeLessThan(step.runQuery.mock.invocationCallOrder[0]!)
    expect(step.runQuery).toHaveBeenCalledWith('backend:adapter.findOne', { model: 'user', where: [{ field: '_id', value: 'user_ada' }] })
    expect(step.runMutation).toHaveBeenCalledWith('backend:email.send', expect.objectContaining({ to: 'ada@new.example', text: expect.stringContaining('Hi Ada L.,') }))
  })

  it('writes nobody once the account is gone', async () => {
    const step = stepWith(null)
    await loadOnSignup().handler(step, started)
    expect(step.runMutation).not.toHaveBeenCalled()
  })
})
