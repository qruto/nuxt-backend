import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { announceUpgrade, installProject, type InstallSurroundings } from '../../src/nuxt/install'
import { formatNextSteps } from '../../src/setup'
import { isSourceDir, runsFromSource } from '../../src/dirs'
import backendModule from '../../src/module'

// The module's onInstall: what `npx nuxt module add nuxt-backend` sets up.

let rootDir: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'nuxt-backend-install-'))
  writeFileSync(join(rootDir, 'package.json'), `${JSON.stringify({ name: 'app', private: true, scripts: { dev: 'nuxt dev' } }, null, 2)}\n`)
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

const nuxtAt = (options: { dev?: boolean, _prepare?: boolean, test?: boolean } = {}) =>
  ({ options: { rootDir, dev: false, _prepare: true, test: false, ...options } }) as unknown as Nuxt

function surroundings(overrides: Partial<InstallSurroundings> & { answer?: unknown } = {}) {
  const lines: string[] = []
  const given: InstallSurroundings = {
    terminal: {
      prompt: vi.fn(async () => overrides.answer ?? true),
      withTerminal: vi.fn(async work => work()),
    },
    interactive: true,
    packageManager: async () => 'pnpm',
    install: vi.fn(() => true),
    log: line => lines.push(line),
    ...overrides,
  }
  return { given, lines }
}

const read = (file: string) => readFileSync(join(rootDir, file), 'utf-8')

describe('the install step', () => {
  it('sets the project up as init does, and installs convex with the project\'s package manager', async () => {
    const { given, lines } = surroundings()
    await installProject(nuxtAt(), given)

    expect(existsSync(join(rootDir, 'backend/convex.config.ts'))).toBe(true)
    expect(existsSync(join(rootDir, '.env.example'))).toBe(true)
    expect(existsSync(join(rootDir, 'AGENTS.md'))).toBe(true)
    expect(existsSync(join(rootDir, '.mcp.json'))).toBe(true)
    const manifest = JSON.parse(read('package.json')) as { scripts: Record<string, string>, dependencies: Record<string, string> }
    expect(manifest.scripts.dev).toBe('nuxt-backend dev')
    expect(manifest.dependencies.convex).toMatch(/^[\^>]/)
    expect(given.install).toHaveBeenCalledWith(rootDir, 'pnpm')
    // Installed here, so the next steps start at the dev script.
    expect(lines.at(-1)).toBe(formatNextSteps({ convexDependency: manifest.dependencies.convex!, start: 'npm run dev' }, { installed: true }))
    expect(lines.at(-1)).not.toContain('npm install')
  })

  it('asks once whether to write the agent files, and skips them on a no', async () => {
    const { given } = surroundings({ answer: false })
    await installProject(nuxtAt(), given)

    expect(given.terminal.prompt).toHaveBeenCalledOnce()
    expect(existsSync(join(rootDir, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(rootDir, '.mcp.json'))).toBe(false)
    expect(existsSync(join(rootDir, 'backend/convex.config.ts'))).toBe(true)
  })

  it('names the install still to run when the package manager failed', async () => {
    const { given, lines } = surroundings({ install: vi.fn(() => false) })
    await installProject(nuxtAt(), given)

    expect(lines.some(line => line.includes('run `pnpm install` yourself'))).toBe(true)
    expect(lines.at(-1)).toContain('npm install')
  })

  it('writes nothing without a person at the terminal, in a build or under a test runner, and names init', async () => {
    for (const [nuxt, interactive] of [[nuxtAt(), false], [nuxtAt({ _prepare: false }), true], [nuxtAt({ test: true }), true]] as const) {
      const { given, lines } = surroundings({ interactive })
      await installProject(nuxt, given)
      expect(given.terminal.prompt).not.toHaveBeenCalled()
      expect(lines).toEqual([expect.stringContaining('npx nuxt-backend init')])
    }
    expect(existsSync(join(rootDir, 'backend'))).toBe(false)
  })

  it('runs under nuxt dev too', async () => {
    const { given } = surroundings()
    await installProject(nuxtAt({ dev: true, _prepare: false }), given)
    expect(existsSync(join(rootDir, 'backend/convex.config.ts'))).toBe(true)
  })

  it('on an upgrade, points at the upgrade command and changes nothing', () => {
    const lines: string[] = []
    announceUpgrade('0.2.0', '0.3.0', line => lines.push(line))
    expect(lines).toEqual([expect.stringContaining('0.2.0 → 0.3.0: run `npx nuxt-backend upgrade`')])
  })
})

describe('the lifecycle hooks', () => {
  // Nuxt records `setups.nuxt-backend` in the app's .nuxtrc for a module
  // that declares onInstall or onUpgrade: this repository's own prepare,
  // running the sources, must leave its .nuxtrc alone.
  it('are declared by a published build only', () => {
    expect(isSourceDir('/repo/nuxt-backend/src')).toBe(true)
    expect(isSourceDir('/app/node_modules/nuxt-backend/dist')).toBe(false)
    expect(isSourceDir('/app/node_modules/.pnpm/nuxt-backend@0.2.0/node_modules/nuxt-backend/dist')).toBe(false)
    expect(runsFromSource).toBe(true)
    expect(backendModule.onInstall).toBeUndefined()
    expect(backendModule.onUpgrade).toBeUndefined()
  })
})

describe('the next steps', () => {
  it('read as the CLI reference prints them', () => {
    expect(formatNextSteps({ convexDependency: null, start: 'npm run dev' })).toBe([
      'Next steps:',
      '  npm run dev                # the first run sets up your Convex dev deployment (log in',
      '                             # when asked) and provisions its env, then runs Convex and Nuxt',
      '  Sign in at /login: in development, the sign-in code prints in the same terminal.',
    ].join('\n'))
    expect(formatNextSteps({ convexDependency: '^1.48.0', start: 'npx nuxt-backend dev' }).split('\n').slice(1, 3)).toEqual([
      '  npm install                # links the convex dependency added above',
      '  npx nuxt-backend dev       # the first run sets up your Convex dev deployment (log in',
    ])
    expect(formatNextSteps({ convexDependency: null, mcpSdkDependency: '^1.32.1', start: 'npm run dev' }).split('\n')[1]).toBe('  npm install                # links the MCP SDK added above')
    expect(formatNextSteps({ convexDependency: '^1.48.0', mcpSdkDependency: '^1.32.1', start: 'npm run dev' }).split('\n')[1]).toBe('  npm install                # links convex and the MCP SDK, added above')
  })
})
