import { describe, expect, it } from 'vitest'
import { APP_CALLABLE, BILLING_BUILT_IN, currentText, DEPLOYMENT_ROUTES, expectedText, FINDING_DOCS, LOOKUPS, lookupFiles, readRegion, regionNames, ROUTE_AREAS, USE_FOR } from '../../scripts/docs-lookups/index.mjs'
import { sectionsOf } from '../../scripts/docs-lookups/sections.mjs'
import { entrypoints, moduleRegistry } from '../../scripts/lib/surface.mjs'
import { COMMAND_CONTRACTS } from '../../src/cli/contract'
import { BACKEND_ERRORS, type BackendErrorCode } from '../../src/convex/errors'
import { LABELS } from '../../src/convex/labels'
import { BACKEND_ENV, REQUIRED_DEPLOYMENT_ENV } from '../../src/env-registry'
import { deploymentEnvId, FINDINGS, type FindingId } from '../../src/findings'
import WHAT_YOU_GET from '../../website/shared/what-you-get.json'
import { DOCS_SHORT_LINKS, ERROR_CODES, FINDING_IDS, GENERATED_SECTIONS, REFERENCE_ROUTE } from '../../website/shared/docs-routes'
import { API_WEIGHT, LOOKUP_WEIGHT, rankByWeight, searchWeight } from '../../website/shared/search-ranking'
import { contentFile, contentRoute, read, walk } from './helpers'

// The reference's lookups, generated from the code (scripts/docs-lookups/):
// every page is what `pnpm docs:lookups` would write from the registries as
// they stand, and every id, code, name and command has its row there. These
// are the registry-to-docs pins: a registry entry without its row fails the
// generator, and a page that was not regenerated fails here.

/** The body of a page's region, by route. */
const region = (route: string, name: string) => {
  const file = contentFile(route)
  const body = readRegion(file, read(file), name)
  expect(body, `${route} has no region ${name}`).toBeDefined()
  return body!
}

describe('the generated lookups', () => {
  // Each file renders its lookups: seconds on a loaded machine.
  it.each(lookupFiles())('%s is what pnpm docs:lookups writes', (file) => {
    expect(currentText(file), 'run pnpm docs:lookups').toBe(expectedText(file))
  }, 30_000)

  it('own every region a file marks, and nothing else', () => {
    const files = [...walk('website/content', ['.md']).map(file => file.slice(file.indexOf('website/content/'))), 'README.md', 'website/shared/docs-routes.ts']
    const marked = files.flatMap(file => regionNames(file, read(file)).map(name => `${file}#${name}`))
    const owned = LOOKUPS.filter(lookup => lookup.region).map(lookup => `${lookup.file}#${lookup.region}`)
    expect(marked.sort()).toEqual([...new Set(owned)].sort())
  })

  // Renders every lookup: seconds on a loaded machine.
  it('name no provider type in code', () => {
    const named = LOOKUPS.flatMap(lookup => [...lookup.render().matchAll(/`[^`\n]+`/g)]
      .flatMap(([span]) => [...span.matchAll(/\b\w*(?:Polar|Resend)\w*\b/g)].map(([identifier]) => `${lookup.file}: ${identifier}`)))
    expect(named).toEqual([])
  }, 30_000)
})

describe('the registry-to-docs pins', () => {
  it('lists every env name on the environment variables page', () => {
    const table = region('/docs/reference/configuration/environment-variables', 'env')
    for (const name of Object.keys(BACKEND_ENV)) expect(table, name).toContain(`| \`${name}\` |`)
  })

  it('gives every finding its Diagnostics entry, under its capability, and a /d/<id> link to it', () => {
    const page = region('/docs/reference/cli/diagnostics', 'diagnostics')
    const ids = Object.keys(FINDINGS) as FindingId[]
    expect([...FINDING_IDS].sort()).toEqual([...ids].sort())
    for (const id of ids) {
      const capability = page.slice(page.indexOf(`## \`${FINDINGS[id].capability}\``))
      expect(capability.split(/^## /m)[1], id).toContain(`### \`${id}\``)
      expect(DOCS_SHORT_LINKS, id).toContainEqual({ from: `/d/${id}`, to: `/docs/reference/cli/diagnostics#${id}` })
    }
  })

  const codes = Object.keys(BACKEND_ERRORS) as BackendErrorCode[]

  it.each(codes)('%s has an entry on the Errors page, with its label and status', (code) => {
    const entry = region('/docs/reference/backend/errors', 'error-codes').split(`### \`${code}\``)[1]?.split(/^#{2,3} /m)[0]
    expect(entry, code).toBeDefined()
    expect(entry).toContain((LABELS.errors as Record<string, string>)[code])
    expect(entry).toContain(`| ${BACKEND_ERRORS[code].status} |`)
  })

  it('documents no code the catalog does not hold, and links each from /e/<code>', () => {
    const documented = [...region('/docs/reference/backend/errors', 'error-codes').matchAll(/^### `(\w+)`$/gm)].map(([, code]) => code)
    expect(documented).toEqual(codes)
    expect([...ERROR_CODES]).toEqual(codes)
  })

  it.each([...COMMAND_CONTRACTS.keys()])('`%s` states its contract on the CLI page', (path) => {
    const body = region('/docs/reference/cli', `cli-${path.replace(/ /g, '-')}`)
    expect(body).toContain('**Side effects:**')
    for (const exit of Object.keys(COMMAND_CONTRACTS.get(path)!.exitCodes)) expect(body).toContain(`\`${exit}\``)
  })
})

describe('the hand-kept maps beside the generated rows', () => {
  it('describes exactly the route options registerBackendRoutes takes', () => {
    const options = [...read('src/convex/integrations/http.ts').matchAll(/^ {2}(\w+Path)\?: string$/gm)].map(([, name]) => name)
    expect(Object.keys(DEPLOYMENT_ROUTES).sort()).toEqual(options.sort())
  })

  it('names only billing events the webhook handles itself', () => {
    const handled = new Set([...read('src/convex/integrations/billing/webhooks.ts').matchAll(/type === '([\w.]+)'/g)].map(([, event]) => event))
    expect(Object.keys(BILLING_BUILT_IN).sort()).toEqual([...handled].sort())
  })

  it('calls callable only component functions that exist', () => {
    const api = read('src/convex/components/backend/_generated/component.ts')
    for (const key of Object.keys(APP_CALLABLE)) {
      const [module, fn] = key.split('.') as [string, string]
      expect(api, key).toMatch(new RegExp(`^ {4}${module}: \\{[\\s\\S]*?^ {6}${fn}: FunctionReference<`, 'm'))
    }
  })

  it('tags only routes the routes pages list', () => {
    const page = read(contentFile('/docs/reference/backend/http-routes'))
    for (const route of Object.keys(ROUTE_AREAS)) expect(page, route).toMatch(new RegExp(`\\| \`${route.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\/\\*{1,2})?\` \\|`))
  })

  it('says what every subpath is for, and nothing else', () => {
    expect(Object.keys(USE_FOR).sort()).toEqual(entrypoints().map(entry => entry.subpath).sort())
  })

  it('says a finding fails exactly where a check can fail it', () => {
    const doctor = read('src/doctor.ts')
    // The checks live in doctor and the preflight, and the convex-config, bot protection and
    // production posture checks, the live probes and the catalog's production ids in files of their own.
    const sources = [doctor, ...['src/preflight.ts', 'src/convex-config.ts', 'src/cli/protection.ts', 'src/cli/posture.ts', 'src/cli/probes.ts', 'src/cli/billing/doctor.ts'].map(read)].join('\n')
    const failing = new Set([...sources.matchAll(/finding\(\s*'([a-z0-9-]+)',\s*'fail'/g)].map(([, id]) => id))
    // The checks that fail by a variable id: the page paths, the route probes and the required env.
    if (doctor.includes('finding(check.id, \'fail\'')) for (const [, id] of doctor.matchAll(/id: '([a-z-]+-path)'/g)) failing.add(id!)
    if (doctor.includes('finding(route.id, \'fail\'')) for (const [, id] of doctor.matchAll(/id: '([a-z-]+-route)'/g)) failing.add(id!)
    if (/finding\(\s*deploymentEnvId\(name\),\s*'fail'/.test(doctor)) for (const name of REQUIRED_DEPLOYMENT_ENV) failing.add(deploymentEnvId(name))
    // A finding that fails only under --prod says so in `prodFails`.
    const documented = Object.entries(FINDING_DOCS).filter(([, docs]) => docs.fails || docs.prodFails).map(([id]) => id)
    expect(documented.sort()).toEqual([...failing].sort())
  })
})

describe('what you get', () => {
  it('names an area the data has on every page that renders it', () => {
    const areas = walk('website/content', ['.md']).flatMap(file => [...read(file.slice(file.indexOf('website/content/'))).matchAll(/::what-you-get\{area="([\w-]+)"\}/g)].map(([, name]) => name!))
    expect(areas.length).toBeGreaterThan(8)
    for (const area of areas) expect(Object.keys(WHAT_YOU_GET), area).toContain(area)
  })

  it('reads the module registry with every kind filled', () => {
    const registry = moduleRegistry()
    expect(registry.aliases.map(alias => alias.name)).toContain('StorageImage')
    expect(registry.server).toContain('backendAuth')
    expect(registry.appAliases).toContain('#backend/api')
  })
})

describe('search', () => {
  it('ranks exactly the sections the lookups generate below the hand-written ones', () => {
    const generated = [...new Set(LOOKUPS.filter(lookup => lookup.file.startsWith('website/content/')).map(lookup => lookup.file))]
      .flatMap(file => sectionsOf(contentRoute(file), read(file)).filter(section => section.generated).map(section => section.id))
    expect([...GENERATED_SECTIONS].sort()).toEqual(generated.sort())
  })

  it('weighs a section by where it comes from', () => {
    expect(searchWeight(`${REFERENCE_ROUTE}/use-auth#returns`)).toBe(API_WEIGHT)
    expect(searchWeight(REFERENCE_ROUTE)).toBe(API_WEIGHT)
    expect(searchWeight(GENERATED_SECTIONS[0]!)).toBe(LOOKUP_WEIGHT)
    expect(searchWeight('/docs/build/billing/credits#spend')).toBe(1)
    // A hand-written page's own section, though a lookup sits further down it.
    expect(searchWeight('/docs/reference/configuration/environment-variables')).toBe(1)
  })

  it('ranks a hand-written section above a generated one that matched better', () => {
    const results = [
      { id: GENERATED_SECTIONS[0]!, rank: -10 },
      { id: '/docs/build/billing/credits', rank: -6 },
      { id: `${REFERENCE_ROUTE}/billing`, rank: -20 },
    ]
    expect(rankByWeight(results, 2).map(result => result.id)).toEqual(['/docs/build/billing/credits', GENERATED_SECTIONS[0]])
  })
})

describe('sections', () => {
  const page = '---\ntitle: x\n---\n\nIntro by hand.\n\n## By hand\n\nProse.\n\n## Table\n\n<!-- generated:t (x) -->\n\n| a |\n|---|\n| 1 |\n\n<!-- /generated:t -->\n\n## Table\n\nAgain.\n'

  it('marks a section generated when most of its lines sit in a region, and numbers repeated anchors', () => {
    expect(sectionsOf('/p', page)).toEqual([
      { id: '/p', generated: false },
      { id: '/p#by-hand', generated: false },
      { id: '/p#table', generated: true },
      { id: '/p#table-1', generated: false },
    ])
  })
})
