import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENV_EXAMPLE } from '../../src/cli/main'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const advancedBackend = join(rootDir, 'examples/advanced/backend')
const starterBackend = join(rootDir, 'templates/starter/backend')

/**
 * Files of examples/advanced/backend that deliberately differ from the
 * scaffold (each must exist, differ, and carry a `// CUSTOMIZATION:` marker)
 * — and why.
 */
const CUSTOMIZED: Record<string, string> = {
  'convex.config.ts': 'extra APP_WEBHOOK_TAG env var, aggregate left unmounted',
  'auth.ts': 'custom invitation path',
  'email.ts': 'restyled sign-in, invitation and gift emails',
  'http.ts': 'custom webhook paths (/hooks/*)',
  'billing.ts': 'explicit billing config and an order.paid hook',
  'workflows.ts': 'hand-rolled workflow.define instead of defineEmailSequence',
}

/** App files examples/advanced/backend adds beyond the scaffold. */
const EXTRA = [
  // App-level schema: the `orders` table written by the order.paid hook.
  'schema.ts',
]

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

describe('templates/starter', () => {
  it('backend files are byte-identical to the scaffold templates', () => {
    // The starter's promise is "everything here is generated" — any
    // template change must be regenerated into it, and this catches drift.
    for (const [file, content] of Object.entries(BACKEND_FILE_TEMPLATES)) {
      const target = join(starterBackend, file)
      expect(readFileSync(target, 'utf-8'), `templates/starter/backend/${file} drifted from the template`).toBe(content)
    }
  })

  it('has no files beyond the templates', () => {
    expect(listFiles(starterBackend).filter(file => !(file in BACKEND_FILE_TEMPLATES))).toEqual([])
  })
})

describe('examples/advanced', () => {
  it('matches the scaffold templates byte for byte, except the marked customizations', () => {
    for (const [file, content] of Object.entries(BACKEND_FILE_TEMPLATES)) {
      const target = join(advancedBackend, file)
      expect(existsSync(target), `examples/advanced/backend/${file} is missing`).toBe(true)
      const actual = readFileSync(target, 'utf-8')
      if (file in CUSTOMIZED) {
        expect(actual, `${file} is listed as customized (${CUSTOMIZED[file]}) but equals the template`).not.toBe(content)
        expect(actual, `${file} must mark its customization`).toContain('// CUSTOMIZATION:')
      }
      else {
        expect(actual, `examples/advanced/backend/${file} drifted from the template`).toBe(content)
      }
    }
  })

  it('lists only template files as customized', () => {
    for (const file of Object.keys(CUSTOMIZED)) {
      expect(BACKEND_FILE_TEMPLATES, `${file} is not a template`).toHaveProperty(file)
    }
  })

  it('has no files beyond the templates and the allowlisted extras', () => {
    const unexpected = listFiles(advancedBackend)
      .filter(file => !(file in BACKEND_FILE_TEMPLATES) && !EXTRA.includes(file))
    expect(unexpected).toEqual([])
    for (const file of EXTRA) {
      expect(existsSync(join(advancedBackend, file)), `allowlisted extra ${file} is missing`).toBe(true)
    }
  })
})

describe('.env.example in the templates and examples', () => {
  // The file an app created from a template ships is the file
  // `nuxt-backend init` would write: one template, quoted verbatim, so the two
  // can never describe the environment differently.
  it.each(['templates/starter', 'examples/advanced', 'examples/playground'])('%s ships the template init writes', (app) => {
    expect(readFileSync(join(rootDir, app, '.env.example'), 'utf-8')).toBe(ENV_EXAMPLE)
  })
})
