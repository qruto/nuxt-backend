import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// A module-scope `defineComponent(...)` is a call, and a bundler keeps every
// call it cannot prove free of side effects — so an app that renders none of
// these components would still ship them. `/* @__PURE__ */` is that proof
// (package.json `sideEffects` covers whole files, not calls inside them).

const dir = fileURLToPath(new URL('../../src/runtime/vue/components', import.meta.url))
const files = readdirSync(dir).filter(file => file.endsWith('.ts'))

describe('the packaged components', () => {
  it('finds them', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files)('%s marks its module-scope defineComponent as pure', (file) => {
    const source = readFileSync(join(dir, file), 'utf8')
    for (const [line] of source.matchAll(/^export const \w+ = .*defineComponent\(/gm)) {
      expect(line, `${file}: ${line}`).toContain('/* @__PURE__ */ defineComponent(')
    }
  })
})
