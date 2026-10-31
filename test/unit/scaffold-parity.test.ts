import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENV_EXAMPLE } from '../../src/setup'
import { BACKEND_FILE_TEMPLATES, DEFAULT_LAYOUT_TEMPLATE } from '../../src/templates'
import { backendPathsOf, PATHS_FILE, renderPathsFile } from '../../src/paths-file'

const rootDir = fileURLToPath(new URL('../..', import.meta.url))
const advancedBackend = join(rootDir, 'examples/advanced/backend')
const starterBackend = join(rootDir, 'templates/starter/backend')
const panelsBackend = join(rootDir, 'templates/panels/backend')

/**
 * Files of templates/panels/backend that the tutorial changes (each must
 * exist and differ from the scaffold), and the part that changes it. The
 * rest stay what `nuxt-backend init` writes, so a reader's app and the
 * template agree file by file.
 */
const PANELS_CUSTOMIZED: Record<string, string> = {
  'billing.catalog.ts': 'part 2: the credits meter, the Free and Studio plans and two packs',
  'ai.ts': 'parts 3 and 4: moderation and content credentials; the demo\'s smaller spend limit',
  'admin.ts': 'part 3: the Reports tab for strips',
  'account.ts': 'part 6: the strips join an account\'s export and erasure',
  'email.ts': 'part 5: Panels\' brand, theme and topic',
  'notifications.ts': 'part 5: the strip_ready notification',
  'flags.ts': 'the ideaExamples experiment on the strips page',
  'auth.ts': 'the public demo: a sandbox deployment admits generated sandbox identities only',
}

/** The tutorial's own backend files, beyond the scaffold. */
const PANELS_EXTRA = ['schema.ts', 'strips.ts', 'strips.test.ts', 'storage.ts', 'jobs.ts', 'routes.ts', 'demo.ts', 'crons.ts']

/**
 * Files of examples/advanced/backend that deliberately differ from the
 * scaffold (each must exist, differ, and carry a `// CUSTOMIZATION:` marker)
 * — and why.
 */
const CUSTOMIZED: Record<string, string> = {
  'convex.config.ts': 'extra APP_WEBHOOK_TAG env var, aggregate left unmounted',
  'email.ts': 'restyled sign-in, invitation and gift emails',
  'http.ts': 'custom webhook paths (/hooks/*)',
  'billing.ts': 'explicit billing config and an order.paid hook',
  'workflows.ts': 'hand-rolled workflow.define instead of defineEmailSequence',
}

/**
 * The paths file the module writes from nuxt.config: the example moves its
 * invitation page to /join there (`backend.pages.acceptInvitation`), and
 * nothing else names the path.
 */
const ADVANCED_PATHS = { pages: { acceptInvitation: '/join' } }

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
  it('ships the layout init writes beside its root component', () => {
    expect(readFileSync(join(rootDir, 'templates/starter/app/layouts/default.vue'), 'utf-8')).toBe(DEFAULT_LAYOUT_TEMPLATE)
    expect(readFileSync(join(rootDir, 'templates/starter/app/app.vue'), 'utf-8')).toContain('<NuxtLayout>')
  })

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

describe('templates/panels', () => {
  it('keeps every scaffold file, byte for byte, but the ones the tutorial changes', () => {
    for (const [file, content] of Object.entries(BACKEND_FILE_TEMPLATES)) {
      const target = join(panelsBackend, file)
      expect(existsSync(target), `templates/panels/backend/${file} is missing`).toBe(true)
      const actual = readFileSync(target, 'utf-8')
      if (file in PANELS_CUSTOMIZED) expect(actual, `${file} is listed as changed (${PANELS_CUSTOMIZED[file]}) but equals the template`).not.toBe(content)
      else expect(actual, `templates/panels/backend/${file} drifted from the template`).toBe(content)
    }
  })

  it('lists only template files as changed', () => {
    for (const file of Object.keys(PANELS_CUSTOMIZED)) expect(BACKEND_FILE_TEMPLATES, `${file} is not a template`).toHaveProperty(file)
  })

  it('has no files beyond the templates and the tutorial\'s own', () => {
    expect(listFiles(panelsBackend).filter(file => !(file in BACKEND_FILE_TEMPLATES) && !PANELS_EXTRA.includes(file))).toEqual([])
    for (const file of PANELS_EXTRA) expect(existsSync(join(panelsBackend, file)), `${file} is missing`).toBe(true)
  })
})

describe('the scaffold\'s onboarding sequence', () => {
  // test/convex-component/email-sequence.test.ts runs a sequence of this
  // shape; these hold the scaffold to it, in every mirror at once.
  const workflows = BACKEND_FILE_TEMPLATES['workflows.ts']!
  const auth = BACKEND_FILE_TEMPLATES['auth.ts']!

  it('is started with the account\'s id, so each email reads the account again', () => {
    expect(workflows).toContain('export const onSignup = defineEmailSequence(')
    expect(workflows).toMatch(/args: \{ userId: v\.string\(\)/)
    expect(auth).toMatch(/workflow\.start\(ctx, internal\.workflows\.onSignup, \{\s*userId: user\.id,/)
  })

  it('starts after the packaged welcome, never with a second one at sign-up', () => {
    const delays = [...workflows.matchAll(/^ *after: ([\d *]+),/gm)].map(([, expression]) =>
      expression!.split('*').reduce((product, factor) => product * Number(factor.trim()), 1))
    expect(delays.length).toBeGreaterThan(0)
    expect(delays[0]).toBeGreaterThan(0)
  })
})

describe('examples/advanced', () => {
  it('matches the scaffold templates byte for byte, except the marked customizations', () => {
    for (const [file, content] of Object.entries(BACKEND_FILE_TEMPLATES)) {
      const target = join(advancedBackend, file)
      expect(existsSync(target), `examples/advanced/backend/${file} is missing`).toBe(true)
      const actual = readFileSync(target, 'utf-8')
      if (file === PATHS_FILE) {
        expect(actual, `examples/advanced/backend/${file} is not what the module writes from its nuxt.config`).toBe(renderPathsFile(backendPathsOf(ADVANCED_PATHS)))
      }
      else if (file in CUSTOMIZED) {
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
  it.each(['templates/starter', 'templates/panels', 'examples/advanced'])('%s ships the template init writes', (app) => {
    expect(readFileSync(join(rootDir, app, '.env.example'), 'utf-8')).toBe(ENV_EXAMPLE)
  })
})
