import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { denyPnpmSkills, pnpmReadsPermissions, pnpmVersionIn, pnpmWorkspaceFile } from '../../src/pnpm-workspace'

// `init` denies pnpm 12's own link of the agent skills it copied: the entry
// `pnpm approve '!nuxt-backend'` records, written line by line into the
// file the project has.

const DENIED = { 'nuxt-backend': { skills: false } }

describe('denyPnpmSkills', () => {
  it('creates the file with the entry alone', () => {
    const { action, content } = denyPnpmSkills(undefined)
    expect(action).toBe('created')
    expect(parse(content!)).toEqual({ permissions: DENIED })
    expect(content!.endsWith('\n')).toBe(true)
  })

  it('appends permissions after everything the file holds, a file without a final newline included', () => {
    const source = '# settings\npublicHoistPattern:\n  - \'@convex-dev/*\'\n'
    const { action, content } = denyPnpmSkills(source)
    expect(action).toBe('added')
    expect(content!.startsWith(source)).toBe(true)
    expect(parse(content!)).toEqual({ publicHoistPattern: ['@convex-dev/*'], permissions: DENIED })

    const bare = denyPnpmSkills('allowBuilds:\n  esbuild: false')
    expect(parse(bare.content!)).toEqual({ allowBuilds: { esbuild: false }, permissions: DENIED })
    expect(denyPnpmSkills('').content).toBe(denyPnpmSkills(undefined).content)
  })

  it('adds nuxt-backend to the permissions there, at their indentation, and keeps the others', () => {
    const source = 'permissions:\n    esbuild:\n        build: false\n# end\n'
    const { action, content } = denyPnpmSkills(source)
    expect(action).toBe('added')
    expect(content).toContain('\n    nuxt-backend:\n        skills: false\n    esbuild:')
    expect(parse(content!)).toEqual({ permissions: { 'nuxt-backend': { skills: false }, 'esbuild': { build: false } } })
  })

  it('adds skills to the entry nuxt-backend has, and leaves a skills choice the project made', () => {
    const built = denyPnpmSkills('permissions:\n  "nuxt-backend":\n    build: true\n')
    expect(built.action).toBe('added')
    expect(parse(built.content!)).toEqual({ permissions: { 'nuxt-backend': { build: true, skills: false } } })

    const bare = denyPnpmSkills('permissions:\n  nuxt-backend:\nallowBuilds: {}\n')
    expect(parse(bare.content!)).toEqual({ permissions: DENIED, allowBuilds: {} })

    for (const source of ['permissions:\n  nuxt-backend:\n    skills: true\n', 'permissions:\n  nuxt-backend:\n    # approved\n    skills: false\n', 'permissions:\n  nuxt-backend: { skills: true }\n']) {
      expect(denyPnpmSkills(source), source).toEqual({ action: 'unchanged' })
    }
  })

  it('leaves permissions written as a flow mapping to the user', () => {
    expect(denyPnpmSkills('permissions: {}\n')).toEqual({ action: 'manual' })
    expect(denyPnpmSkills('permissions:\n  nuxt-backend: { build: true }\n')).toEqual({ action: 'manual' })
  })

  it('keeps the file\'s line endings', () => {
    const { content } = denyPnpmSkills('allowBuilds:\r\n  esbuild: false\r\n')
    expect(content!.replace(/\r\n/g, '')).not.toContain('\n')
    expect(parse(content!)).toEqual({ allowBuilds: { esbuild: false }, permissions: DENIED })
  })
})

describe('pnpmReadsPermissions', () => {
  it.each([['11.26.0', false], ['12.10.3', false], ['12.11.0', true], ['12.16.1', true], ['13.0.0', true], [undefined, false]] as const)('pnpm %s: %s', (version, reads) => {
    expect(pnpmReadsPermissions(version)).toBe(reads)
  })
})

describe('pnpmWorkspaceFile and pnpmVersionIn', () => {
  let dir: string
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.unstubAllEnvs()
  })

  it('takes the version the project pins over the pnpm running the command', () => {
    dir = mkdtempSync(join(tmpdir(), 'pnpm-version-'))
    vi.stubEnv('npm_config_user_agent', 'pnpm/11.26.0 npm/? node/v24.11.0 darwin arm64')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@12.16.1+sha512.abc' }))
    expect(pnpmVersionIn(dir)).toBe('12.16.1')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ packageManager: 'yarn@4.9.1' }))
    expect(pnpmVersionIn(dir)).toBe('11.26.0')
  })

  it('is the nearest one up the tree, as pnpm finds a workspace, else a new one in the project', () => {
    dir = mkdtempSync(join(tmpdir(), 'pnpm-workspace-'))
    const app = join(dir, 'apps/web')
    mkdirSync(app, { recursive: true })
    expect(pnpmWorkspaceFile(app)).toBe(join(app, 'pnpm-workspace.yaml'))

    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
    expect(pnpmWorkspaceFile(app)).toBe(join(dir, 'pnpm-workspace.yaml'))
  })
})
