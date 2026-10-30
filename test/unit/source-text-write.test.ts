import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// writeSource on Windows, where a rename can meet a file another program
// holds: the rename is retried, then refused with the file named. The file
// is never written in place, and no temporary file is left behind.

const held = vi.hoisted(() => ({ code: undefined as string | undefined }))

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    renameSync: vi.fn((from: string, to: string) => {
      if (held.code) throw Object.assign(new Error(`${held.code}: rename`), { code: held.code })
      fs.renameSync(from, to)
    }),
  }
})

const { readSource, writeSource } = await import('../../src/source-text')

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
let root: string
let file: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nuxt-backend-source-text-'))
  file = join(root, 'convex.config.ts')
  writeFileSync(file, '\uFEFFexport default 1\n')
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
})

afterEach(() => {
  held.code = undefined
  Object.defineProperty(process, 'platform', platform)
  rmSync(root, { recursive: true, force: true })
})

describe('writeSource on Windows', () => {
  it('replaces the file, keeping its BOM', () => {
    writeSource(file, readSource(file), 'export default 2\n')
    expect(readFileSync(file, 'utf-8')).toBe('\uFEFFexport default 2\n')
    expect(readdirSync(root)).toEqual(['convex.config.ts'])
  })

  it('refuses a file another program keeps holding, and leaves it as it was', () => {
    held.code = 'EBUSY'
    expect(() => writeSource(file, readSource(file), 'export default 2\n')).toThrow(/is held by another program \(EBUSY\)/)
    expect(readFileSync(file, 'utf-8')).toBe('\uFEFFexport default 1\n')
    expect(readdirSync(root)).toEqual(['convex.config.ts'])
  })

  it('does not retry an error other than a held file', () => {
    held.code = 'ENOSPC'
    expect(() => writeSource(file, readSource(file), 'export default 2\n')).toThrow('ENOSPC: rename')
    expect(readdirSync(root)).toEqual(['convex.config.ts'])
  })
})
