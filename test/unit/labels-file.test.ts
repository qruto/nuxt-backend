import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as magicast from 'magicast'
import { brandSourceDirs } from '../../src/brand-file'
import { appLabelsOf, labelsOfAppConfig, readAppLabels, renderLabelsFile } from '../../src/labels-file'
import { labelsFileFinding, syncLabelsFile } from '../../src/labels-sync'
import { registerAppConfigFiles } from '../../src/nuxt/brand'
import { logger } from '../../src/nuxt/logger'

// The labels app.config sets (`backend.labels`), carried into the functions
// directory as labels.generated.ts, which the scaffold's email.ts passes to
// setupEmail: the emails, notification emails and push say what the pages
// say, from copy written once.

describe('reading the labels from app.config', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'labels-read-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads the literals of defineAppConfig, and leaves an expression out', () => {
    const text = `export default defineAppConfig({
  backend: {
    brand: { name: 'Panels' },
    labels: {
      notifications: { strip_ready: { title: 'Your strip is ready', body: \`Open it.\` } },
      auth: { title: process.env.TITLE, ['computed']: 'x', sendCode: 'Get my code' },
      'credits': { unit: { one: 'coin', other: 'coins' } },
    },
  },
})`
    expect(labelsOfAppConfig(magicast, text, join(dir, 'app.config.ts'))).toEqual({
      notifications: { strip_ready: { title: 'Your strip is ready', body: 'Open it.' } },
      auth: { sendCode: 'Get my code' },
      credits: { unit: { one: 'coin', other: 'coins' } },
    })
  })

  it('follows a const of the same file, a spread, and `as const` or `satisfies`', () => {
    const text = `const errorLabels: Record<string, string> = { forbidden_not_owner: 'That comic belongs to someone else.' }
const kinds = { comic_ready: { title: 'Printed!' } } as const
export default defineAppConfig({
  backend: {
    labels: {
      errors: errorLabels,
      notifications: { ...kinds, emailNote: 'Choose alerts under Account.' } satisfies object,
    },
  },
})`
    expect(labelsOfAppConfig(magicast, text, join(dir, 'app.config.ts'))).toEqual({
      errors: { forbidden_not_owner: 'That comic belongs to someone else.' },
      notifications: { comic_ready: { title: 'Printed!' }, emailNote: 'Choose alerts under Account.' },
    })
  })

  it('follows a named or default import of a relative file, and stops at a package or a missing file', () => {
    mkdirSync(join(dir, 'backend'))
    mkdirSync(join(dir, 'app'))
    writeFileSync(join(dir, 'backend', 'notificationCopy.ts'), `import { purse } from './purse'\nexport const notificationCopy = { comic_ready: { title: 'Your comic is printed!' }, billing: { credits_low: { bodyYours: purse } } }\n`)
    writeFileSync(join(dir, 'backend', 'purse.ts'), `export const purse = '{balance} coins left in your purse.'\n`)
    writeFileSync(join(dir, 'app', 'activation.ts'), `export default { firstComic: 'Print your first comic' }\n`)
    const text = `import { notificationCopy as copy } from '../backend/notificationCopy'
import activation from './activation'
import { shared } from 'some-package'
import { gone } from './gone'
export default defineAppConfig({ backend: { labels: { notifications: copy, activation, errors: shared, auth: gone } } })`
    expect(labelsOfAppConfig(magicast, text, join(dir, 'app', 'app.config.ts'))).toEqual({
      notifications: { comic_ready: { title: 'Your comic is printed!' }, billing: { credits_low: { bodyYours: '{balance} coins left in your purse.' } } },
      activation: { firstComic: 'Print your first comic' },
    })
  })

  it('reads no value through a type import, a namespace import, a JSON file, or more than three files deep', () => {
    writeFileSync(join(dir, 'copy.json'), '{ "title": "From JSON" }')
    writeFileSync(join(dir, 'one.ts'), `import { two } from './two'\nexport const one = { title: 'One', deep: two }\n`)
    writeFileSync(join(dir, 'two.ts'), `import { three } from './three'\nexport const two = { title: 'Two', deep: three }\n`)
    writeFileSync(join(dir, 'three.ts'), `import { four } from './four'\nexport const three = { title: 'Three', deep: four }\n`)
    writeFileSync(join(dir, 'four.ts'), `export const four = { title: 'Four' }\n`)
    const text = `import type { Kinds } from './kinds'
import * as everything from './one'
import copy from './copy.json'
import { one } from './one'
export default defineAppConfig({ backend: { labels: { auth: everything, gift: copy, notifications: one, errors: Kinds as never, ai: { ...one, title: 'Own' } } } })`
    expect(labelsOfAppConfig(magicast, text, join(dir, 'app.config.ts'))).toEqual({
      notifications: { title: 'One', deep: { title: 'Two', deep: { title: 'Three' } } },
      ai: { title: 'Own', deep: { title: 'Two', deep: { title: 'Three' } } },
    })
  })

  it('keeps the app\'s own shape where a layer writes another, and reads nothing when the config does not load', async () => {
    mkdirSync(join(dir, 'app'))
    mkdirSync(join(dir, 'layer'))
    writeFileSync(join(dir, 'app', 'app.config.ts'), `export default defineAppConfig({ backend: { labels: { auth: { title: 'Mine' } } } })`)
    writeFileSync(join(dir, 'layer', 'app.config.ts'), `export default defineAppConfig({ backend: { labels: { auth: { title: { nested: 'x' } }, gift: { claim: 'Take it' } } } })`)
    expect(await readAppLabels([join(dir, 'app'), join(dir, 'layer')])).toEqual({ auth: { title: 'Mine' }, gift: { claim: 'Take it' } })
    expect(await appLabelsOf(null)).toBeNull()
    expect(await appLabelsOf({ srcDir: join(dir, 'app') })).toEqual({ auth: { title: 'Mine' } })
    expect(await appLabelsOf({ _layers: 'not a list' } as never)).toBeNull()
  })

  it('reads no key that would reach a prototype, so app.config cannot pollute one', async () => {
    const text = `export default defineAppConfig({
  backend: {
    labels: {
      __proto__: { polluted: 'x' },
      auth: { '__proto__': { polluted: 'y' }, constructor: 'x', prototype: 'y', title: 'Hi' },
    },
  },
})`
    const read = labelsOfAppConfig(magicast, text, join(dir, 'app.config.ts'))
    expect(read).toEqual({ auth: { title: 'Hi' } })
    expect(Object.getPrototypeOf(read)).toBe(Object.prototype)
    writeFileSync(join(dir, 'app.config.ts'), text)
    const merged = await readAppLabels([dir, dir])
    expect(merged).toEqual({ auth: { title: 'Hi' } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
  })

  it('reads nothing from a file that does not parse or sets no labels', () => {
    expect(labelsOfAppConfig(magicast, 'export default defineAppConfig({ ui: {} })', join(dir, 'app.config.ts'))).toEqual({})
    expect(labelsOfAppConfig(magicast, 'export default {', join(dir, 'app.config.ts'))).toEqual({})
  })

  it('lets the app\'s own label win over a layer\'s, key by key', async () => {
    mkdirSync(join(dir, 'app', 'app'), { recursive: true })
    mkdirSync(join(dir, 'layer'))
    writeFileSync(join(dir, 'app', 'app', 'app.config.ts'), `export default defineAppConfig({ backend: { labels: { auth: { title: 'Sign in to Panels' } } } })`)
    writeFileSync(join(dir, 'layer', 'app.config.ts'), `export default defineAppConfig({ backend: { labels: { auth: { title: 'Layer', sendCode: 'Send' }, gift: { claim: 'Take it' } } } })`)
    const dirs = brandSourceDirs({ rootDir: join(dir, 'app'), _layers: [{ cwd: join(dir, 'app'), config: { rootDir: join(dir, 'app'), srcDir: join(dir, 'app', 'app') } }, { cwd: join(dir, 'layer'), config: { rootDir: join(dir, 'layer') } }] })
    expect(await readAppLabels(dirs)).toEqual({ auth: { title: 'Sign in to Panels', sendCode: 'Send' }, gift: { claim: 'Take it' } })
  })
})

describe('the generated file', () => {
  let rootDir: string
  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'labels-file-'))
  })
  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('renders the labels as an object literal, quoted for the app\'s linter, and none as an empty object', () => {
    const text = renderLabelsFile({ notifications: { 'strip-ready': { title: 'Kai\'s strip is ready' } } })
    expect(text).toContain(`export const labels = {\n  notifications: {\n    'strip-ready': {\n      title: 'Kai\\'s strip is ready',\n    },\n  },\n}\n`)
    expect(renderLabelsFile({})).toContain('export const labels = {}\n')
  })

  it('is written once into the functions directory, and doctor names one missing or out of date', () => {
    expect(syncLabelsFile(rootDir, {})).toBe('no-functions-dir')
    expect(labelsFileFinding(rootDir, {})).toEqual([])
    mkdirSync(join(rootDir, 'backend'))
    expect(labelsFileFinding(rootDir, { auth: { title: 'Hi' } })).toMatchObject([{ id: 'labels-file', status: 'warn', message: expect.stringContaining('backend/labels.generated.ts is missing') }])
    expect(syncLabelsFile(rootDir, { auth: { title: 'Hi' } })).toBe('written')
    expect(syncLabelsFile(rootDir, { auth: { title: 'Hi' } })).toBe('unchanged')
    expect(readFileSync(join(rootDir, 'backend', 'labels.generated.ts'), 'utf-8')).toContain('title: \'Hi\'')
    expect(labelsFileFinding(rootDir, { auth: { title: 'Hi' } })).toMatchObject([{ id: 'labels-file', status: 'pass' }])
    expect(labelsFileFinding(rootDir, { auth: { title: 'Hello' } })).toMatchObject([{ id: 'labels-file', status: 'warn', message: expect.stringContaining('out of date'), fixHint: expect.stringContaining('doctor --fix') }])
    expect(labelsFileFinding(rootDir, null)).toEqual([])
  })

  it('is what the scaffold, the starter and Panels ship: the labels their app.config sets', async () => {
    const root = join(import.meta.dirname, '../..')
    expect(readFileSync(join(root, 'templates/starter/backend/labels.generated.ts'), 'utf-8')).toBe(renderLabelsFile({}))
    expect(readFileSync(join(root, 'templates/panels/backend/labels.generated.ts'), 'utf-8')).toBe(renderLabelsFile(await readAppLabels([join(root, 'templates/panels/app')])))
  })
})

describe('the module', () => {
  let rootDir: string
  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'labels-module-'))
    mkdirSync(join(rootDir, 'app'))
    mkdirSync(join(rootDir, 'backend'))
    vi.spyOn(logger, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(rootDir, { recursive: true, force: true })
  })

  it('writes the brand and labels files on start, and the labels again when a script changes', async () => {
    const hooks: Record<string, (...args: unknown[]) => Promise<void> | void> = {}
    const hook = (name: string, run: (...args: unknown[]) => Promise<void>) => {
      hooks[name] = run
    }
    const nuxt = { options: { rootDir, srcDir: join(rootDir, 'app'), test: false, _layers: [] }, hook }
    const config = (title: string) => writeFileSync(join(rootDir, 'app', 'app.config.ts'), `export default defineAppConfig({ backend: { brand: { name: 'Panels' }, labels: { auth: { title: '${title}' } } } })\n`)
    config('Sign in to Panels')
    registerAppConfigFiles(nuxt as never)
    await hooks['modules:done']!()
    const labels = () => readFileSync(join(rootDir, 'backend', 'labels.generated.ts'), 'utf-8')
    expect(labels()).toBe(renderLabelsFile({ auth: { title: 'Sign in to Panels' } }))
    expect(readFileSync(join(rootDir, 'backend', 'brand.generated.ts'), 'utf-8')).toContain('name: \'Panels\'')
    config('Welcome back')
    // A page or a generated file changing is no reason to read app.config again.
    await hooks['builder:watch']!('change', 'pages/index.vue')
    await hooks['builder:watch']!('change', 'backend/labels.generated.ts')
    expect(labels()).toContain('Sign in to Panels')
    await hooks['builder:watch']!('change', 'app.config.ts')
    expect(labels()).toBe(renderLabelsFile({ auth: { title: 'Welcome back' } }))
  })

  it('writes nothing under a test runner', () => {
    const hook = vi.fn()
    registerAppConfigFiles({ options: { rootDir, test: true }, hook } as never)
    expect(hook).not.toHaveBeenCalled()
  })
})
