import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readCatalogSummary } from '../../src/devtools/catalog'

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-devtools-catalog-'))
  mkdirSync(join(rootDir, 'backend'))
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

describe('readCatalogSummary', () => {
  it('lists the declared keys and the environments billing sync has written', async () => {
    writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), `export default {
  meters: { credits: {} },
  plans: { pro: { name: 'Pro' } },
  packs: { credits500: { name: '500 credits' } },
  features: { priority_support: { description: 'Priority support' } },
}
`)
    writeFileSync(join(rootDir, 'backend/billing.generated.ts'), `export const catalog = { sandbox: { plans: { pro: 'prod_1' } }, production: {} }\n`)

    expect(await readCatalogSummary(rootDir)).toEqual({
      status: 'ok',
      meters: ['credits'],
      plans: ['pro'],
      packs: ['credits500'],
      features: ['priority_support'],
      synced: ['sandbox'],
    })
  })

  it('reads a file it read before afresh', async () => {
    const path = join(rootDir, 'backend/billing.catalog.ts')
    writeFileSync(path, 'export default { plans: { pro: {} } }\n')
    expect((await readCatalogSummary(rootDir)).plans).toEqual(['pro'])
    writeFileSync(path, 'export default { plans: { pro: {}, team: {} } }\n')
    expect((await readCatalogSummary(rootDir)).plans).toEqual(['pro', 'team'])
  })

  it('imports an unchanged file once, however often the panel asks', async () => {
    const path = join(rootDir, 'backend/billing.catalog.ts')
    const counter = '__nuxtBackendCatalogLoads'
    writeFileSync(path, `globalThis.${counter} = (globalThis.${counter} ?? 0) + 1\nexport default { plans: { pro: {} } }\n`)
    const loads = () => (globalThis as Record<string, unknown>)[counter]
    await readCatalogSummary(rootDir)
    await readCatalogSummary(rootDir)
    await readCatalogSummary(rootDir)
    expect(loads()).toBe(1)
    Reflect.deleteProperty(globalThis, counter)
  })

  it('says when there is no catalog, or when it does not load', async () => {
    expect(await readCatalogSummary(rootDir)).toMatchObject({ status: 'missing', plans: [] })
    writeFileSync(join(rootDir, 'backend/billing.catalog.ts'), 'throw new Error(\'broken catalog\')\n')
    expect(await readCatalogSummary(rootDir)).toMatchObject({ status: 'error', error: 'broken catalog' })
  })
})
