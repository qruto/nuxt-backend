import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OUTPUT_FILE, exportedNames, generate } from '../../scripts/generate-templates.mjs'

describe('src/templates.generated.ts', () => {
  it('is up to date with the component sources (run `pnpm templates:generate`)', () => {
    const committed = readFileSync(fileURLToPath(new URL(`../../${OUTPUT_FILE}`, import.meta.url)), 'utf-8')
    expect(committed).toBe(generate())
  })

  it('collects top-level value exports only, sorted', () => {
    expect(exportedNames('module.ts', `
      export const b = 1
      export const { c, d: e, ...rest } = source
      export function a() {}
      export class K {}
      export type T = string
      export interface I { x: number }
      export { f, type G }
      export default 1
      const hidden = 1
    `)).toEqual(['K', 'a', 'b', 'c', 'e', 'f', 'rest'])
  })
})
