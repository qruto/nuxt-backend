import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as magicast from 'magicast'
import { brandOfAppConfig, brandSourceDirs, readAppBrand, renderBrandFile } from '../../src/brand-file'
import { brandFileFinding, syncBrandFile } from '../../src/brand-sync'

// The one brand: app.config's `backend.brand` (name, logo, postal address)
// carried into the functions directory as brand.generated.ts, which the
// scaffold's email.ts passes to setupEmail.

describe('reading the brand from app.config', () => {
  it('reads the literals of defineAppConfig, and leaves an expression out', () => {
    const text = `export default defineAppConfig({
  backend: {
    brand: { name: 'Panels', logo: \`/logo.png\`, address: process.env.ADDRESS },
    labels: {},
  },
})`
    expect(brandOfAppConfig(magicast, text)).toEqual({ name: 'Panels', logo: '/logo.png' })
  })

  it('reads a plain exported object, and nothing from a file that does not parse or sets no brand', () => {
    expect(brandOfAppConfig(magicast, `export default { backend: { brand: { 'address': 'Panels Ltd, 1 Market St' } } }`)).toEqual({ address: 'Panels Ltd, 1 Market St' })
    expect(brandOfAppConfig(magicast, 'export default defineAppConfig({ ui: {} })')).toEqual({})
    expect(brandOfAppConfig(magicast, 'export default {')).toEqual({})
  })

  it('lets the app\'s own field win over a layer\'s, field by field', async () => {
    const root = mkdtempSync(join(tmpdir(), 'brand-layers-'))
    try {
      mkdirSync(join(root, 'app', 'app'), { recursive: true })
      mkdirSync(join(root, 'layer'))
      writeFileSync(join(root, 'app', 'app', 'app.config.ts'), `export default defineAppConfig({ backend: { brand: { name: 'Panels' } } })`)
      writeFileSync(join(root, 'layer', 'app.config.ts'), `export default defineAppConfig({ backend: { brand: { name: 'Layer', address: '1 Layer Way' } } })`)
      const dirs = brandSourceDirs({ rootDir: join(root, 'app'), _layers: [{ cwd: join(root, 'app'), config: { rootDir: join(root, 'app'), srcDir: join(root, 'app', 'app') } }, { cwd: join(root, 'layer'), config: { rootDir: join(root, 'layer') } }] })
      expect(await readAppBrand(dirs)).toEqual({ name: 'Panels', address: '1 Layer Way' })
    }
    finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('the generated file', () => {
  let rootDir: string
  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'brand-file-'))
  })
  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('renders each field set, quoted for the app\'s linter, and an empty brand as an empty object', () => {
    expect(renderBrandFile({ name: 'Kai\'s strips', address: '1 Market St' })).toContain(`  name: 'Kai\\'s strips',\n  address: '1 Market St',\n}`)
    expect(renderBrandFile({})).toContain('export const brand: { name?: string, logo?: string, address?: string } = {}\n')
  })

  it('is written when it says something else, and doctor names a missing or stale one', () => {
    expect(syncBrandFile(rootDir, {})).toBe('no-functions-dir')
    expect(brandFileFinding(rootDir, {})).toEqual([])
    mkdirSync(join(rootDir, 'backend'))
    expect(brandFileFinding(rootDir, { name: 'Panels' })).toMatchObject([{ id: 'brand-file', status: 'warn', message: expect.stringContaining('backend/brand.generated.ts is missing') }])
    expect(syncBrandFile(rootDir, { name: 'Panels' })).toBe('written')
    expect(syncBrandFile(rootDir, { name: 'Panels' })).toBe('unchanged')
    expect(readFileSync(join(rootDir, 'backend', 'brand.generated.ts'), 'utf-8')).toContain('name: \'Panels\'')
    expect(brandFileFinding(rootDir, { name: 'Panels' })).toMatchObject([{ id: 'brand-file', status: 'pass' }])
    expect(brandFileFinding(rootDir, { name: 'Strips' })).toMatchObject([{ id: 'brand-file', status: 'warn', fixHint: expect.stringContaining('doctor --fix') }])
  })
})
