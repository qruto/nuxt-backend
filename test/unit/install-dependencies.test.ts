import { spawnSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installDeclaredDependencies } from '../../src/setup'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }))

// The install step links what setup declared with the project's own package
// manager: one literal command each, never a name it was handed.
describe('installDeclaredDependencies', () => {
  beforeEach(() => vi.mocked(spawnSync).mockClear())

  it.each(['npm', 'pnpm', 'yarn', 'bun'])('runs `%s install` in the project', (packageManager) => {
    expect(installDeclaredDependencies('/app', packageManager)).toBe(true)
    expect(spawnSync).toHaveBeenCalledWith(packageManager, ['install'], expect.objectContaining({ cwd: '/app', stdio: 'inherit' }))
  })

  it('runs nothing for another name', () => {
    for (const name of ['deno', 'npm; rm -rf /', 'pnpm install', '']) expect(installDeclaredDependencies('/app', name)).toBe(false)
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('says when the install failed', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 } as ReturnType<typeof spawnSync>)
    expect(installDeclaredDependencies('/app', 'npm')).toBe(false)
  })
})
