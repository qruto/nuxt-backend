/**
 * The `hosting-*` tools: the host's API (Vercel), called through the Vercel
 * CLI's own `vercel api`, so they run on your CLI login (`vercel login`) and
 * this server never holds a token. The project is the one `vercel link`
 * wrote into `.vercel/project.json`. Every tool reads; env vars answer by
 * name and target, never by value.
 */
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { defineTool, limit, ToolRefusal, type DevTool, type ToolContext } from './tools'

/** Runs `vercel <args>` in the project and answers its stdout: tests pass a fake. */
export type VercelRunner = (rootDir: string, args: string[]) => Promise<string>

/** What `vercel api` takes as an id in a path: letters, digits, `_` and `-` only. */
const ID = /^[\w-]+$/

/** The linked project: `vercel link` writes it. */
export function linkedProject(rootDir: string): { projectId: string, orgId: string } | null {
  try {
    const { projectId, orgId } = JSON.parse(readFileSync(join(rootDir, '.vercel', 'project.json'), 'utf8')) as { projectId?: unknown, orgId?: unknown }
    return typeof projectId === 'string' && ID.test(projectId) && typeof orgId === 'string' && ID.test(orgId) ? { projectId, orgId } : null
  }
  catch {
    return null
  }
}

const SIGN_IN = 'Sign in with `vercel login`, and link this project with `vercel link`, then call again.'

/**
 * The arguments `vercel` is run with. On Windows the `.cmd` shim needs a
 * shell, and Node hands cmd.exe the arguments unquoted, so an endpoint's
 * `&` would end the command there: such an argument is double-quoted. Every
 * argument here is a fixed word, an id or a number, so quotes are enough.
 */
export function vercelArgs(args: readonly string[], windows: boolean): string[] {
  const all = [...args, '--non-interactive']
  return windows ? all.map(arg => (/[\s&|<>^()]/.test(arg) ? `"${arg}"` : arg)) : all
}

/** `vercel` itself, from PATH, run in the project. */
export const runVercel: VercelRunner = (rootDir, args) => new Promise((resolve, reject) => {
  const windows = process.platform === 'win32'
  execFile(windows ? 'vercel.cmd' : 'vercel', vercelArgs(args, windows), { cwd: rootDir, maxBuffer: 16 * 1024 * 1024, timeout: 60_000, shell: windows }, (error, stdout, stderr) => {
    if (!error) return resolve(stdout)
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return reject(new ToolRefusal(`The Vercel CLI is not installed: install it (npm i -g vercel). ${SIGN_IN}`))
    const said = stderr.trim().split('\n').slice(-3).join(' ')
    reject(new ToolRefusal(/log ?in|credentials|token/i.test(said) ? `The Vercel CLI is not signed in (${said}). ${SIGN_IN}` : `vercel api failed: ${said || error.message}. A Vercel CLI without \`vercel api\` needs an update (npm i -g vercel).`))
  })
})

/** One GET through `vercel api`, scoped to the linked project's team. */
async function get(run: VercelRunner, { rootDir }: ToolContext, path: string, query: Record<string, string | number | undefined>): Promise<Record<string, unknown>> {
  const project = linkedProject(rootDir)
  if (!project) throw new ToolRefusal(`This project is not linked to a Vercel project (.vercel/project.json). ${SIGN_IN}`)
  // A team's id names its scope; a personal account's is the default one.
  const params = new URLSearchParams(project.orgId.startsWith('team_') ? { teamId: project.orgId } : {})
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value))
  const endpoint = `${path.replace(':project', project.projectId)}?${params}`
  const stdout = await run(rootDir, ['api', endpoint, '--raw'])
  try {
    return JSON.parse(stdout) as Record<string, unknown>
  }
  catch {
    throw new ToolRefusal(`vercel api answered something other than JSON for ${path}.`)
  }
}

const deploymentId = z.string().regex(ID, 'a deployment id, such as dpl_…').describe('The deployment id (dpl_…), from hosting-deployments')

export function hostingTools(run: VercelRunner = runVercel): DevTool[] {
  return [
    defineTool({
      name: 'hosting-deployments',
      title: 'Deployments',
      description: 'The linked Vercel project\'s deployments, newest first: each with its id, URL, target, state, branch and commit. Production\'s only with --prod.',
      input: z.object({ limit }),
      provider: true,
      run: async ({ limit }, context) => {
        const answer = await get(run, context, '/v6/deployments', { projectId: linkedProject(context.rootDir)?.projectId, limit, target: context.prod ? 'production' : undefined })
        return ((answer.deployments ?? []) as Array<Record<string, unknown>>).map((deployment) => {
          const meta = (deployment.meta ?? {}) as Record<string, unknown>
          return {
            id: deployment.uid,
            url: deployment.url,
            target: deployment.target ?? 'preview',
            state: deployment.state ?? deployment.readyState,
            createdAt: deployment.created,
            branch: meta.githubCommitRef ?? null,
            commit: meta.githubCommitSha ?? null,
            message: meta.githubCommitMessage ?? null,
          }
        })
      },
    }),
    defineTool({
      name: 'hosting-logs',
      title: 'Deployment build logs',
      description: 'One deployment\'s build log, oldest line first: where a failed build says why.',
      input: z.object({ deploymentId, limit: z.number().int().min(1).max(2000).default(200).describe('How many lines, 200 by default') }),
      provider: true,
      run: async ({ deploymentId, limit }, context) => {
        const answer = await get(run, context, `/v3/deployments/${deploymentId}/events`, { limit }) as unknown
        const events = (Array.isArray(answer) ? answer : []) as Array<Record<string, unknown>>
        return events.map((event) => {
          const payload = (event.payload ?? {}) as Record<string, unknown>
          return { type: event.type, at: event.created ?? payload.date ?? null, text: payload.text ?? event.text ?? '' }
        })
      },
    }),
    defineTool({
      name: 'hosting-env',
      title: 'Hosting env names',
      description: 'The linked Vercel project\'s env vars: each name with the targets it is set for (production, preview, development) and its type. Never a value.',
      input: z.object({}),
      provider: true,
      run: async (_args, context) => {
        const answer = await get(run, context, '/v10/projects/:project/env', {})
        return ((answer.envs ?? []) as Array<Record<string, unknown>>).map(env => ({ name: env.key, target: env.target ?? [], type: env.type, gitBranch: env.gitBranch ?? null }))
      },
    }),
    defineTool({
      name: 'hosting-firewall',
      title: 'Firewall rules',
      description: 'The linked Vercel project\'s active firewall: whether it is on, its custom rules and its managed rule sets.',
      input: z.object({}),
      provider: true,
      run: async (_args, context) => {
        const answer = await get(run, context, '/v1/security/firewall/config/active', { projectId: linkedProject(context.rootDir)?.projectId })
        return {
          enabled: answer.firewallEnabled ?? null,
          rules: ((answer.rules ?? []) as Array<Record<string, unknown>>).map(rule => ({ id: rule.id, name: rule.name, active: rule.active, description: rule.description ?? null, action: (rule.action as { mitigate?: { action?: string } } | undefined)?.mitigate?.action ?? null })),
          managedRules: answer.managedRules ?? null,
          ips: answer.ips ?? [],
        }
      },
    }),
  ]
}
