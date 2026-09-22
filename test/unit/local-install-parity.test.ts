import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENV_EXAMPLE } from '../../src/cli/main'
import { BACKEND_FILE_TEMPLATES, LOCAL_BACKEND_FILE_TEMPLATES, SCHEMA_TABLE_GROUPS } from '../../src/templates'
import { COMPONENT_MODULE_EXPORTS, SCHEMA_EXPORTS } from '../../src/templates.generated'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const advancedBackend = join(rootDir, 'examples/advanced/backend')
const minimalBackend = join(rootDir, 'examples/minimal/backend')

/**
 * Files of examples/advanced/backend that deliberately differ from the
 * local-install template (each must exist, differ, and carry a
 * `// CUSTOMIZATION:` marker) — and why.
 */
const CUSTOMIZED: Record<string, string> = {
  'convex.config.ts': 'extra APP_WEBHOOK_TAG env var, aggregate left unmounted',
  'auth.ts': 'custom invitation path and email templates',
  'http.ts': 'custom webhook paths (/hooks/*)',
  'billing.ts': 'explicit billing config, an order.paid hook, a custom gift email',
  'workflows.ts': 'hand-rolled workflow.define instead of defineEmailSequence',
  'components/backend/schema.ts': 'extra component-owned loginAudit table',
}

/** App files examples/advanced/backend adds beyond the scaffold. */
const EXTRA = [
  // App-level schema: the `orders` table written by the order.paid hook.
  'schema.ts',
]

/** Component sources, loaded lazily so a failing module fails only its test. */
const componentModules = import.meta.glob('../../src/convex/components/backend/*.ts')

function importComponentModule(name: string) {
  const loader = componentModules[`../../src/convex/components/backend/${name}.ts`]
  if (!loader) throw new Error(`no component module ${name}.ts`)
  return loader() as Promise<Record<string, unknown>>
}

/** Every file under `dir` (posix paths relative to it), skipping `_generated`. */
function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === '_generated') return []
      const path = `${prefix}${entry.name}`
      return entry.isDirectory() ? listFiles(join(dir, entry.name), `${path}/`) : [path]
    })
    .sort()
}

/** The `export { … } from '…'` list of a thin re-export file. */
function reexportList(source: string) {
  const match = source.match(/export \{([^}]*)\} from '([^']+)'/)
  if (!match) throw new Error(`no re-export list in:\n${source}`)
  const names = match[1]!.split(',').map(name => name.trim()).filter(Boolean)
  return { names, specifier: match[2]! }
}

const tableGroups = SCHEMA_EXPORTS.filter(name => name === 'tables' || name.endsWith('Tables'))

describe('generated component export lists', () => {
  // The lists in src/templates.generated.ts are what the local scaffold
  // re-exports; each must name exactly what the component module exports.
  for (const [name, names] of Object.entries(COMPONENT_MODULE_EXPORTS)) {
    it(`${name}.ts exports exactly COMPONENT_MODULE_EXPORTS.${name}`, async () => {
      const module = await importComponentModule(name)
      expect(Object.keys(module).sort()).toEqual([...names])
    })
  }

  it('schema.ts exports exactly SCHEMA_EXPORTS (plus its default)', async () => {
    const module = await importComponentModule('schema')
    expect(Object.keys(module).filter(key => key !== 'default').sort()).toEqual([...SCHEMA_EXPORTS])
  })

  it('SCHEMA_TABLE_GROUPS covers every packaged table group', () => {
    // The local schema.ts spreads these — a new `*Tables` export in the
    // package must be added there (in the package's spread order).
    expect([...SCHEMA_TABLE_GROUPS].sort()).toEqual([...tableGroups].sort())
  })
})

describe('local-install templates', () => {
  for (const [name, names] of Object.entries(COMPONENT_MODULE_EXPORTS)) {
    it(`components/backend/${name}.ts re-exports the generated list`, () => {
      const template = LOCAL_BACKEND_FILE_TEMPLATES[`components/backend/${name}.ts`]
      expect(template, `no local template for component module ${name}`).toBeDefined()
      const { names: listed, specifier } = reexportList(template!)
      expect(specifier).toBe(`nuxt-backend/component/${name}`)
      expect(listed).toEqual([...names])
    })
  }

  it('components/backend/schema.generated.ts re-exports every schema export', () => {
    const { names, specifier } = reexportList(LOCAL_BACKEND_FILE_TEMPLATES['components/backend/schema.generated.ts']!)
    expect(specifier).toBe('nuxt-backend/component/schema')
    expect(names).toEqual([...SCHEMA_EXPORTS])
  })

  it('components/backend/schema.ts composes every packaged table group', () => {
    const schema = LOCAL_BACKEND_FILE_TEMPLATES['components/backend/schema.ts']!
    expect(schema).toContain(`import { ${[...SCHEMA_TABLE_GROUPS].sort().join(', ')} } from './schema.generated'`)
    expect(schema).toContain('export const authSchema = defineSchema(tables)')
    const spread = [...schema.matchAll(/^ {2}\.\.\.(\w+),$/gm)].map(match => match[1])
    expect(spread).toEqual([...SCHEMA_TABLE_GROUPS])
  })

  it('is the default set plus the component files', () => {
    for (const file of Object.keys(BACKEND_FILE_TEMPLATES)) {
      expect(LOCAL_BACKEND_FILE_TEMPLATES, `local set lacks ${file}`).toHaveProperty(file)
    }
    const localOnly = Object.keys(LOCAL_BACKEND_FILE_TEMPLATES).filter(file => !(file in BACKEND_FILE_TEMPLATES))
    expect(localOnly.every(file => file.startsWith('components/backend/'))).toBe(true)
  })
})

describe('examples/advanced (local install)', () => {
  it('matches the local-install templates byte for byte, except the marked customizations', () => {
    for (const [file, content] of Object.entries(LOCAL_BACKEND_FILE_TEMPLATES)) {
      const target = join(advancedBackend, file)
      expect(existsSync(target), `examples/advanced/backend/${file} is missing`).toBe(true)
      const actual = readFileSync(target, 'utf-8')
      if (file in CUSTOMIZED) {
        expect(actual, `${file} is listed as customized (${CUSTOMIZED[file]}) but equals the template`).not.toBe(content)
        expect(actual, `${file} must mark its customization`).toContain('// CUSTOMIZATION:')
      }
      else {
        expect(actual, `examples/advanced/backend/${file} drifted from the local template`).toBe(content)
      }
    }
  })

  it('lists only template files as customized', () => {
    for (const file of Object.keys(CUSTOMIZED)) {
      expect(LOCAL_BACKEND_FILE_TEMPLATES, `${file} is not a template`).toHaveProperty(file)
    }
  })

  it('has no files beyond the templates and the allowlisted extras', () => {
    const unexpected = listFiles(advancedBackend)
      .filter(file => !(file in LOCAL_BACKEND_FILE_TEMPLATES) && !EXTRA.includes(file))
    expect(unexpected).toEqual([])
    for (const file of EXTRA) {
      expect(existsSync(join(advancedBackend, file)), `allowlisted extra ${file} is missing`).toBe(true)
    }
  })
})

describe('examples/minimal (default install)', () => {
  it('backend files are byte-identical to the scaffold templates', () => {
    // The minimal example's promise is "everything here is generated" — any
    // template change must be regenerated into it, and this catches drift.
    for (const [file, content] of Object.entries(BACKEND_FILE_TEMPLATES)) {
      const target = join(minimalBackend, file)
      expect(readFileSync(target, 'utf-8'), `examples/minimal/backend/${file} drifted from the template`).toBe(content)
    }
  })

  it('has no files beyond the templates', () => {
    expect(listFiles(minimalBackend).filter(file => !(file in BACKEND_FILE_TEMPLATES))).toEqual([])
  })
})

describe('examples/*/.env.example', () => {
  // The file a `nuxi init -t` clone ships is the file `nuxt-backend init`
  // would write: one template, quoted verbatim, so the two can never describe
  // the environment differently.
  it.each(['minimal', 'advanced'])('examples/%s ships the template init writes', (example) => {
    expect(readFileSync(join(rootDir, 'examples', example, '.env.example'), 'utf-8')).toBe(ENV_EXAMPLE)
  })
})
