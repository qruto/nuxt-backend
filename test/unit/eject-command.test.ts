import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ejectCommand, packagedSource } from '../../src/cli/eject'
import { packageVersion } from '../../src/dirs'

// `nuxt-backend eject` at the terminal: what it prints, where, and its exit
// codes, against a real app directory; and where `upgrade` reads the
// packaged source of an older version from. cli-eject.test.ts holds what
// the copies contain.

const version = packageVersion()

let root: string
let stdout: string[]
let stderr: string[]
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'eject-command-'))
  mkdirSync(join(root, 'app'))
  mkdirSync(join(root, 'backend'))
  stdout = []
  stderr = []
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => void stdout.push(String(line)))
  vi.spyOn(console, 'error').mockImplementation((line: unknown) => void stderr.push(String(line)))
  process.exitCode = undefined
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
  process.exitCode = undefined
})

const run = (...args: string[]) => runCommand(ejectCommand, { rawArgs: [...args, '--cwd', root] })

describe('nuxt-backend eject, the command', () => {
  it('lists what it can eject, a mark beside what the app ejected already, and changes nothing', async () => {
    await run('PricingPlanCard')
    stdout = []
    await run('--list')
    const lines = stdout.join('\n').split('\n')
    expect(lines).toContain(`✓ ${'PricingPlanCard'.padEnd(28)} part`)
    expect(lines).toContain(`  ${'page:pricing'.padEnd(28)} page`)
    expect(lines).toContain(`  ${'email:invite'.padEnd(28)} email`)
    expect(process.exitCode).toBeUndefined()
    expect(existsSync(join(root, 'app/pages'))).toBe(false)
  })

  it('lists them as JSON with --json, and exits 1 when no name was given', async () => {
    await run('--json')
    const list = JSON.parse(stdout[0]!) as Array<{ target: string, kind: string, ejected: boolean }>
    expect(list).toEqual(expect.arrayContaining([{ target: 'page:login', kind: 'page', ejected: false }, { target: 'email:otp', kind: 'email', ejected: false }]))
    expect(process.exitCode).toBe(1)
  })

  it('says each file it wrote and the version it came from', async () => {
    await run('PricingPlanCard')
    expect(stdout).toHaveLength(2)
    expect(stdout[0]).toMatch(new RegExp(`PricingPlanCard\\.vue\\s+from nuxt-backend ${version.replace(/\./g, '\\.')}$`))
    expect(stdout[1]).toMatch(/PricingPlanCard\.css\s+from nuxt-backend /)
    expect(readFileSync(join(root, 'app/components/PricingPlanCard.vue'), 'utf8')).toContain(`nuxt-backend eject: PricingPlanCard@${version}`)
  })

  it('prints the report as JSON with --json', async () => {
    await run('page:pricing', '--json')
    expect(JSON.parse(stdout.join('\n'))).toEqual({ target: 'page:pricing', version, written: ['app/pages/pricing.vue'] })
  })

  it('names the line to add by hand when email.ts has a shape it does not edit', async () => {
    writeFileSync(join(root, 'backend/email.ts'), 'import { setupEmail } from \'nuxt-backend/email\'\nconst options = makeOptions()\nexport const email = setupEmail(components, options)\n')
    await run('email:invite')
    expect(stdout.at(-1)).toBe('  ↳ Add `invite` to `setupEmail`\'s `templates` in backend/email.ts: `import { invite } from \'./emails/invite\'`.')
    expect(readFileSync(join(root, 'backend/email.ts'), 'utf8')).not.toContain('./emails/invite')
  })

  it('exits 1 for a name it does not know, naming the close ones, and writes nothing', async () => {
    await run('PricingPlanCrad')
    expect(process.exitCode).toBe(1)
    expect(stderr).toHaveLength(1)
    expect(stderr[0]).toMatch(/^\[nuxt-backend\] eject: `PricingPlanCrad` is no part, page or email to eject\. Did you mean `PricingPlanCard`/)
    expect(existsSync(join(root, 'app/components'))).toBe(false)
  })

  it('exits 1 rather than overwrite the app\'s own file, and overwrites it with --force', async () => {
    mkdirSync(join(root, 'app/pages'))
    writeFileSync(join(root, 'app/pages/pricing.vue'), '<template>mine</template>\n')
    await run('page:pricing')
    expect(process.exitCode).toBe(1)
    expect(stderr[0]).toBe('[nuxt-backend] eject: app/pages/pricing.vue already exists: pass --force to overwrite it.')
    expect(readFileSync(join(root, 'app/pages/pricing.vue'), 'utf8')).toBe('<template>mine</template>\n')

    process.exitCode = undefined
    await run('page:pricing', '--force')
    expect(process.exitCode).toBeUndefined()
    expect(readFileSync(join(root, 'app/pages/pricing.vue'), 'utf8')).toContain('nuxt-backend eject: page:pricing@')
  })
})

describe('the packaged source upgrade diffs against', () => {
  const path = 'src/runtime/vue/pages/pricing.vue'

  it('is the installed package\'s own file at the installed version, with no download', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const source = packagedSource(version, fetcher)
    expect(await source(version, path)).toBe(readFileSync(join(import.meta.dirname, '../..', path), 'utf8'))
    expect(await source(version, 'src/runtime/vue/pages/never-shipped.vue')).toBeUndefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('is the npm CDN\'s copy at an older version, and nothing when that copy is missing or out of reach', async () => {
    const fetcher = vi.fn<typeof fetch>(async url => String(url).includes('@0.0.5/') ? new Response('<template>old</template>') : new Response('Not found', { status: 404 }))
    const source = packagedSource(version, fetcher)
    expect(await source('0.0.5', path)).toBe('<template>old</template>')
    expect(fetcher).toHaveBeenCalledWith(`https://cdn.jsdelivr.net/npm/nuxt-backend@0.0.5/${path}`)
    expect(await source('0.0.4', path)).toBeUndefined()
    // A version is one path segment, whatever it holds.
    await source('1.0.0/../../evil', path)
    expect(fetcher).toHaveBeenLastCalledWith(`https://cdn.jsdelivr.net/npm/nuxt-backend@1.0.0%2F..%2F..%2Fevil/${path}`)

    const offline = packagedSource(version, async () => {
      throw new TypeError('fetch failed')
    })
    expect(await offline('0.0.5', path)).toBeUndefined()
  })
})
