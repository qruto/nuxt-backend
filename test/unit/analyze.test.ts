import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { analyzeConvex, BUNDLE_ANALYZER, buildConvexReport, convexRefusal, isBackendComponent, resolveBundleAnalyzer, type AnalyzerComponent, type AnalyzerOutput, type AnalyzerPackage, type RunAnalyzer } from '../../src/analyze/convex'
import { analyzeLayerConfig, analyzeNuxt, buildNuxtReport, originOf, resolveNuxtCli, type RawBundleData } from '../../src/analyze/nuxt'
import { budgetFailures, checkBudgets, formatReport, installChangedSince, lastRunPath, readLastRun, saveLastRun } from '../../src/analyze/report'
import { runAnalyze } from '../../src/analyze/run'
import { formatShare, formatSize, parseSize } from '../../src/analyze/sizes'
import type { AnalyzeReport, BundleReport } from '../../src/analyze/types'
import { bundleDuplicatesFindings } from '../../src/bundle-duplicates'

const measured = { convex: vi.fn(), nuxt: vi.fn() }

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-analyze-'))
  measured.convex.mockReset()
  measured.nuxt.mockReset()
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
  vi.restoreAllMocks()
  process.exitCode = undefined
})

const component = (id: string, componentName: string, definitionPath: string, codeBytes: number): AnalyzerComponent => ({ id, component: componentName, definitionPath, codeBytes, sourceMapBytes: codeBytes })
const row = (name: string, codeBytes: number, byBuild: Record<string, number> = {}, version: string | null = '1.0.0'): AnalyzerPackage => ({
  package: name === 'your code' ? name : `${name}@${version}`,
  name,
  version: name === 'your code' ? null : version,
  codeBytes,
  byBuild: Object.fromEntries(Object.entries(byBuild).map(([build, bytes]) => [build, { codeBytes: bytes }])),
})

/** An app with the package's component, one other component and a duplicated dependency. */
const analyzer: AnalyzerOutput = {
  components: [
    component('app:convex', 'app', '', 5000),
    component('nuxt-backend:convex', 'nuxt-backend', '../../node_modules/nuxt-backend/dist/convex/components/backend', 2000),
    component('polar:convex', 'polar', '../../node_modules/@convex-dev/polar/dist/component', 1000),
    component('app:schema', 'app', '', 200),
  ],
  packages: [
    row('zod', 2500, { 'app:convex': 1500, 'nuxt-backend:convex': 1000 }),
    row('nuxt-backend', 900, { 'app:convex': 600, 'nuxt-backend:convex': 300 }),
    row('your code', 1400, { 'app:convex': 400, 'app:schema': 100, 'polar:convex': 900 }),
    row('react', 10, {}, '19.0.0'),
  ],
  insights: [
    { kind: 'duplicate-package', level: 'warn', title: 'ms is bundled 2 times in app:convex', savedCodeBytes: 40, subject: 'ms' },
    { kind: 'package-in-many-components', level: 'info', title: 'zod is bundled separately into 2 components', savedCodeBytes: 900, subject: 'zod@4' },
  ],
}

describe('sizes', () => {
  it('reads a budget with a unit, in any case, and a bare number as bytes', () => {
    expect([parseSize('8MB'), parseSize('350kB'), parseSize('350KB'), parseSize('1.5 mb'), parseSize('2MiB'), parseSize('900'), parseSize('12B')])
      .toEqual([8_000_000, 350_000, 350_000, 1_500_000, 2_097_152, 900, 12])
  })

  it('refuses text that is no size', () => {
    expect(['', 'big', '8 parsecs', '-5MB', 'MB'].map(parseSize)).toEqual([null, null, null, null, null])
  })

  it('prints sizes in decimal units, and shares of a total', () => {
    expect([formatSize(812), formatSize(350_200), formatSize(8_410_000), formatSize(1_234_000_000)]).toEqual(['812 B', '350 kB', '8.41 MB', '1.23 GB'])
    expect([formatShare(1, 3), formatShare(1, 100), formatShare(0, 0)]).toEqual(['33%', '1.0%', '0%'])
  })
})

describe('the Convex bundle', () => {
  it('is the app\'s bundle and every component\'s, with the package\'s share named apart', () => {
    const report = buildConvexReport(analyzer)
    expect(report).toMatchObject({ id: 'convex', bytes: 8200, sourceMapBytes: 8200 })
    // The package's component bundle (2000), and its own files in the app's functions bundle (600).
    expect(report.shares.map(share => [share.id, share.bytes])).toEqual([['nuxt-backend', 2600], ['app', 500], ['other', 5100]])
    expect(report.shares[0]!.share).toBeCloseTo(2600 / 8200)
    // The analyzer's "your code" counts every build; the report's is the app's own.
    expect(report.packages.find(item => item.name === 'your code')).toEqual({ name: 'your code', bytes: 500 })
    expect(report.packages[0]).toMatchObject({ name: 'zod', version: '1.0.0' })
  })

  it('names the parts, the app\'s functions first', () => {
    const report = buildConvexReport(analyzer)
    expect(report.parts).toEqual([
      { name: 'your functions', bytes: 5200 },
      { name: 'nuxt-backend', bytes: 2000 },
      { name: '@convex-dev/polar', bytes: 1000 },
    ])
  })

  it('finds the package\'s component by where it is defined, however it is mounted', () => {
    expect(isBackendComponent({ component: 'backend', definitionPath: 'node_modules/nuxt-backend/dist/convex/components/backend' })).toBe(true)
    expect(isBackendComponent({ component: 'backend', definitionPath: '../../dist/convex/components/backend' })).toBe(true)
    expect(isBackendComponent({ component: 'polar', definitionPath: 'node_modules/@convex-dev/polar/dist/component' })).toBe(false)
  })

  it('carries the analyzer\'s insights, and what each would save of the code', () => {
    expect(buildConvexReport(analyzer).insights).toEqual([
      { kind: 'duplicate-package', level: 'warn', title: 'ms is bundled 2 times in app:convex', savedBytes: 40, subject: 'ms' },
      { kind: 'package-in-many-components', level: 'info', title: 'zod is bundled separately into 2 components', savedBytes: 900, subject: 'zod@4' },
    ])
  })

  it('runs the analyzer\'s three listings, and passes on its warning about the Convex version', async () => {
    const calls: string[][] = []
    const run: RunAnalyzer = async (_root, args) => {
      calls.push(args)
      const stderr = 'Warning: this project uses convex 1.48.0, but this analyzer uses the convex 1.47.0 bundler.\n- Bundling...'
      if (args[0] === 'components') return { stdout: JSON.stringify(analyzer.components), stderr }
      if (args[0] === 'packages') return { stdout: JSON.stringify(analyzer.packages), stderr }
      return { stdout: JSON.stringify({ insights: analyzer.insights }), stderr }
    }
    mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
    const report = await analyzeConvex(rootDir, run)
    expect(calls.map(args => args[0]).sort()).toEqual(['components', 'insights', 'packages'])
    expect(report.notes).toEqual(['this project uses convex 1.48.0, but this analyzer uses the convex 1.47.0 bundler.'])
  })

  it('needs the functions\' codegen, and says how to get it', async () => {
    expect(convexRefusal(rootDir)).toMatch(/backend\/_generated\/ is missing: run npx nuxt-backend dev/)
    await expect(analyzeConvex(rootDir, async () => ({ stdout: '[]', stderr: '' }))).rejects.toThrow(/_generated\/ is missing/)
    mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
    expect(convexRefusal(rootDir)).toBeNull()
  })

  it('refuses output that is not JSON', async () => {
    mkdirSync(join(rootDir, 'backend/_generated'), { recursive: true })
    await expect(analyzeConvex(rootDir, async () => ({ stdout: 'not json', stderr: '' }))).rejects.toThrow(/printed something other than JSON/)
  })

  it('resolves the analyzer this repository installs, and runs it', () => {
    expect(resolveBundleAnalyzer()).toMatch(/bundle-analyzer[\\/]dist[\\/]cli\.js$/)
  })

  it('names the analyzer at the version this package declares as its optional peer', () => {
    const own = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')) as { peerDependencies: Record<string, string>, peerDependenciesMeta: Record<string, { optional?: boolean }> }
    expect(BUNDLE_ANALYZER).toBe(`@convex-dev/bundle-analyzer@${own.peerDependencies['@convex-dev/bundle-analyzer']}`)
    expect(own.peerDependenciesMeta['@convex-dev/bundle-analyzer']?.optional).toBe(true)
  })

  it('names the install command when the analyzer is missing', async () => {
    const notInstalled = () => {
      throw new Error('missing')
    }
    vi.doMock('node:module', async original => ({ ...await original<typeof import('node:module')>(), createRequire: () => ({ resolve: notInstalled }) }))
    vi.resetModules()
    const fresh = await import('../../src/analyze/convex')
    await expect(fresh.runBundleAnalyzer(rootDir, ['components'])).rejects.toThrow(/npm install -D @convex-dev\/bundle-analyzer@/)
    vi.doUnmock('node:module')
    vi.resetModules()
  })
})

/** The visualizer's raw data for modules of the given ids and sizes. */
function raw(modules: Array<[id: string, bytes: number, chunks?: number]>, gzip = true): RawBundleData {
  const nodeParts: Record<string, { renderedLength: number, gzipLength: number }> = {}
  const nodeMetas: Record<string, { id: string, moduleParts: Record<string, string> }> = {}
  modules.forEach(([id, bytes, chunks = 1], index) => {
    const moduleParts: Record<string, string> = {}
    for (let chunk = 0; chunk < chunks; chunk++) {
      const uid = `p${index}-${chunk}`
      moduleParts[`_nuxt/chunk${chunk}.js`] = uid
      nodeParts[uid] = { renderedLength: bytes, gzipLength: Math.round(bytes / 4) }
    }
    nodeMetas[`m${index}`] = { id, moduleParts }
  })
  return { nodeParts, nodeMetas, options: { gzip } }
}

describe('a Nuxt bundle', () => {
  const app = '/work/app'
  const modules: Array<[string, number, number?]> = [
    [`${app}/node_modules/vue/dist/vue.mjs`, 4000],
    [`${app}/node_modules/@vueuse/core/index.mjs`, 1000],
    [`${app}/node_modules/nuxt-backend/dist/runtime/vue/composables/useAuth.js`, 600],
    ['virtual:nuxt:.nuxt%2Fnuxt-backend%2Ftheme-bridge.css', 100],
    ['/pages/index.vue?macro=true&vue&type=script&setup=true&lang.ts', 700],
    ['\u0000vite/modulepreload-polyfill.js', 50],
    // The same module in two chunks counts twice: it is in the bundle twice.
    [`${app}/node_modules/nanostores/index.js`, 150, 2],
  ]

  it('adds up the modules in every chunk, and the gzipped size when the build measured it', () => {
    const report = buildNuxtReport('client', raw(modules), { ownDirs: [] })
    expect(report).toMatchObject({ id: 'client', title: 'Nuxt client bundle', bytes: 6750, gzipBytes: 1689 })
    expect(buildNuxtReport('server', raw(modules, false), { ownDirs: [] }).gzipBytes).toBeUndefined()
  })

  it('splits who brings it: the package, the app, the rest', () => {
    const report = buildNuxtReport('client', raw(modules), { ownDirs: [] })
    expect(report.shares.map(share => [share.id, share.bytes])).toEqual([['nuxt-backend', 700], ['app', 700], ['other', 5350]])
    expect(report.packages.map(item => [item.name, item.bytes])).toEqual([['vue', 4000], ['@vueuse/core', 1000], ['nuxt-backend', 700], ['your code', 700], ['nanostores', 300], ['generated code', 50]])
  })

  it('places this package\'s files by its linked directories too, and not a dependency inside them', () => {
    const linked = raw([['/repo/dist/runtime/server/api.js', 300], ['/repo/node_modules/zod/index.js', 900], ['/other/server.ts', 20]])
    const report = buildNuxtReport('server', linked, { ownDirs: ['/repo'] })
    expect(report.shares.map(share => [share.id, share.bytes])).toEqual([['nuxt-backend', 300], ['app', 20], ['other', 900]])
  })

  it('classifies modules by where they came from', () => {
    expect(originOf('/a/node_modules/@scope/pkg/dist/x.mjs?v=1', [])).toEqual({ kind: 'package', name: '@scope/pkg', dir: '/a/node_modules/@scope/pkg' })
    expect(originOf('/a/node_modules/x/node_modules/y/i.js', [])).toEqual({ kind: 'package', name: 'y', dir: '/a/node_modules/x/node_modules/y' })
    expect(originOf('virtual:nuxt:.nuxt%2Fnuxt-backend%2Ftheme.css', [])).toMatchObject({ kind: 'package', name: 'nuxt-backend' })
    expect(originOf('virtual:nuxt:.nuxt%2Fcss.mjs', [])).toEqual({ kind: 'generated' })
    expect(originOf('\u0000plugin-vue:export-helper', [])).toEqual({ kind: 'generated' })
    expect(originOf('/components/Header.vue', [])).toEqual({ kind: 'app' })
    // Caches under node_modules and what Nuxt generates are no packages; the templates this package writes are its own.
    expect(originOf('/a/node_modules/.cache/content/dump.mjs', [])).toEqual({ kind: 'generated' })
    expect(originOf('/a/.nuxt/components.plugin.mjs', [])).toEqual({ kind: 'generated' })
    expect(originOf('/a/.nuxt/nuxt-backend/pages.mjs', [])).toMatchObject({ kind: 'package', name: 'nuxt-backend' })
  })

  it('flags a package bundled from two installs, and what keeping one would save', () => {
    const duplicated = raw([
      ['/a/node_modules/ms/index.js', 3000],
      ['/a/node_modules/ai/node_modules/ms/index.js', 2000],
      ['/a/node_modules/other/node_modules/ms/index.js', 1000],
      // Installed, but shaken to nothing: not bundled.
      ['/a/node_modules/third/node_modules/ms/index.js', 0],
      ['/a/node_modules/vue/vue.js', 9000],
      // Small enough not to be worth a line.
      ['/a/node_modules/tiny/index.js', 50],
      ['/a/node_modules/x/node_modules/tiny/index.js', 40],
    ])
    const { insights } = buildNuxtReport('client', duplicated, { ownDirs: [], readVersion: dir => dir.includes('/ai/') ? '2.0.0' : '1.0.0' })
    expect(insights).toHaveLength(1)
    expect(insights[0]).toMatchObject({ kind: 'duplicate-package', level: 'warn', title: 'ms is bundled 3 times', savedBytes: 3000, subject: 'ms' })
    expect(insights[0]!.detail).toContain('2.0.0 in node_modules/ai/node_modules/ms (2.00 kB)')
  })

  it('says the server bundle is measured before minification', () => {
    expect(buildNuxtReport('server', raw([['/x.ts', 1]]), { ownDirs: [] }).notes[0]).toMatch(/before minification/)
  })

  it('has its visualizers write raw data, and the build\'s output go elsewhere than the app\'s .output', () => {
    const config = analyzeLayerConfig('/tmp/work')
    expect(config).toContain(`template: 'raw-data'`)
    // The platform's own paths, as the layer writes them (`\\` on Windows).
    expect(config).toContain(JSON.stringify(join('/tmp/work', '{name}.json')))
    expect(config).toContain(JSON.stringify(join('/tmp/work', 'output')))
    expect(config).not.toContain('.output')
  })

  it('asks for the client stats\' plugin when the build wrote none', async () => {
    await expect(analyzeNuxt(rootDir, async () => ({ client: null, server: null }))).rejects.toThrow(/rollup-plugin-visualizer/)
    const reports = await analyzeNuxt(rootDir, async () => ({ client: raw([['/a.ts', 1]]), server: raw([['/b.ts', 2]]) }), { ownDirs: [] })
    expect(reports.map(report => report.id)).toEqual(['client', 'server'])
  })

  it('finds the project\'s Nuxt CLI', () => {
    expect(resolveNuxtCli(process.cwd())).toMatch(/nuxt[\\/]bin[\\/]nuxt\.mjs$/)
    expect(resolveNuxtCli(rootDir)).toBeUndefined()
  })
})

const bundle = (id: BundleReport['id'], bytes: number, packages: Array<[string, number]> = []): BundleReport => ({
  id,
  title: `${id} bundle`,
  bytes,
  parts: [],
  packages: packages.map(([name, size]) => ({ name, bytes: size })),
  shares: [],
  insights: [],
  notes: [],
})

const report = (bundles: BundleReport[], ranAt = '2026-10-27T10:00:00.000Z'): AnalyzeReport => ({ version: 1, ranAt, bundles, budgets: [], failures: [] })

describe('budgets', () => {
  it('check each bundle that has one, and name what grew since the run before when over', () => {
    const before = report([bundle('convex', 1000, [['zod', 400], ['ai', 300]])])
    const now = [bundle('convex', 1600, [['zod', 450], ['ai', 300], ['svix', 400]]), bundle('client', 50)]
    const checks = checkBudgets(now, { convex: 1500, client: 100 }, before)
    expect(checks).toEqual([
      // svix was not among the largest before, so it was no bigger than the smallest of them (300).
      { bundle: 'convex', flag: '--max-convex', limit: 1500, bytes: 1600, over: true, grew: [{ name: 'svix', bytes: 100 }, { name: 'zod', bytes: 50 }] },
      { bundle: 'client', flag: '--max-client', limit: 100, bytes: 50, over: false, grew: [] },
    ])
  })

  it('check nothing for a bundle without a budget', () => {
    expect(checkBudgets([bundle('server', 1)], { convex: 1 })).toEqual([])
  })

  it('name the largest package when there is no run before to compare with', () => {
    const budgets = checkBudgets([bundle('client', 900, [['your code', 500], ['vue', 300]])], { client: 100 })
    expect(budgetFailures({ ...report([bundle('client', 900, [['your code', 500], ['vue', 300]])]), budgets })).toEqual([
      'client bundle is 900 B, 800 B over --max-client 100 B; its largest package is vue at 300 B',
    ])
  })

  it('name what grew in the failure line', () => {
    const budgets = checkBudgets([bundle('convex', 2_000_000, [['zod', 900_000]])], { convex: 1_000_000 }, report([bundle('convex', 1_000_000, [['zod', 400_000]])]))
    expect(budgetFailures({ ...report([]), budgets })[0]).toBe('convex bundle is 2.00 MB, 1.00 MB over --max-convex 1.00 MB; since the last run it grew in zod (+500 kB)')
  })
})

describe('the last run', () => {
  it('is kept in the tool cache, and read back', () => {
    expect(readLastRun(rootDir)).toBeNull()
    saveLastRun(rootDir, report([bundle('convex', 10)]))
    expect(lastRunPath(rootDir)).toContain(join('node_modules', '.cache', 'nuxt-backend'))
    expect(readLastRun(rootDir)?.bundles[0]).toMatchObject({ id: 'convex', bytes: 10 })
  })

  it('keeps the other half\'s bundles when one half is measured again', () => {
    saveLastRun(rootDir, report([bundle('convex', 10), bundle('client', 20), bundle('server', 30)]))
    saveLastRun(rootDir, report([bundle('convex', 11)], '2026-10-28T10:00:00.000Z'))
    expect(readLastRun(rootDir)?.bundles.map(item => [item.id, item.bytes])).toEqual([['convex', 11], ['client', 20], ['server', 30]])
    saveLastRun(rootDir, report([bundle('client', 21), bundle('server', 31)]))
    expect(readLastRun(rootDir)?.bundles.map(item => [item.id, item.bytes])).toEqual([['convex', 11], ['client', 21], ['server', 31]])
  })

  it('is no run when the file does not read', () => {
    saveLastRun(rootDir, report([]))
    writeFileSync(lastRunPath(rootDir), '{ not json')
    expect(readLastRun(rootDir)).toBeNull()
    writeFileSync(lastRunPath(rootDir), JSON.stringify({ version: 2, bundles: [], ranAt: 'x' }))
    expect(readLastRun(rootDir)).toBeNull()
  })

  it('goes stale when a lockfile is newer than it', () => {
    expect(installChangedSince(rootDir, '2026-10-27T10:00:00.000Z')).toBe(false)
    writeFileSync(join(rootDir, 'pnpm-lock.yaml'), '')
    utimesSync(join(rootDir, 'pnpm-lock.yaml'), new Date('2026-10-27T09:00:00Z'), new Date('2026-10-27T09:00:00Z'))
    expect(installChangedSince(rootDir, '2026-10-27T10:00:00.000Z')).toBe(false)
    utimesSync(join(rootDir, 'pnpm-lock.yaml'), new Date('2026-10-27T11:00:00Z'), new Date('2026-10-27T11:00:00Z'))
    expect(installChangedSince(rootDir, '2026-10-27T10:00:00.000Z')).toBe(true)
    expect(installChangedSince(rootDir, 'never')).toBe(true)
  })
})

describe('a run', () => {
  it('measures both halves, checks the budgets and keeps the run', async () => {
    measured.convex.mockResolvedValue(bundle('convex', 5000))
    measured.nuxt.mockResolvedValue([bundle('client', 300), bundle('server', 400)])
    const result = await runAnalyze(rootDir, { limits: { convex: 4000, client: 400 } }, { convex: measured.convex, nuxt: measured.nuxt, now: () => new Date('2026-10-27T12:00:00Z') })
    expect(result).toMatchObject({ version: 1, ranAt: '2026-10-27T12:00:00.000Z', failures: [] })
    expect(result.bundles.map(item => item.id)).toEqual(['convex', 'client', 'server'])
    expect(result.budgets.map(check => [check.bundle, check.over])).toEqual([['convex', true], ['client', false]])
    expect(readLastRun(rootDir)?.bundles).toHaveLength(3)
  })

  it('measures one half with --only, and leaves the other alone', async () => {
    measured.convex.mockResolvedValue(bundle('convex', 1))
    await runAnalyze(rootDir, { only: 'convex' }, { convex: measured.convex, nuxt: measured.nuxt })
    expect(measured.nuxt).not.toHaveBeenCalled()
  })

  it('reports a half that cannot run, and still measures the other', async () => {
    measured.convex.mockRejectedValue(new Error('backend/_generated/ is missing'))
    measured.nuxt.mockResolvedValue([bundle('client', 1)])
    const result = await runAnalyze(rootDir, {}, { convex: measured.convex, nuxt: measured.nuxt })
    expect(result.failures).toEqual([{ half: 'convex', message: 'backend/_generated/ is missing' }])
    expect(result.bundles.map(item => item.id)).toEqual(['client'])
  })

  // A CI gate on the server bundle would pass when the build wrote no server stats.
  it('fails a budget whose bundle the run did not measure', async () => {
    measured.nuxt.mockResolvedValue([bundle('client', 1)])
    const result = await runAnalyze(rootDir, { only: 'nuxt', limits: { server: 500_000 } }, { convex: measured.convex, nuxt: measured.nuxt })
    expect(result.failures).toEqual([{ half: 'nuxt', message: 'the run measured no server bundle, so --max-server was not checked' }])
    measured.nuxt.mockRejectedValue(new Error('the Nuxt build failed'))
    expect((await runAnalyze(rootDir, { only: 'nuxt', limits: { server: 500_000 } }, { convex: measured.convex, nuxt: measured.nuxt })).failures).toEqual([{ half: 'nuxt', message: 'the Nuxt build failed' }])
  })

  it('keeps nothing when nothing was measured', async () => {
    measured.convex.mockRejectedValue(new Error('no'))
    await runAnalyze(rootDir, { only: 'convex' }, { convex: measured.convex, nuxt: measured.nuxt })
    expect(readLastRun(rootDir)).toBeNull()
  })
})

describe('the report as text', () => {
  const full: AnalyzeReport = {
    ...report([{
      ...bundle('convex', 8_410_000, [['zod', 2_000_000]]),
      title: 'Convex bundle',
      sourceMapBytes: 7_000_000,
      parts: [{ name: 'your functions', bytes: 5_000_000 }],
      shares: [{ id: 'nuxt-backend', label: 'nuxt-backend', bytes: 2_100_000, share: 0.25 }],
      insights: [{ kind: 'duplicate-package', level: 'warn', title: 'ms is bundled 2 times', detail: 'Copies: a, b.', savedBytes: 40_000 }],
    }]),
    budgets: [{ bundle: 'convex', flag: '--max-convex', limit: 8_000_000, bytes: 8_410_000, over: true, grew: [] }],
    failures: [{ half: 'nuxt', message: 'the Nuxt build failed' }],
  }

  it('has a section per bundle, then the insights, the budgets and what was not measured', () => {
    const text = formatReport(full).join('\n')
    expect(text).toContain('Convex bundle\n  8.41 MB of code · 7.00 MB of source maps')
    expect(text).toContain('nuxt-backend       2.10 MB   25%')
    expect(text).toContain('your functions')
    expect(text).toContain('⚠ [convex] ms is bundled 2 times (saves about 40.0 kB)')
    expect(text).toContain('✗ convex: 8.41 MB of code, 410 kB over --max-convex 8.00 MB')
    expect(text).toContain('Not measured\n  ✗ nuxt: the Nuxt build failed')
  })

  it('says so when there is nothing to shrink', () => {
    expect(formatReport(report([bundle('client', 1)])).join('\n')).toContain('None: nothing to shrink')
  })
})

describe('doctor\'s bundle-duplicates', () => {
  const withDuplicate = (insight: Partial<BundleReport['insights'][number]> = {}): AnalyzeReport => report([{
    ...bundle('convex', 100),
    insights: [{ kind: 'duplicate-package', level: 'warn', title: 'ms is bundled 2 times', savedBytes: 40_000, subject: 'ms', ...insight }],
  }])

  it('has no finding before a run, or from a run that left the Convex bundle out', () => {
    expect(bundleDuplicatesFindings(rootDir)).toEqual([])
    saveLastRun(rootDir, report([bundle('client', 1)]))
    expect(bundleDuplicatesFindings(rootDir)).toEqual([])
  })

  it('warns when the last run found a package bundled more than once, and names it', () => {
    saveLastRun(rootDir, withDuplicate())
    expect(bundleDuplicatesFindings(rootDir)).toMatchObject([{ id: 'bundle-duplicates', capability: 'data', status: 'warn', message: expect.stringContaining('(ms), about 40.0 kB of code') }])
    expect(bundleDuplicatesFindings(rootDir)[0]!.fixHint).toMatch(/Dedupe the install/)
  })

  it('does not count a package bundled once per component, which Convex does by design', () => {
    saveLastRun(rootDir, withDuplicate({ kind: 'package-in-many-components', level: 'info' }))
    expect(bundleDuplicatesFindings(rootDir)).toMatchObject([{ status: 'pass' }])
  })

  it('says nothing once an install has changed since the run', () => {
    saveLastRun(rootDir, withDuplicate())
    writeFileSync(join(rootDir, 'pnpm-lock.yaml'), '')
    utimesSync(join(rootDir, 'pnpm-lock.yaml'), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000))
    expect(bundleDuplicatesFindings(rootDir)).toEqual([])
  })
})
