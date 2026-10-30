import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addEmailTemplate, closeMatches, eject, EjectError, ejectables, ejectedFiles, rewriteImports } from '../../src/cli/eject'
import { ejectedChanges, formatEjected } from '../../src/cli/upgrade/ejected'
import { packageVersion } from '../../src/dirs'
import { UI_PARTS } from '../../src/ui/registry'

// `nuxt-backend eject`: the packaged source copied into an app, stamped
// with the version, and `upgrade`'s view of it later.

let root: string
const version = packageVersion()
const read = (file: string) => readFileSync(join(root, file), 'utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nb-eject-'))
  mkdirSync(join(root, 'app'), { recursive: true })
  mkdirSync(join(root, 'backend'), { recursive: true })
  writeFileSync(join(root, 'backend/email.ts'), 'import { setupEmail } from \'nuxt-backend/email\'\nimport { components } from \'./_generated/api\'\n\nexport const email = setupEmail(components)\n')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('eject', () => {
  it('lists every part, component, page and email', () => {
    const targets = ejectables(root).map(entry => entry.target)
    for (const part of UI_PARTS) expect(targets).toContain(part.name)
    expect(targets).toEqual(expect.arrayContaining(['AuthForm', 'PricingTable', 'page:pricing', 'page:login', 'email:invite', 'email:otp']))
  })

  it('copies a part and its CSS into app/components, stamped, its imports through the package\'s aliases', () => {
    const report = eject(root, 'PricingPlanCard')
    expect(report.written).toEqual(['app/components/PricingPlanCard.vue', 'app/components/PricingPlanCard.css'])
    const copy = read('app/components/PricingPlanCard.vue')
    expect(copy.split('\n')[0]).toBe(`<!-- nuxt-backend eject: PricingPlanCard@${version} -->`)
    expect(copy).toContain('from \'#backend/parts\'')
    expect(copy).toContain('from \'#backend/a11y\'')
    expect(copy).toContain('from \'#backend/runtime/components/billing/pricing-table\'')
    expect(copy).not.toMatch(/from '\.{1,2}\//)
    expect(copy.trimEnd().endsWith('<style src="./PricingPlanCard.css"></style>')).toBe(true)
    const css = read('app/components/PricingPlanCard.css')
    expect(css.split('\n')[0]).toBe(`/* nuxt-backend eject: PricingPlanCard@${version} */`)
    expect(css).toContain('@layer nuxt-backend {')
  })

  it('copies a part with no stylesheet of its own as its .vue alone', () => {
    expect(eject(root, 'AuthFormCode').written).toEqual(['app/components/AuthFormCode.vue'])
  })

  it('copies a page to its path with the guard the module puts on it', () => {
    expect(eject(root, 'page:settings').written).toEqual(['app/pages/settings.vue'])
    expect(read('app/pages/settings.vue')).toContain('definePageMeta({ auth: true })\ndefineOptions(')
    eject(root, 'page:admin')
    expect(read('app/pages/admin.vue')).toContain('definePageMeta({ auth: { role: \'admin\', hidden: true } })')
    eject(root, 'page:login')
    expect(read('app/pages/login.vue')).not.toContain('definePageMeta')
    expect(read('app/pages/login.vue')).toContain('from \'#backend/runtime/components/shell/PageFrame.vue\'')
  })

  it('copies an email\'s own source as an override and adds it to setupEmail\'s templates', () => {
    expect(eject(root, 'email:invite').written).toEqual(['backend/emails/invite.ts', 'backend/email.ts'])
    expect(read('backend/emails/invite.ts').split('\n')[0]).toBe(`// nuxt-backend eject: email:invite@${version}`)
    // The blocks and the words as the package writes them, not a call back into the package.
    expect(read('backend/emails/invite.ts')).toContain('blocks: [{ paragraph: intro }, ...linkBlocks(link, t(\'email.invite.action\'), context)]')
    expect(read('backend/emails/invite.ts')).not.toContain('byDefault')
    expect(read('backend/email.ts')).toContain('import { invite } from \'./emails/invite\'')
    expect(read('backend/email.ts')).toContain('setupEmail(components, { templates: { invite } })')
    eject(root, 'email:emailChanged')
    expect(read('backend/email.ts')).toContain('setupEmail(components, { templates: { emailChanged, invite } })')
  })

  it('copies every email with imports an app resolves, each a name nuxt-backend/email exports', () => {
    const entry = readFileSync(join(import.meta.dirname, '../../src/convex/integrations/email.ts'), 'utf8')
    const exported = new Set([...entry.matchAll(/export (?:type )?\{([^}]+)\}/g)].flatMap(([, names]) => names!.split(',').map(name => name.trim()).filter(Boolean)))
    for (const { target } of ejectables(root).filter(entry => entry.kind === 'email')) {
      const [written] = eject(root, target).written
      const copy = read(written!)
      const imports = [...copy.matchAll(/^import (?:type )?\{([^}]+)\} from '([^']+)'/gm)]
      expect(imports.length, target).toBeGreaterThan(0)
      for (const [, names, from] of imports) {
        expect(from, target).toBe('nuxt-backend/email')
        for (const name of names!.split(',').map(part => part.trim())) expect(exported, `${target}: ${name}`).toContain(name)
      }
      const name = target.slice('email:'.length)
      expect(copy, target).toMatch(new RegExp(`^export function ${name}\\(`, 'm'))
    }
  })

  it('writes the invite email the Templates page shows', () => {
    const page = readFileSync(join(import.meta.dirname, '../../website/content/docs/04.build/3.email/2.templates/index.md'), 'utf8')
    const shown = page.match(/```ts \[backend\/emails\/invite\.ts\]\n([\s\S]*?)```/)![1]!
    eject(root, 'email:invite')
    expect(read('backend/emails/invite.ts').replace(`@${version}`, '@0.2.0')).toBe(shown)
  })

  it('stops on a file in the way, unless forced', () => {
    eject(root, 'AuthFormCode')
    expect(() => eject(root, 'AuthFormCode')).toThrow(/already exists: pass --force/)
    expect(() => eject(root, 'AuthFormCode', { force: true })).not.toThrow()
  })

  it('names the close matches of an unknown name, and writes nothing', () => {
    expect(() => eject(root, 'PricingCard')).toThrow(EjectError)
    expect(() => eject(root, 'PricingCard')).toThrow(/`PricingPlanCard`/)
    expect(closeMatches('pricing', ['PricingTable', 'AuthForm', 'page:pricing'])).toEqual(['page:pricing', 'PricingTable'])
  })
})

describe('the helpers eject is built on', () => {
  it('rewrites relative imports onto the package\'s aliases', () => {
    const text = 'import a from \'../../a11y\'\nimport b from \'../../../../convex/locale.js\'\nimport c from \'./view\''
    expect(rewriteImports(text, 'src/runtime/vue/components/account/X.vue')).toBe('import a from \'#backend/a11y\'\nimport b from \'#backend/runtime/../../convex/locale.js\'\nimport c from \'#backend/runtime/components/account/view\'')
  })

  it('adds a template to every shape of setupEmail it can edit, and says so when it cannot', () => {
    expect(addEmailTemplate('import x from \'y\'\nconst email = setupEmail(components, { events: {} })\n', 'otp')).toContain('setupEmail(components, { templates: { otp }, events: {} })')
    expect(addEmailTemplate('import x from \'y\'\nconst email = setupEmail(components, { templates: { invite } })\n', 'otp')).toContain('templates: { otp, invite }')
    expect(addEmailTemplate('const email = setupEmail(components, options)\n', 'otp')).toBe(false)
  })
})

describe('upgrade and the ejected files', () => {
  it('finds each ejected file by its stamp', () => {
    eject(root, 'PricingPlanCard')
    eject(root, 'email:invite')
    expect(ejectedFiles(root).map(file => file.target).sort()).toEqual(['PricingPlanCard', 'PricingPlanCard', 'email:invite'])
  })

  it('counts and diffs the upstream changes since the stamp\'s version, and reads only', async () => {
    eject(root, 'PricingPlanCard')
    const copy = read('app/components/PricingPlanCard.vue').replace(`@${version} -->`, '@0.0.1 -->')
    writeFileSync(join(root, 'app/components/PricingPlanCard.vue'), copy)
    const source = async (at: string, path: string) => {
      const current = readFileSync(join(import.meta.dirname, '../..', path), 'utf8')
      return at === version ? current : current.replace('data-pricing="plan"', 'data-pricing="card"')
    }
    const changes = await ejectedChanges(root, { source, diff: true })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ target: 'PricingPlanCard', file: 'app/components/PricingPlanCard.vue', from: '0.0.1', to: version, changes: 1 })
    expect(changes[0]!.diff).toContain('-    data-pricing="card"')
    expect(changes[0]!.diff).toContain('+    data-pricing="plan"')
    expect(read('app/components/PricingPlanCard.vue')).toBe(copy)
    expect(formatEjected(changes)[1]).toMatch(/^ {2}PricingPlanCard\s+0\.0\.1 → \S+\s+1 upstream change$/)
  })

  it('says when a part the stamp names is no longer shipped', async () => {
    mkdirSync(join(root, 'app/components'), { recursive: true })
    writeFileSync(join(root, 'app/components/OldPart.vue'), '<!-- nuxt-backend eject: OldPart@0.0.1 -->\n<template><i /></template>\n')
    const [change] = await ejectedChanges(root, { source: async () => '' })
    expect(change).toMatchObject({ target: 'OldPart', removed: true, changes: null })
    expect(formatEjected([change!])[1]).toContain('no longer shipped')
  })
})
