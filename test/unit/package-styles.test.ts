import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { packageStylesheets, styledCapabilities } from '../../src/nuxt/styles'

// The package's stylesheets as the module adds them: the tokens first, then
// the shared rules, then each component's and part's, only for the
// capabilities the app uses.

const componentsDir = fileURLToPath(new URL('../../src/runtime/vue/components', import.meta.url))
let root: string | undefined
afterEach(() => root && rmSync(root, { recursive: true, force: true }))

describe('the package stylesheets', () => {
  it('load the tokens first, then the shared rules', () => {
    const files = packageStylesheets(componentsDir, new Set(['auth'])).map(style => style.file)
    expect(files.slice(0, 2)).toEqual(['tokens.css', 'shared.css'])
    expect(files).toContain('auth/AuthForm.css')
  })

  it('leave billing\'s out without a billing catalog, and name each by the component it styles', () => {
    const auth = packageStylesheets(componentsDir, new Set(['auth']))
    expect(auth.some(style => style.file.startsWith('billing/'))).toBe(false)
    const both = packageStylesheets(componentsDir, new Set(['auth', 'billing']))
    expect(both).toContainEqual({ file: 'billing/PricingPlanCard.css', name: 'PricingPlanCard' })
    // An internal piece's stylesheet goes with its component, named by none.
    expect(both).toContainEqual({ file: 'shell/NoticeGift.css', name: undefined })
  })

  it('detect billing by the functions directory\'s billing catalog', () => {
    root = mkdtempSync(join(tmpdir(), 'nb-styles-'))
    expect([...styledCapabilities(root)]).toEqual(['auth'])
    mkdirSync(join(root, 'backend'))
    writeFileSync(join(root, 'backend/billing.ts'), '')
    expect([...styledCapabilities(root)]).toEqual(['auth', 'billing'])
  })
})
