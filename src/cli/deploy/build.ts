import { deployKeyType } from '../../env-push'
import { generateSecret, productionOrigin, type DeployBackend } from './run'

// `nuxt-backend deploy --build`: the host's build command for an app that
// starts on the host, such as the deploy template. The Convex Marketplace
// integration gives the Vercel project its deploy keys and nothing else, so
// the first push would fail on the env the scaffold requires. This puts
// that env there, then runs the build command every host uses: the backend
// first, then the app against it.

export interface BuildDeps {
  backend: Pick<DeployBackend, 'envNames' | 'setEnv'>
  /** `convex deploy` with these arguments, its output the build's; resolves with its exit code. */
  convexDeploy: (args: string[]) => Promise<number>
  env: Readonly<Record<string, string | undefined>>
  print: (line: string) => void
}

/** What `--cmd` runs: the app's build, after the preview's own env where the key is a preview's. */
export function buildCmd(preview: boolean, env: Readonly<Record<string, string | undefined>>): string {
  if (!preview) return 'npm run build'
  // The branch's stable URL is the preview's origin, expanded by the shell `convex deploy` runs the command in.
  const site = env.VERCEL_BRANCH_URL ? ' --site-url "https://$VERCEL_BRANCH_URL"' : ''
  return `npx nuxt-backend env push --preview${site} && npm run build`
}

/**
 * Production's first-push env: a generated `AUTH_SECRET` and the host's
 * production origin as `SITE_URL`, each only where production has none.
 * `BACKEND_ENVIRONMENT` is left unset, which keeps every provider in its
 * test mode until `nuxt-backend deploy` makes the app live. Resolves with
 * why it cannot, or null.
 */
async function firstPushEnv(deps: BuildDeps): Promise<string | null> {
  const names = await deps.backend.envNames()
  if (!names) return 'production does not answer with the CONVEX_DEPLOY_KEY of this build: check the key in the host\'s env.'
  if (!names.includes('AUTH_SECRET')) {
    await deps.backend.setEnv('AUTH_SECRET', generateSecret())
    deps.print('[nuxt-backend] deploy --build: generated AUTH_SECRET for production')
  }
  if (!names.includes('SITE_URL')) {
    const host = deps.env.VERCEL_PROJECT_PRODUCTION_URL
    const origin = productionOrigin(deps.env.SITE_URL || (host ? `https://${host}` : undefined))
    if (!origin) return 'production has no SITE_URL, and this build names no https origin for it: set SITE_URL in the host\'s env, or on production (npx convex env set --prod SITE_URL).'
    await deps.backend.setEnv('SITE_URL', origin)
    deps.print(`[nuxt-backend] deploy --build: SITE_URL is ${origin}`)
  }
  return null
}

/** Run as the host's build command. Resolves with the exit code the build should end with. */
export async function runBuild(deps: BuildDeps): Promise<number> {
  const type = deployKeyType({ ...deps.env })
  if (type === null || type === 'dev') {
    deps.print(`[nuxt-backend] deploy --build refused: it runs in the host's build, with a production or preview CONVEX_DEPLOY_KEY in the host's env${type === 'dev' ? ', not a dev one' : ''}. On Vercel, add Convex through the Marketplace, or set the key from the Convex dashboard.`)
    return 1
  }
  const preview = type === 'preview'
  if (!preview) {
    const refusal = await firstPushEnv(deps)
    if (refusal) {
      deps.print(`[nuxt-backend] deploy --build: ${refusal}`)
      return 1
    }
  }
  return deps.convexDeploy(['deploy', '--cmd', buildCmd(preview, deps.env), '--cmd-url-env-var-name', 'NUXT_PUBLIC_BACKEND_URL'])
}
