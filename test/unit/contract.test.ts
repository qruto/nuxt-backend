import { describe, expect, it } from 'vitest'
import { missingContractFunctions, REQUIRED_FUNCTION_EXPORTS, WORKSPACE_FUNCTION_EXPORTS } from '../../src/contract'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'

/**
 * The contract map doctor verifies against the deployment must match what the
 * scaffold actually exports — otherwise doctor would fail fresh scaffolds (a
 * name missing from the template) or miss real breakage (a template export
 * missing from the map).
 */
describe('REQUIRED_FUNCTION_EXPORTS ↔ scaffold templates', () => {
  it.each(Object.entries(REQUIRED_FUNCTION_EXPORTS))('%s template exports every contract name', (module, names) => {
    const template = BACKEND_FILE_TEMPLATES[`${module}.ts`]
    expect(template, `template ${module}.ts exists`).toBeDefined()
    for (const name of names) {
      // Exports are either destructured re-exports (`  name,`) or direct
      // `export const name` declarations.
      const asDestructure = new RegExp(`^\\s+${name},?$`, 'm')
      const asDeclaration = new RegExp(`export const \\{?[^}]*\\b${name}\\b`)
      expect(
        asDestructure.test(template!) || asDeclaration.test(template!),
        `${module}.ts exports ${name}`,
      ).toBe(true)
    }
  })
})

describe('missingContractFunctions', () => {
  const everything = new Set(Object.entries(REQUIRED_FUNCTION_EXPORTS).flatMap(([module, names]) => names.map(name => `${module}:${name}`)))

  it('reports nothing for a full deployment', () => {
    expect(missingContractFunctions(everything, { workspaces: true })).toEqual([])
  })

  it('names every missing function with its module', () => {
    const deployed = new Set([...everything].filter(id => id !== 'billing:getCredits' && id !== 'email:getEmailStatus'))
    expect(missingContractFunctions(deployed, { workspaces: true })).toEqual(['billing:getCredits', 'email:getEmailStatus'])
  })

  it('skips the workspace functions while workspaces are off, and only then', () => {
    const deployed = new Set([...everything].filter(id => !WORKSPACE_FUNCTION_EXPORTS.some(name => id === `auth:${name}`)))
    expect(missingContractFunctions(deployed, { workspaces: false })).toEqual([])
    expect(missingContractFunctions(deployed, { workspaces: true })).toEqual(WORKSPACE_FUNCTION_EXPORTS.map(name => `auth:${name}`))
  })
})
