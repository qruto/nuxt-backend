import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { convexConfigFinding, fixConvexConfig, readConvexConfigDrift } from '../../src/convex-config'
import { readBackendHealth } from '../../src/devtools/health'
import { BACKEND_FILE_TEMPLATES } from '../../src/templates'

// The convex-config check and its fix, over an app's own files. What the
// scaffold mounts and routes is read from its templates, so each case
// starts from the template and takes something away — including the shapes
// a real file takes: a BOM, CRLF line ends, comments, branches, a syntax
// error.

const CONFIG = BACKEND_FILE_TEMPLATES['convex.config.ts']!
const HTTP = BACKEND_FILE_TEMPLATES['http.ts']!

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nuxt-backend-convex-config-'))
  mkdirSync(join(root, 'backend'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function write(file: string, contents: string) {
  writeFileSync(join(root, 'backend', file), contents)
}

function read(file: string) {
  return readFileSync(join(root, 'backend', file), 'utf-8')
}

/** The template without one mount: its import line and its `app.use` line. */
function withoutMount(code: string, name: string) {
  return code.split('\n').filter(line => !line.startsWith(`import ${name} from`) && line !== `app.use(${name})`).join('\n')
}

/** Install a stand-in `@convex-dev/crons` in the app, as `npm install` would. */
function installCrons() {
  mkdirSync(join(root, 'node_modules/@convex-dev/crons'), { recursive: true })
  writeFileSync(join(root, 'node_modules/@convex-dev/crons/package.json'), '{ "name": "@convex-dev/crons", "version": "0.2.3" }\n')
}

/** A backend file that schedules jobs at runtime, so the optional crons component is needed. */
const DIGEST = 'import { Crons } from \'@convex-dev/crons\'\nimport { components } from \'./_generated/api\'\nexport const schedules = new Crons(components.crons)\n'

describe('convex-config', () => {
  it('passes for the scaffold as it is', async () => {
    write('convex.config.ts', CONFIG)
    write('http.ts', HTTP)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
    expect(await fixConvexConfig(root)).toEqual([])
  })

  it('warns about a mount the scaffold has and the app lacks, and the fix restores the scaffold\'s file', async () => {
    write('convex.config.ts', withoutMount(withoutMount(CONFIG, 'shardedCounter'), 'workflow'))
    write('http.ts', HTTP)
    const reported = await convexConfigFinding(root)
    expect(reported).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('doctor --fix') })
    expect(reported.message).toContain('does not mount shardedCounter, workflow')
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: mounted shardedCounter, workflow'])
    expect(read('convex.config.ts')).toBe(CONFIG)
    // Written through a temporary file, which is gone.
    expect(readdirSync(join(root, 'backend')).filter(file => file.endsWith('.tmp'))).toEqual([])
  })

  it('fails when a backend file already uses a component it does not mount', async () => {
    write('convex.config.ts', withoutMount(CONFIG, 'rateLimiter'))
    write('http.ts', HTTP)
    write('counts.ts', 'import { components } from \'./_generated/api\'\nexport const counter = components.rateLimiter\n')
    const reported = await convexConfigFinding(root)
    expect(reported.status).toBe('fail')
    expect(reported.message).toContain('rateLimiter is needed by a backend file')
  })

  it.each([
    ['setupAi', 'nuxt-backend/ai', 'persistentTextStreaming'],
    ['setupBilling', 'nuxt-backend/billing', 'polar'],
    ['setupRateLimiter', 'nuxt-backend/rate-limit', 'rateLimiter'],
    ['setupWorkflows', 'nuxt-backend/workflows', 'workflow'],
  ])('fails when a backend file calls %s without the mount it reads', async (helper, from, mount) => {
    write('convex.config.ts', withoutMount(CONFIG, mount))
    write('http.ts', HTTP)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'warn' })
    // The helper reads the mount off the `components` object it is passed.
    write('uses.ts', `import { ${helper} } from '${from}'\nimport { components } from './_generated/api'\nexport const used = ${helper}(components)\n`)
    const reported = await convexConfigFinding(root)
    expect(reported.status).toBe('fail')
    expect(reported.message).toContain(`${mount} is needed by a backend file`)
    expect(await fixConvexConfig(root)).toEqual([`backend/convex.config.ts: mounted ${mount}`])
    expect(read('convex.config.ts')).toBe(CONFIG)
  })

  it('expects the optional crons component only once a backend file imports Crons from it', async () => {
    installCrons()
    write('convex.config.ts', CONFIG)
    write('http.ts', HTTP)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
    write('digest.ts', DIGEST)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'fail', message: expect.stringContaining('does not mount crons') })
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: mounted crons'])
    const fixed = read('convex.config.ts')
    expect(fixed).toContain('import workpool from \'@convex-dev/workpool/convex.config\'\nimport crons from \'@convex-dev/crons/convex.config\'\n')
    expect(fixed).toContain('app.use(workpool)\napp.use(crons)\n')
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
  })

  it('keeps a BOM and CRLF line ends', async () => {
    write('convex.config.ts', `\uFEFF${withoutMount(CONFIG, 'shardedCounter').replace(/\n/g, '\r\n')}`)
    write('http.ts', HTTP)
    await fixConvexConfig(root)
    expect(read('convex.config.ts')).toBe(`\uFEFF${CONFIG.replace(/\n/g, '\r\n')}`)
  })

  it('keeps a comment on the line it annotates', async () => {
    write('convex.config.ts', withoutMount(CONFIG, 'shardedCounter')
      .replace('app.use(rateLimiter)', 'app.use(rateLimiter) // counts')
      .replace('import rateLimiter from \'@convex-dev/rate-limiter/convex.config\'', 'import rateLimiter from \'@convex-dev/rate-limiter/convex.config\' // counts'))
    write('http.ts', HTTP)
    await fixConvexConfig(root)
    const fixed = read('convex.config.ts')
    expect(fixed).toContain('app.use(rateLimiter) // counts\napp.use(shardedCounter)\n')
    expect(fixed).toContain('import rateLimiter from \'@convex-dev/rate-limiter/convex.config\' // counts\nimport shardedCounter from \'@convex-dev/sharded-counter/convex.config\'\n')
  })

  it('counts a mount inside a branch as mounted', async () => {
    write('convex.config.ts', withoutMount(CONFIG, 'shardedCounter')
      .replace('app.use(rateLimiter)', 'app.use(rateLimiter)\nif (process.env.MIGRATE) {\n  app.use(shardedCounter)\n}')
      .replace('import rateLimiter', 'import shardedCounter from \'@convex-dev/sharded-counter/convex.config\'\nimport rateLimiter'))
    write('http.ts', HTTP)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
    expect(await fixConvexConfig(root)).toEqual([])
  })

  it('leaves alone a component mounted under the scaffold\'s name from another file, and says why', async () => {
    write('convex.config.ts', withoutMount(CONFIG, 'shardedCounter')
      .replace('import rateLimiter', 'import shardedCounter from \'./sharded-counter.config\'\nimport rateLimiter')
      .replace('app.use(rateLimiter)', 'app.use(rateLimiter)\napp.use(shardedCounter)'))
    write('http.ts', HTTP)
    const before = read('convex.config.ts')
    const reported = await convexConfigFinding(root)
    expect(reported.status).toBe('warn')
    expect(reported.message).toContain('shardedCounter is left alone')
    expect(reported.message).toContain('./sharded-counter.config')
    expect(await fixConvexConfig(root)).toEqual([])
    expect(read('convex.config.ts')).toBe(before)
  })

  it('leaves alone an import that is never mounted, and says why', async () => {
    write('convex.config.ts', CONFIG.replace('app.use(shardedCounter)\n', ''))
    write('http.ts', HTTP)
    expect((await convexConfigFinding(root)).message).toContain('imports it as shardedCounter but no `use(shardedCounter)` was found')
    expect(await fixConvexConfig(root)).toEqual([])
  })

  it('takes a scaffold mount marked as left out on purpose as it is', async () => {
    write('convex.config.ts', `${withoutMount(CONFIG, 'rateLimiter')}// nuxt-backend-unmounted: rateLimiter\n`)
    write('http.ts', HTTP)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
    expect(await fixConvexConfig(root)).toEqual([])
  })

  it('mounts on the defineApp variable, in the file\'s quotes and semicolons', async () => {
    write('convex.config.ts', [
      'import { defineApp } from "convex/server";',
      'import backend from "nuxt-backend/convex.config";',
      '',
      'const project = defineApp();',
      'project.use(backend);',
      '',
      'export default project;',
      '',
    ].join('\n'))
    write('http.ts', HTTP)
    await fixConvexConfig(root)
    const fixed = read('convex.config.ts')
    expect(fixed).toContain('import rateLimiter from "@convex-dev/rate-limiter/convex.config";')
    expect(fixed).toContain('project.use(workflow);\nproject.use(workpool);\n\nexport default project;')
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
  })

  it('picks another name when the scaffold\'s is taken', async () => {
    write('convex.config.ts', `${withoutMount(CONFIG, 'shardedCounter')}\nconst shardedCounter = 1\n`)
    write('http.ts', HTTP)
    await fixConvexConfig(root)
    expect(read('convex.config.ts')).toContain('import shardedCounter2 from \'@convex-dev/sharded-counter/convex.config\'')
    expect(read('convex.config.ts')).toContain('app.use(shardedCounter2)')
  })

  it('reports a file that does not parse, never crashes, and never writes it', async () => {
    const broken = `${withoutMount(CONFIG, 'shardedCounter')}\nconst = ;\n`
    write('convex.config.ts', broken)
    write('http.ts', HTTP)
    const reported = await convexConfigFinding(root)
    expect(reported.status).toBe('warn')
    expect(reported.message).toContain('Could not check the mounts and routes: backend/convex.config.ts')
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: left as it is — it does not parse'])
    expect(read('convex.config.ts')).toBe(broken)
    await expect(readBackendHealth(root)).resolves.toMatchObject({ mounts: [] })
  })

  it('adds a route group http.ts does not register, with its import, where the scaffold has them', async () => {
    write('convex.config.ts', CONFIG)
    write('http.ts', HTTP.replace('import { ai } from \'./ai\'\n', '').replace('  ai,\n', '').replace('  billing,\n', ''))
    const reported = await convexConfigFinding(root)
    expect(reported.message).toContain('passes no billing, ai to registerBackendRoutes')
    expect(await fixConvexConfig(root)).toEqual(['backend/http.ts: registered billing, ai'])
    expect(read('http.ts')).toBe(HTTP)
  })

  it('keeps a comment on a route group\'s line', async () => {
    write('convex.config.ts', CONFIG)
    write('http.ts', HTTP.replace('import { ai } from \'./ai\'\n', '').replace('  ai,\n', '').replace('  email,\n', '  email, // delivery events\n'))
    await fixConvexConfig(root)
    expect(read('http.ts')).toContain('  email, // delivery events\n  ai,\n})')
  })

  it('forwards an env name the scaffold forwards to the backend component, on the app\'s own name', async () => {
    const forwarded = '    MONITORING_DSN: app.env.MONITORING_DSN,\n'
    expect(CONFIG).toContain(forwarded)
    write('convex.config.ts', CONFIG.replace(forwarded, ''))
    write('http.ts', HTTP)
    expect(await readConvexConfigDrift(root)).toMatchObject({ missingForwards: ['MONITORING_DSN'] })
    const reported = await convexConfigFinding(root)
    expect(reported).toMatchObject({ status: 'warn', fixHint: expect.stringContaining('doctor --fix') })
    expect(reported.message).toContain('does not forward MONITORING_DSN to the backend component')
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: forwarded MONITORING_DSN'])
    expect(read('convex.config.ts')).toBe(CONFIG)
    // Another name for the app, and a mount missing too: both come back, the forward on that name.
    write('convex.config.ts', withoutMount(CONFIG.replace(forwarded, ''), 'workpool').replace(/\bapp\b/g, 'project'))
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: mounted workpool', 'backend/convex.config.ts: forwarded MONITORING_DSN'])
    expect(read('convex.config.ts')).toBe(CONFIG.replace(/\bapp\b/g, 'project'))
  })

  it('names a forward 0.2.0 removed, which the push fails on, and doctor --fix deletes the scaffold\'s own line', async () => {
    const stale = '    EMAIL_TEST_MODE: app.env.EMAIL_TEST_MODE,\n'
    write('convex.config.ts', CONFIG.replace('    EMAIL_API_KEY:', stale + '    EMAIL_API_KEY:'))
    write('http.ts', HTTP)
    expect(await readConvexConfigDrift(root)).toMatchObject({ missingForwards: [], staleForwards: ['EMAIL_TEST_MODE'] })
    const reported = await convexConfigFinding(root)
    expect(reported).toMatchObject({ status: 'fail', fixHint: expect.stringContaining('doctor --fix` to delete the EMAIL_TEST_MODE line') })
    expect(reported.message).toContain('still forwards EMAIL_TEST_MODE, which 0.2.0 removed (BACKEND_ENVIRONMENT replaces them)')
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: deleted the forwarded EMAIL_TEST_MODE, which 0.2.0 removed'])
    expect(read('convex.config.ts')).toBe(CONFIG)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
  })

  it('deletes several stale forwards, on the app\'s own name, with a comment on the line', async () => {
    const lines = '    MONITORING_ENVIRONMENT: project.env.MONITORING_ENVIRONMENT, // old\n    EMAIL_TEST_MODE: project.env.EMAIL_TEST_MODE,\n'
    const config = CONFIG.replace(/\bapp\b/g, 'project')
    write('convex.config.ts', config.replace('    EMAIL_API_KEY:', lines + '    EMAIL_API_KEY:'))
    write('http.ts', HTTP)
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: deleted the forwarded MONITORING_ENVIRONMENT, EMAIL_TEST_MODE, which 0.2.0 removed'])
    expect(read('convex.config.ts')).toBe(config)
  })

  it('leaves a stale forward the app wrote another way to its owner, and says so', async () => {
    const stale = '    EMAIL_TEST_MODE: \'true\',\n'
    write('convex.config.ts', CONFIG.replace('    EMAIL_API_KEY:', stale + '    EMAIL_API_KEY:'))
    write('http.ts', HTTP)
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: left the forwarded EMAIL_TEST_MODE as it is — written another way than NAME: app.env.NAME; delete it by hand'])
    expect(read('convex.config.ts')).toContain(stale)
  })

  it('leaves a backend mount that forwards no env object alone: that app forwards on purpose', async () => {
    write('convex.config.ts', CONFIG.replace(/app\.use\(backend, \{\n {2}env: \{\n[\s\S]*?\n {2}\},\n\}\)/, 'app.use(backend)'))
    write('http.ts', HTTP)
    expect(read('convex.config.ts')).toContain('app.use(backend)\n')
    expect(await readConvexConfigDrift(root)).toMatchObject({ missingForwards: [] })
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
  })

  it('leaves an http.ts that does not call registerBackendRoutes alone', async () => {
    write('convex.config.ts', CONFIG)
    write('http.ts', 'import { httpRouter } from \'convex/server\'\n\nexport default httpRouter()\n')
    const drift = await readConvexConfigDrift(root)
    expect(drift).toMatchObject({ routerFound: false, missingRoutes: [] })
    expect((await convexConfigFinding(root)).message).toContain('does not call registerBackendRoutes')
    expect(await fixConvexConfig(root)).toEqual([])
  })

  it('lists the app\'s own mounts beside the scaffold\'s', async () => {
    write('convex.config.ts', CONFIG.replace('export default app', 'import presence from \'@convex-dev/presence/convex.config\'\napp.use(presence)\n\nexport default app'))
    write('http.ts', HTTP)
    const { mounts } = await readConvexConfigDrift(root)
    expect(mounts.at(-1)).toEqual({ from: '@convex-dev/presence/convex.config', name: 'presence', mounted: true, scaffold: false })
    expect(mounts.find(mount => mount.name === 'persistentTextStreaming')).toMatchObject({ mounted: true, scaffold: true })
  })

  it('reads Crons only from an import, in any file of the functions directory', async () => {
    installCrons()
    write('convex.config.ts', CONFIG)
    write('http.ts', HTTP)
    // A doc comment, a block comment and a string name it without importing it.
    write('notes.ts', '/** Call new Crons(components.crons) to schedule. */\n/* Crons */\nexport const hint = \'Crons\'\n')
    // A URL's // does not hide the code after it.
    write('links.ts', 'export const docs = \'https://nuxt-backend.dev\'; export const n = 1\n')
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'pass' })
    mkdirSync(join(root, 'backend/jobs'))
    write('jobs/digest.ts', DIGEST)
    expect(await convexConfigFinding(root)).toMatchObject({ status: 'fail', message: expect.stringContaining('does not mount crons') })
  })

  it('leaves the crons mount out, and says to install it, while @convex-dev/crons is not installed', async () => {
    write('convex.config.ts', CONFIG)
    write('http.ts', HTTP)
    write('digest.ts', DIGEST)
    const reported = await convexConfigFinding(root)
    expect(reported.status).toBe('fail')
    expect(reported.message).toContain('needs @convex-dev/crons, which is not installed')
    expect(await fixConvexConfig(root)).toEqual([])
    expect(read('convex.config.ts')).toBe(CONFIG)
  })

  it('mounts only on a top-level defineApp variable, and leaves an app built in a function alone', async () => {
    const iife = [
      'import { defineApp } from \'convex/server\'',
      'import backend from \'nuxt-backend/convex.config\'',
      '',
      'export default (() => {',
      '  const app = defineApp()',
      '  app.use(backend)',
      '  return app',
      '})()',
      '',
    ].join('\n')
    write('convex.config.ts', iife)
    write('http.ts', HTTP)
    const reported = await convexConfigFinding(root)
    expect(reported.status).toBe('warn')
    expect(reported.message).toContain('ambiguous')
    expect(await fixConvexConfig(root)).toEqual([])
    expect(read('convex.config.ts')).toBe(iife)
  })

  it('keeps every line end of a file that mixes CRLF and LF', async () => {
    const lines = withoutMount(CONFIG, 'shardedCounter').split('\n')
    const mixed = lines.map((line, index) => index % 3 === 0 ? `${line}\r` : line).join('\n')
    write('convex.config.ts', mixed)
    write('http.ts', HTTP)
    expect(await fixConvexConfig(root)).toEqual(['backend/convex.config.ts: mounted shardedCounter'])
    const fixed = read('convex.config.ts')
    // Removing the two added lines gives back the original, byte for byte.
    const added = ['import shardedCounter from \'@convex-dev/sharded-counter/convex.config\'', 'app.use(shardedCounter)']
    expect(fixed.split('\n').filter(line => !added.includes(line.replace(/\r$/, ''))).join('\n')).toBe(mixed)
  })

  it('writes through a symlink to the real file, and keeps its mode', async () => {
    mkdirSync(join(root, 'shared'))
    writeFileSync(join(root, 'shared/convex.config.ts'), withoutMount(CONFIG, 'shardedCounter'))
    chmodSync(join(root, 'shared/convex.config.ts'), 0o640)
    symlinkSync(join(root, 'shared/convex.config.ts'), join(root, 'backend/convex.config.ts'))
    write('http.ts', HTTP)
    await fixConvexConfig(root)
    expect(lstatSync(join(root, 'backend/convex.config.ts')).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(root, 'shared/convex.config.ts'), 'utf-8')).toBe(CONFIG)
    expect(statSync(join(root, 'shared/convex.config.ts')).mode & 0o777).toBe(0o640)
    expect(readdirSync(join(root, 'shared')).filter(file => file.endsWith('.tmp'))).toEqual([])
  })
})
