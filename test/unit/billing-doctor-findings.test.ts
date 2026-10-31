import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectBillingFindings, productionCatalogFindings, providerSdkFindings, type BillingOrganizationState } from '../../src/cli/billing/doctor'
import type { BillingCatalog } from '../../src/convex/catalog'

// Three of `doctor`'s billing findings, from what a person reads in them:
// the gift pass products the provider holds, the provider SDK the billing
// component resolves in the app's install, and whether production has an id
// for everything the catalog sells. The install and the id map are real
// files in a throwaway project.

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'billing-doctor-findings-')))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** An organization in good order, holding the given products. */
function organization(productByKey: BillingOrganizationState['productByKey']): BillingOrganizationState {
  return {
    slug: 'acme',
    allowMultipleSubscriptions: false,
    prorationBehavior: 'invoice',
    benefitRevocationGracePeriod: 0,
    preventTrialAbuse: true,
    customerEmailsOff: [],
    portal: { updatePlan: true, pause: false },
    benefitTypeByKey: {},
    memberModel: true,
    membersReadable: true,
    productByKey,
  }
}

const giftCatalog = { plans: { pro: { name: 'Pro', prices: { month: 900 }, gift: { months: [12, 3] } } } } as unknown as BillingCatalog
const pass = { visibility: 'private', prices: { usd: 0 }, benefits: 2 }
const purchase = { visibility: 'private', prices: { usd: 2700 }, benefits: 0 }
const passFinding = (catalog: BillingCatalog, state: BillingOrganizationState) => collectBillingFindings(catalog, state, { tokenPresent: true }).find(entry => entry.id === 'billing-pass-products')

describe('doctor\'s gift pass products', () => {
  it('passes when each gifted plan has a free private pass with its benefits and a private purchase per length', () => {
    expect(passFinding(giftCatalog, organization({ 'pro-pass': pass, 'pro-gift-3': purchase, 'pro-gift-12': purchase }))).toMatchObject({ status: 'pass' })
  })

  it.each([
    ['no pass product', {}, 'pro has no pass product'],
    ['a public pass', { 'pro-pass': { ...pass, visibility: 'public' } }, 'pro\'s pass product is not private'],
    ['a pass that charges', { 'pro-pass': { ...pass, prices: { usd: 900 } } }, 'pro\'s pass product is not free, so claiming it would charge a card'],
    ['a pass that grants nothing', { 'pro-pass': { ...pass, benefits: 0 } }, 'pro\'s pass product carries no benefits, so a workspace on it would hold nothing'],
    ['no purchase product for a length', { 'pro-pass': pass, 'pro-gift-12': purchase }, 'pro has no 3-month gift product'],
    ['a public purchase product', { 'pro-pass': pass, 'pro-gift-3': { ...purchase, visibility: 'public' }, 'pro-gift-12': purchase }, 'pro\'s 3-month gift product is not private'],
    ['a purchase that grants the plan to its buyer', { 'pro-pass': pass, 'pro-gift-3': purchase, 'pro-gift-12': { ...purchase, benefits: 1 } }, 'pro\'s 12-month gift product carries benefits, which its purchaser would receive'],
  ])('warns of %s, naming it', (_case, products, problem) => {
    const found = passFinding(giftCatalog, organization(products as BillingOrganizationState['productByKey']))
    expect(found).toMatchObject({ status: 'warn' })
    expect(found!.message).toBe(`${problem} — gifts of that plan may be refused, charge the recipient, or grant nothing.`)
  })

  it('names every plan with a problem, and checks a reverse trial\'s pass alone', () => {
    const catalog = { plans: { pro: { name: 'Pro', prices: { month: 900 }, gift: { months: [3] } }, team: { name: 'Team', prices: { month: 2900 }, trial: { days: 14, pass: true } } } } as unknown as BillingCatalog
    const found = passFinding(catalog, organization({}))
    expect(found!.message).toBe('pro has no pass product; team has no pass product — gifts of those plans may be refused, charge the recipient, or grant nothing.')
    expect(passFinding(catalog, organization({ 'pro-pass': pass, 'pro-gift-3': purchase, 'team-pass': pass }))).toMatchObject({ status: 'pass' })
  })

  it('says nothing of passes for a catalog that offers no plan as a gift', () => {
    expect(passFinding({ plans: { pro: { name: 'Pro', prices: { month: 900 } } } } as unknown as BillingCatalog, organization({}))).toBeUndefined()
  })
})

describe('doctor\'s provider SDK check', () => {
  /** A package in the app's install, with a manifest and an entry point; `exportsManifest: false` keeps `<name>/package.json` out of its exports. */
  function install(at: string, name: string, version: string, { exportsManifest = true } = {}) {
    const dir = join(root, at, 'node_modules', name)
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFileSync(join(dir, 'dist/index.js'), 'module.exports = {}\n')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version, main: './dist/index.js', ...exportsManifest ? {} : { exports: { '.': { require: './dist/index.js', default: './dist/index.js' } } } }))
  }

  it('warns when the billing component resolves the 1.x SDK it was not built on', () => {
    install('.', '@convex-dev/polar', '0.9.1')
    install('.', '@polar-sh/sdk', '1.2.0')
    const [found] = providerSdkFindings(root)
    expect(found).toMatchObject({ id: 'billing-provider-sdk', status: 'warn', fixHint: expect.stringContaining('"@polar-sh/sdk": "^0.49.0"') })
    expect(found!.message).toContain('resolves @polar-sh/sdk 1.2.0')
  })

  it('reads the SDK the component resolves, its own copy before the app\'s', () => {
    install('.', '@convex-dev/polar', '0.9.1')
    install('.', '@polar-sh/sdk', '1.2.0')
    install('node_modules/@convex-dev/polar', '@polar-sh/sdk', '0.49.2')
    expect(providerSdkFindings(root)).toEqual([expect.objectContaining({ status: 'pass', message: 'The billing component resolves @polar-sh/sdk 0.49.2, the line it is built on.' })])
  })

  it('finds a package whose exports hide its manifest through its entry point', () => {
    install('.', '@polar-sh/sdk', '0.49.2', { exportsManifest: false })
    expect(providerSdkFindings(root)).toEqual([expect.objectContaining({ status: 'pass', message: expect.stringContaining('0.49.2') })])
  })

  it('says nothing when the app resolves no SDK', () => {
    expect(providerSdkFindings(root)).toEqual([])
  })
})

describe('doctor\'s production catalog check', () => {
  beforeEach(() => {
    mkdirSync(join(root, 'backend'))
    writeFileSync(join(root, 'backend/billing.catalog.ts'), 'export default { plans: { pro: { name: \'Pro\', prices: { month: 900, year: 9000 } } }, meters: { credits: { eventName: \'credits\', property: \'amount\' } } }\n')
  })

  it('names each price and meter production has no id for: a warning while it bills elsewhere, a failure once it bills in production', async () => {
    writeFileSync(join(root, 'backend/billing.generated.ts'), 'export const catalog = { production: { products: { pro: \'prod_month\' }, meters: {} } }\n')
    const [sandbox] = await productionCatalogFindings(root, 'sandbox')
    expect(sandbox).toMatchObject({ id: 'billing-catalog-production', status: 'warn', message: 'The catalog has no production id for pro:year, meter credits: once production bills in the production environment, their checkout is refused.' })
    const [live] = await productionCatalogFindings(root, 'production')
    expect(live).toMatchObject({ status: 'fail', message: 'The catalog has no production id for pro:year, meter credits: production refuses their checkout.', fixHint: expect.stringContaining('billing sync --env production') })
  })

  it('passes once every price and meter has its production id', async () => {
    writeFileSync(join(root, 'backend/billing.generated.ts'), 'export const catalog = { production: { products: { \'pro\': \'prod_month\', \'pro:year\': \'prod_year\' }, meters: { credits: \'meter_1\' } } }\n')
    expect(await productionCatalogFindings(root, 'production')).toEqual([expect.objectContaining({ status: 'pass' })])
  })

  it('says nothing of an id map that does not load, which billing sync reports, nor without a catalog', async () => {
    writeFileSync(join(root, 'backend/billing.generated.ts'), '<<<<<<< HEAD\nexport const catalog = {}\n')
    expect(await productionCatalogFindings(root, 'production')).toEqual([])
    rmSync(join(root, 'backend/billing.catalog.ts'))
    expect(await productionCatalogFindings(root, 'production')).toEqual([])
  })
})
