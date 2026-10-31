import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCommand } from 'citty'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mcp } from '../../src/cli/mcp'

// `nuxt-backend mcp` as an agent's `.mcp.json` starts it: the project it
// serves, the refusals that keep it from starting on the wrong deployment,
// and the exit code an agent's client reads. The server itself is a stand-in
// here; test/unit/developer-mcp.test.ts drives the real one.

const server = vi.hoisted(() => ({ runDeveloperMcp: vi.fn(async (_options: { rootDir: string, prod: boolean }) => {}) }))
vi.mock('../../src/mcp/server', () => server)

let dir: string
let stderr: string[]
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cli-mcp-'))
  stderr = []
  for (const name of ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT_TOKEN']) vi.stubEnv(name, undefined)
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void stderr.push(args.join(' ')))
  server.runDeveloperMcp.mockClear()
  process.exitCode = undefined
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  process.exitCode = undefined
})

describe('nuxt-backend mcp', () => {
  it('serves the project --cwd names, on its dev deployment unless --prod', async () => {
    await runCommand(mcp, { rawArgs: ['--cwd', dir] })
    expect(server.runDeveloperMcp).toHaveBeenCalledWith({ rootDir: dir, prod: false })
    await runCommand(mcp, { rawArgs: ['--cwd', dir, '--prod'] })
    expect(server.runDeveloperMcp).toHaveBeenLastCalledWith({ rootDir: dir, prod: true })
    expect(process.exitCode).toBeUndefined()
  })

  it('exits 1 for a project directory that does not exist, and starts nothing', async () => {
    await runCommand(mcp, { rawArgs: ['--cwd', join(dir, 'missing')] })
    expect(process.exitCode).toBe(1)
    expect(stderr).toEqual([`[nuxt-backend] ${join(dir, 'missing')} does not exist: pass the project directory with --cwd.`])
    expect(server.runDeveloperMcp).not.toHaveBeenCalled()
  })

  // The Convex CLI follows the deploy key, so --prod would read the key's deployment and call it production.
  it('refuses --prod when .env.local holds a deploy key for another deployment', async () => {
    writeFileSync(join(dir, '.env.local'), 'CONVEX_DEPLOY_KEY=preview:team:app|secret-preview-key\n')
    await runCommand(mcp, { rawArgs: ['--cwd', dir, '--prod'] })
    expect(process.exitCode).toBe(1)
    expect(stderr.join('\n')).toContain('--prod refused: CONVEX_DEPLOY_KEY is a preview deployment key')
    expect(stderr.join('\n')).not.toContain('secret-preview-key')
    expect(server.runDeveloperMcp).not.toHaveBeenCalled()
    // Without --prod the same key is the dev server's business, not a refusal.
    await runCommand(mcp, { rawArgs: ['--cwd', dir] })
    expect(server.runDeveloperMcp).toHaveBeenCalledWith({ rootDir: dir, prod: false })
  })
})
