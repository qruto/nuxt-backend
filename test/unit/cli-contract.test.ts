import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCommand, type ArgsDef, type CommandDef } from 'citty'
import { main } from '../../src/cli/main'
import { COMMAND_CONTRACTS, describeSideEffects } from '../../src/cli/contract'

// Every command keeps a contract with whoever runs it — a coding agent above
// all: what it may change, what `--json` prints, what each exit code means.
// Declared beside the command, it ends the command's `--help` description and
// is stated on the CLI page, which these tests hold to it.

/** Every command of the CLI by its path (`env push`), however deep. */
function commands(command: CommandDef, path: string[] = []): Array<[string, CommandDef]> {
  const subCommands = (command.subCommands ?? {}) as Record<string, CommandDef>
  if (Object.keys(subCommands).length === 0) return [[path.join(' '), command]]
  return Object.entries(subCommands).flatMap(([name, sub]) => commands(sub, [...path, name]))
}

const page = readFileSync(new URL('../../website/content/docs/10.reference/09.cli/index.md', import.meta.url), 'utf8')

/** The page's section for a command, up to the next one. */
function section(path: string): string {
  const start = page.indexOf(`## \`${path}\``)
  expect(start, `no section for ${path}`).toBeGreaterThan(-1)
  const next = page.indexOf('\n## ', start + 1)
  return page.slice(start, next === -1 ? undefined : next)
}

describe('the command contracts', () => {
  it('cover every command', () => {
    expect(commands(main).map(([path]) => path).sort()).toEqual([...COMMAND_CONTRACTS.keys()].sort())
  })

  it.each(commands(main))('%s ends its --help description with what it may change', (path, command) => {
    const contract = COMMAND_CONTRACTS.get(path)!
    expect((command.meta as { description: string }).description.endsWith(`[${describeSideEffects(contract)}]`)).toBe(true)
  })

  it.each(commands(main))('%s is stated on the CLI page: side effects, --json, every exit code and every flag', (path, command) => {
    const text = section(path)
    const contract = COMMAND_CONTRACTS.get(path)!
    expect(text).toContain('**Side effects:**')
    // What --json prints: in the contract line, or in the --json row of the flags.
    expect(text.includes('**`--json`:**') || text.includes('| `--json` | Print the outcome as one JSON document'), '--json').toBe(true)
    for (const code of Object.keys(contract.exitCodes)) expect(text).toContain(`\`${code}\``)
    const args = (command.args ?? {}) as ArgsDef
    for (const [flag, def] of Object.entries(args)) {
      if (flag === 'cwd' || def.type === 'positional') continue
      // A boolean that defaults on is documented by the flag that turns it off.
      expect(text).toContain(def.type === 'boolean' && def.default === true ? `| \`--no-${flag}` : `| \`--${flag}`)
    }
  })

  it('names what a flag changes instead', () => {
    expect(describeSideEffects(COMMAND_CONTRACTS.get('doctor')!)).toBe('reads only; --fix: writes project files, writes the dev deployment; --fix --prod: writes project files, writes production')
    expect(describeSideEffects(COMMAND_CONTRACTS.get('env push')!)).toContain('--defaults: writes project env defaults')
    expect(describeSideEffects(COMMAND_CONTRACTS.get('inbox')!)).toBe('reads only')
  })
})

describe('init --json', () => {
  let rootDir: string

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'cli-contract-init-'))
    writeFileSync(join(rootDir, 'package.json'), `${JSON.stringify({ name: 'app', scripts: { dev: 'nuxt dev' } }, null, 2)}\n`)
    writeFileSync(join(rootDir, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function init(args: string[] = []) {
    vi.mocked(console.log).mockClear()
    await runCommand(main, { rawArgs: ['init', '--json', ...args, '--cwd', rootDir] })
    return JSON.parse(vi.mocked(console.log).mock.calls.flat().join('\n'))
  }

  it('prints what it did as one JSON document, with progress on stderr', async () => {
    const report = await init()

    expect(Object.keys(report)).toEqual(['created', 'agentsMd', 'mcpJson', 'appComponent', 'devScript', 'convexDependency', 'nuxtConfig', 'next'])
    expect(report.created).toEqual(expect.arrayContaining(['backend/auth.ts', 'convex.json', '.env.example']))
    for (const file of report.created) expect(existsSync(join(rootDir, file)), file).toBe(true)
    expect(report).toMatchObject({ agentsMd: 'created', mcpJson: 'created', devScript: 'nuxt-backend dev', nuxtConfig: 'listed', appComponent: null })
    expect(report.convexDependency).toMatch(/^\^?\d|>=/)
    expect(report.next).toEqual(['npm install', 'npm run dev'])
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('Created backend/auth.ts')
  })

  it('reports nothing created on a second run, and no agent files with --no-agents', async () => {
    await init()
    const again = await init(['--no-agents'])

    expect(again).toMatchObject({ created: [], agentsMd: null, mcpJson: null, devScript: null, convexDependency: null })
    expect(again.next).toEqual(['npm run dev'])
  })
})
