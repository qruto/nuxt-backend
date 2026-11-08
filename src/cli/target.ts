import { deployKeyType, nonProductionDeployKey, readEnvFiles } from '../env-push'

/**
 * Why a command that writes the dev deployment, or production with
 * `--prod`, may not run: a `CONVEX_DEPLOY_KEY` the Convex CLI would follow
 * to another deployment, whatever the flags say. Looked up where the Convex
 * CLI looks: the process env, then `.env.local`, then `.env`. Undefined when
 * the flags pick the deployment the CLI acts on.
 */
export function targetKeyRefusal(rootDir: string, prod: boolean): string | undefined {
  const env = { ...readEnvFiles(rootDir), ...process.env }
  if (prod) {
    const foreign = nonProductionDeployKey(env)
    return foreign ? `CONVEX_DEPLOY_KEY is a ${foreign} deploy key, and the Convex CLI would act on that deployment instead of production. Use the production deploy key, or unset it to use your Convex login.` : undefined
  }
  const type = deployKeyType(env)
  return type !== null && type !== 'dev'
    ? `CONVEX_DEPLOY_KEY is a ${type} deploy key, and the Convex CLI follows it whatever the flags say, so it would act on that deployment instead of the dev one. Unset it for the dev deployment, or pass --prod for production.`
    : undefined
}
