import { resolve } from 'node:path'
import { defineCommand } from 'citty'
import { halvesOf, runAnalyze, type AnalyzeOptions } from '../analyze/run'
import { budgetFailures, BUDGET_FLAGS, formatReport } from '../analyze/report'
import { formatSize, parseSize } from '../analyze/sizes'
import type { BundleId } from '../analyze/types'
import { progress, withContract } from './contract'

const FLAG_OF_BUNDLE: Readonly<Record<BundleId, 'max-convex' | 'max-client' | 'max-server'>> = {
  convex: 'max-convex',
  client: 'max-client',
  server: 'max-server',
}

/** The flags as run options, or why they are refused: a bad `--only`, a bad size, a budget for a half that is not measured. */
function readOptions(args: Record<string, unknown>): AnalyzeOptions | { refusal: string } {
  const only = args.only as string | undefined
  if (only !== undefined && only !== 'convex' && only !== 'nuxt') return { refusal: `--only takes convex or nuxt, not "${only}".` }
  const halves = halvesOf(only)
  const limits: Partial<Record<BundleId, number>> = {}
  for (const bundle of Object.keys(FLAG_OF_BUNDLE) as BundleId[]) {
    const given = args[FLAG_OF_BUNDLE[bundle]] as string | undefined
    if (given === undefined) continue
    const bytes = parseSize(given)
    if (bytes === null) return { refusal: `${BUDGET_FLAGS[bundle]} takes a size such as 8MB or 350kB, not "${given}".` }
    const half = bundle === 'convex' ? 'convex' : 'nuxt'
    if (!halves.includes(half)) return { refusal: `${BUDGET_FLAGS[bundle]} needs the ${half === 'nuxt' ? 'Nuxt build' : 'Convex bundle'}: drop --only ${only}.` }
    limits[bundle] = bytes
  }
  return { ...only ? { only } : {}, limits }
}

export const analyze = withContract('analyze', {
  sideEffects: ['reads only'],
  json: '`{ version, ranAt, bundles: [{ id, title, bytes, gzipBytes, sourceMapBytes, parts, packages, shares, insights, notes }], budgets: [{ bundle, flag, limit, bytes, over, grew }], failures: [{ half, message }] }`: `id` is `convex`, `client` or `server`, and `bytes` is the code without source maps; progress goes to stderr',
  exitCodes: {
    0: 'measured, and within every budget given',
    1: 'a bundle is over its budget, `backend/_generated/` is missing, a build failed, or a flag was refused',
  },
}, defineCommand({
  meta: { name: 'analyze', description: 'Measure the backend\'s Convex bundle and the Nuxt app\'s client and server bundles: the largest packages, the share nuxt-backend and your code bring, and the insights that would shrink them. --max-convex, --max-client and --max-server fail a bundle over its budget' },
  args: {
    'cwd': { type: 'string', description: 'Project directory', default: '.' },
    'only': { type: 'string', description: 'Measure one half: convex (seconds, no Nuxt build) or nuxt' },
    'max-convex': { type: 'string', description: 'Fail when the Convex bundle\'s code, without source maps, is larger (8MB, 500kB)' },
    'max-client': { type: 'string', description: 'Fail when the Nuxt client bundle is larger' },
    'max-server': { type: 'string', description: 'Fail when the Nuxt server bundle is larger' },
    'json': { type: 'boolean', description: 'Print the report as one JSON document; progress goes to stderr', default: false },
  },
  async run({ args }) {
    const options = readOptions(args)
    if ('refusal' in options) {
      console.error(`[nuxt-backend] analyze refused: ${options.refusal}`)
      process.exitCode = 1
      return
    }
    const rootDir = resolve(process.cwd(), args.cwd)
    const print = progress(args.json)
    const report = await runAnalyze(rootDir, options, { print: line => console.error(line) })

    if (args.json) console.log(JSON.stringify(report, null, 2))
    else print(formatReport(report).join('\n'))

    const over = budgetFailures(report)
    for (const line of over) console.error(`[nuxt-backend] over budget: ${line}`)
    if (over.length > 0 || report.failures.length > 0) process.exitCode = 1
    else if (!args.json && options.limits && Object.keys(options.limits).length > 0) {
      print(`[nuxt-backend] every bundle is within its budget (${Object.entries(options.limits).map(([bundle, bytes]) => `${bundle} ${formatSize(bytes)}`).join(', ')})`)
    }
  },
}))
