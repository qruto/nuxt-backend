import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCommandAdvice, deployHost, VercelCliError } from '../../src/cli/deploy/host'
import { hostingTools, runVercel } from '../../src/mcp/hosting'
import type { DevTool, ToolContext } from '../../src/mcp/tools'

// The two places the package runs the developer's own Vercel CLI: `deploy`
// writing the linked project's production env, and the developer MCP
// server's `hosting-*` tools reading it through `vercel api`. A fake
// `vercel` on PATH is spawned for real; it logs each call (argv, stdin,
// working directory) and answers from a script the test writes. POSIX
// only: on Windows the CLI is a `.cmd` shim run through a shell.

const posix = process.platform !== 'win32'

let dir: string
let projectDir: string
let binDir: string
let logFile: string
let stateFile: string

/** What the fake answers, by its first two arguments (`env ls`, `api /v6/…`), or `*`. */
type Reply = { stdout?: string, stderr?: string, code?: number }

const FAKE_VERCEL = `
const fs = require('node:fs')
const state = JSON.parse(fs.readFileSync(process.env.FAKE_VERCEL_STATE, 'utf8'))
const args = process.argv.slice(2)
const answer = (stdin) => {
  fs.appendFileSync(state.log, JSON.stringify({ args, stdin, cwd: process.cwd() }) + '\\n')
  const key = args.slice(0, 2).join(' ')
  const reply = state.replies[key] ?? state.replies[args[0]] ?? state.replies['*'] ?? {}
  if (reply.stdout) process.stdout.write(reply.stdout)
  if (reply.stderr) process.stderr.write(reply.stderr)
  process.exitCode = reply.code ?? 0
}
// Only \`env add\` reads a value; every other call answers at once.
if (args[0] === 'env' && args[1] === 'add') {
  let stdin = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { stdin += chunk })
  process.stdin.on('end', () => answer(stdin))
}
else answer(null)
`

function replies(table: Record<string, Reply>) {
  writeFileSync(stateFile, JSON.stringify({ log: logFile, replies: table }))
}

/** Every call the fake took, oldest first. */
function calls(): Array<{ args: string[], stdin: string | null, cwd: string }> {
  try {
    return readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as { args: string[], stdin: string | null, cwd: string })
  }
  catch {
    return []
  }
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'vercel-cli-')))
  projectDir = join(dir, 'app')
  binDir = join(dir, 'bin')
  logFile = join(dir, 'calls.jsonl')
  stateFile = join(dir, 'state.json')
  mkdirSync(join(projectDir, '.vercel'), { recursive: true })
  mkdirSync(binDir)
  writeFileSync(join(projectDir, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_panels', orgId: 'team_acme' }))
  writeFileSync(join(dir, 'fake-vercel.cjs'), FAKE_VERCEL)
  // A shell wrapper with absolute paths, so PATH can hold the fake alone.
  writeFileSync(join(binDir, 'vercel'), `#!/bin/sh\nexec "${process.execPath}" "${join(dir, 'fake-vercel.cjs')}" "$@"\n`)
  chmodSync(join(binDir, 'vercel'), 0o755)
  replies({})
  vi.stubEnv('PATH', binDir)
  vi.stubEnv('FAKE_VERCEL_STATE', stateFile)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(!posix)('deploy and the linked Vercel project', () => {
  const LISTING = [
    'Vercel CLI 48.0.0',
    '> Environment Variables found for acme/panels [120ms]',
    '',
    ' name                       value               environments        created',
    ' NUXT_PUBLIC_BACKEND_URL    Encrypted           Production          2d ago',
    ' SITE_URL                   Encrypted           Production          2d ago',
  ].join('\n')

  it('reads production\'s env names off vercel env ls, in the project', async () => {
    replies({ 'env ls': { stdout: LISTING } })
    expect(await deployHost(projectDir).envNames()).toEqual(['NUXT_PUBLIC_BACKEND_URL', 'SITE_URL'])
    expect(calls()).toEqual([{ args: ['env', 'ls', 'production'], stdin: null, cwd: projectDir }])
  })

  it('reads the names as unknown when the CLI fails, so deploy adds nothing blind', async () => {
    replies({ 'env ls': { stderr: 'Error: Not authorized', code: 1 } })
    expect(await deployHost(projectDir).envNames()).toBeNull()
  })

  it('adds a value on the CLI\'s stdin, never as an argument', async () => {
    const key = 'prod:happy-otter-123|secret-deploy-key'
    await deployHost(projectDir).addEnv('CONVEX_DEPLOY_KEY', key)
    const [call] = calls()
    expect(call!.args).toEqual(['env', 'add', 'CONVEX_DEPLOY_KEY', 'production'])
    expect(call!.stdin).toBe(key)
  })

  it('names the subcommand, the exit code and the CLI\'s last lines when an add fails, never the value', async () => {
    replies({ 'env add': { stderr: 'Vercel CLI 48.0.0\nError: A variable with the name CONVEX_DEPLOY_KEY already exists\nhint: use vercel env rm first\n', code: 1 } })
    const failure = deployHost(projectDir).addEnv('CONVEX_DEPLOY_KEY', 'prod:happy-otter-123|secret-deploy-key')
    await expect(failure).rejects.toBeInstanceOf(VercelCliError)
    await expect(failure).rejects.toThrow('vercel env add exited with code 1: Error: A variable with the name CONVEX_DEPLOY_KEY already exists hint: use vercel env rm first')
    await expect(failure).rejects.not.toThrow(/secret-deploy-key/)
  })

  it('says to install and sign in to the CLI when it is not on PATH', async () => {
    vi.stubEnv('PATH', join(dir, 'empty'))
    await expect(deployHost(projectDir).addEnv('SITE_URL', 'https://panels.example')).rejects.toThrow('the Vercel CLI is not installed: npm i -g vercel, then vercel login')
  })

  it('writes nothing for a host other than Vercel, and says why', async () => {
    const other = deployHost(join(dir, 'unlinked'))
    expect(other.kind).toBe('other')
    expect(await other.envNames()).toBeNull()
    await expect(other.addEnv('SITE_URL', 'https://panels.example')).rejects.toThrow('no Vercel project is linked')
    expect(calls()).toEqual([])
  })

  it('asks for a build command that ships the backend, and to fix a vercel.json that does not parse', () => {
    writeFileSync(join(projectDir, 'vercel.json'), JSON.stringify({ buildCommand: 'nuxt build' }))
    expect(buildCommandAdvice(projectDir)).toContain('Check the project\'s build command ships the backend first')
    writeFileSync(join(projectDir, 'vercel.json'), JSON.stringify({ buildCommand: 'npx convex deploy --cmd \'npm run build\'' }))
    expect(buildCommandAdvice(projectDir)).toBeNull()
    writeFileSync(join(projectDir, 'vercel.json'), '{ "buildCommand": ')
    expect(buildCommandAdvice(projectDir)).toBe('vercel.json does not parse: fix it, so the build command it holds can be read.')
  })
})

describe.skipIf(!posix)('the hosting tools on the Vercel CLI', () => {
  const context = (overrides: Partial<ToolContext> = {}): ToolContext => ({ rootDir: projectDir, prod: false, confirm: async () => {}, ...overrides })
  const tool = (name: string, run = runVercel): DevTool => hostingTools(run).find(candidate => candidate.name === name)!

  it('lists the deployments through vercel api, newest first, scoped to the team, production\'s alone with --prod', async () => {
    replies({ api: { stdout: JSON.stringify({ deployments: [
      { uid: 'dpl_2', url: 'panels-git-main.vercel.app', target: 'production', state: 'READY', created: 2, meta: { githubCommitRef: 'main', githubCommitSha: 'abc123', githubCommitMessage: 'Ship it' } },
      { uid: 'dpl_1', url: 'panels-git-x.vercel.app', readyState: 'ERROR', created: 1 },
    ] }) } })
    expect(await tool('hosting-deployments').run({ limit: 5 }, context())).toEqual([
      { id: 'dpl_2', url: 'panels-git-main.vercel.app', target: 'production', state: 'READY', createdAt: 2, branch: 'main', commit: 'abc123', message: 'Ship it' },
      { id: 'dpl_1', url: 'panels-git-x.vercel.app', target: 'preview', state: 'ERROR', createdAt: 1, branch: null, commit: null, message: null },
    ])
    await tool('hosting-deployments').run({}, context({ prod: true }))
    expect(calls().map(call => call.args)).toEqual([
      ['api', '/v6/deployments?teamId=team_acme&projectId=prj_panels&limit=5', '--raw', '--non-interactive'],
      ['api', '/v6/deployments?teamId=team_acme&projectId=prj_panels&limit=20&target=production', '--raw', '--non-interactive'],
    ])
  })

  it('reads a personal account\'s project without a team scope', async () => {
    writeFileSync(join(projectDir, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_panels', orgId: 'user_ada' }))
    replies({ api: { stdout: JSON.stringify({ envs: [] }) } })
    await tool('hosting-env').run({}, context())
    expect(calls()[0]!.args[1]).toBe('/v10/projects/prj_panels/env?')
  })

  it('answers a build log oldest line first, from the event payloads', async () => {
    replies({ api: { stdout: JSON.stringify([
      { type: 'stdout', created: 10, payload: { text: 'Installing dependencies…' } },
      { type: 'stderr', payload: { date: 11, text: 'Error: Cannot find module' } },
      { type: 'command', text: 'npm run build' },
    ]) } })
    expect(await tool('hosting-logs').run({ deploymentId: 'dpl_2' }, context())).toEqual([
      { type: 'stdout', at: 10, text: 'Installing dependencies…' },
      { type: 'stderr', at: 11, text: 'Error: Cannot find module' },
      { type: 'command', at: null, text: 'npm run build' },
    ])
    expect(calls()[0]!.args[1]).toBe('/v3/deployments/dpl_2/events?teamId=team_acme&limit=200')
  })

  it('answers the active firewall: whether it is on, each rule\'s action and the managed sets', async () => {
    replies({ api: { stdout: JSON.stringify({ firewallEnabled: true, rules: [{ id: 'rule_1', name: 'Block bots', active: true, action: { mitigate: { action: 'deny' } } }, { id: 'rule_2', name: 'Log', active: false, description: 'Watch /api' }], managedRules: { owasp: { active: true } } }) } })
    expect(await tool('hosting-firewall').run({}, context())).toEqual({
      enabled: true,
      rules: [
        { id: 'rule_1', name: 'Block bots', active: true, description: null, action: 'deny' },
        { id: 'rule_2', name: 'Log', active: false, description: 'Watch /api', action: null },
      ],
      managedRules: { owasp: { active: true } },
      ips: [],
    })
  })

  it('says how to sign in when the CLI is missing, or not signed in', async () => {
    replies({ api: { stderr: 'Error: No existing credentials found. Please run `vercel login`.\n', code: 1 } })
    await expect(tool('hosting-env').run({}, context())).rejects.toThrow('The Vercel CLI is not signed in (Error: No existing credentials found. Please run `vercel login`.). Sign in with `vercel login`')
    vi.stubEnv('PATH', join(dir, 'empty'))
    await expect(tool('hosting-env').run({}, context())).rejects.toThrow('The Vercel CLI is not installed: install it (npm i -g vercel).')
  })

  it('says a CLI too old for vercel api needs an update, and refuses an answer that is not JSON', async () => {
    replies({ api: { stderr: 'Error: unknown command "api"\n', code: 2 } })
    await expect(tool('hosting-env').run({}, context())).rejects.toThrow('vercel api failed: Error: unknown command "api". A Vercel CLI without `vercel api` needs an update (npm i -g vercel).')
    replies({ api: { stdout: '<html>Bad gateway</html>' } })
    await expect(tool('hosting-env').run({}, context())).rejects.toThrow('vercel api answered something other than JSON for /v10/projects/:project/env.')
  })

  it('reads a project.json whose ids are not ids as no linked project', async () => {
    writeFileSync(join(projectDir, '.vercel/project.json'), JSON.stringify({ projectId: 'prj_1?x=1', orgId: 'team_acme' }))
    await expect(tool('hosting-env').run({}, context())).rejects.toThrow('This project is not linked to a Vercel project (.vercel/project.json).')
    expect(calls()).toEqual([])
  })
})
