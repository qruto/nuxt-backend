import { readConvexConfigDrift } from '../convex-config'
import { runConvex } from '../convex-cli'
import { configuredDeployment, isDevDeployment } from '../env-push'
import type { DevtoolsBackendHealth, DevtoolsMaintenanceTask } from './rpc-types'

/** The backend component's maintenance health from a dev deployment: `convex run --component backend maintenance:status`. */
async function readMaintenance(rootDir: string): Promise<DevtoolsBackendHealth['maintenance']> {
  if (!configuredDeployment(rootDir)) return { status: 'unavailable', reason: 'No deployment is configured yet (CONVEX_DEPLOYMENT).' }
  if (!isDevDeployment(rootDir)) return { status: 'unavailable', reason: 'The panel reads only a dev deployment.' }
  try {
    const { stdout } = await runConvex(rootDir, ['run', '--component', 'backend', 'maintenance:status'])
    const tasks = JSON.parse(stdout) as unknown
    if (!Array.isArray(tasks)) return { status: 'unavailable', reason: 'The deployment answered with something other than a task list.' }
    return { status: 'ok', tasks: tasks as DevtoolsMaintenanceTask[] }
  }
  catch {
    // A deployment from before the component had maintenance has no such
    // function, as does one that is not running.
    return { status: 'unavailable', reason: 'The Convex CLI could not read maintenance:status (deploy this version first).' }
  }
}

/**
 * The panel's Overview health: every component the scaffold or the app
 * mounts and whether it is mounted, the route groups `http.ts` lacks, and
 * the backend component's maintenance.
 */
export async function readBackendHealth(rootDir: string, now: () => number = Date.now): Promise<DevtoolsBackendHealth> {
  const [drift, maintenance] = await Promise.all([readConvexConfigDrift(rootDir), readMaintenance(rootDir)])
  return {
    readAt: now(),
    mounts: drift.mounts,
    missingRoutes: drift.missingRoutes,
    maintenance,
  }
}
