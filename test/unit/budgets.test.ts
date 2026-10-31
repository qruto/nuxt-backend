import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { ceilingFor, measureClientEntry, measureInstalled, overBudget, readBudgets } from '../../scripts/budgets.mjs'

// budgets.json moves only through `pnpm budgets:update`, so every ceiling is
// the one its measurement implies: a hand-raised ceiling fails here.
describe('budgets.json', () => {
  it('holds the tarball, install and starter budgets', () => {
    expect(Object.keys(readBudgets()).sort()).toEqual(['install', 'starter', 'tarball'])
  })

  it.each(Object.entries(readBudgets()))('%s sits 5%% above its measurement', (_name, budget) => {
    expect(budget.ceiling).toEqual(ceilingFor(budget.measured))
  })

  it('rounds a ceiling up to three significant figures', () => {
    expect(ceilingFor({ bytes: 3_762_654, files: 607 })).toEqual({ bytes: 3_960_000, files: 638 })
    // The starter's entry counts bytes only.
    expect(ceilingFor({ bytes: 104_833 })).toEqual({ bytes: 111_000 })
  })

  it('reports each limit a measurement goes over', () => {
    const ceiling = { bytes: 1000, files: 10 }
    expect(overBudget({ bytes: 1000, files: 10 }, ceiling)).toEqual([])
    expect(overBudget({ bytes: 1001, files: 11 }, ceiling)).toEqual(['1,001 bytes, ceiling 1,000', '11 files, ceiling 10'])
    expect(overBudget({ bytes: 1000 }, { bytes: 1000 })).toEqual([])
  })
})

describe('the measurements', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const write = (file: string, contents: string) => {
    mkdirSync(join(dir, file, '..'), { recursive: true })
    writeFileSync(join(dir, file), contents)
  }

  it('counts every installed package, and none of the installer\'s bookkeeping', () => {
    dir = mkdtempSync(join(tmpdir(), 'budgets-install-'))
    write('node_modules/nuxt-backend/package.json', '12345')
    write('node_modules/@scope/dep/index.js', '123')
    write('node_modules/.package-lock.json', 'not a package')
    write('node_modules/.bin/tool', 'a link in a real install')
    symlinkSync(join(dir, 'node_modules/@scope/dep/index.js'), join(dir, 'node_modules/@scope/dep/linked.js'))
    expect(measureInstalled(join(dir, 'node_modules'))).toEqual({ bytes: 8, files: 2 })
  })

  it('gzips the client entry and the chunks it imports statically, never one it imports on demand', async () => {
    dir = mkdtempSync(join(tmpdir(), 'budgets-entry-'))
    const chunks = { 'entry.js': 'import "./shared.js"; import("./page.js")', 'shared.js': 'export const shared = 1', 'page.js': 'export default "a page"' }
    for (const [file, code] of Object.entries(chunks)) write(`.output/public/_nuxt/${file}`, code)
    write('.nuxt/dist/server/client.manifest.mjs', `export default ${JSON.stringify({
      'entry.js': { file: 'entry.js', isEntry: true, imports: ['_shared.js'], dynamicImports: ['page.vue'] },
      '_shared.js': { file: 'shared.js', imports: ['entry.js'] },
      'page.vue': { file: 'page.js', isDynamicEntry: true, imports: ['_shared.js'] },
    })}`)
    const gzipped = (code: string) => gzipSync(code).length
    expect(await measureClientEntry(dir)).toEqual({ bytes: gzipped(chunks['entry.js']) + gzipped(chunks['shared.js']) })
  })

  it('refuses an app that was not built', async () => {
    dir = mkdtempSync(join(tmpdir(), 'budgets-unbuilt-'))
    await expect(measureClientEntry(dir)).rejects.toThrow(/no client manifest/)
  })
})
