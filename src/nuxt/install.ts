import { getAddDependencyCommand, useTerminal, type NuxtTerminal } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { relative, isAbsolute } from 'node:path'
import { isCI } from 'std-env'
import { packageDir } from '../dirs'
import { addedDependencies, formatNextSteps, installDeclaredDependencies, setUpProject } from '../setup'
import { logger } from './logger'

// The module's install step: `npx nuxt module add nuxt-backend` installs the
// package, lists it in `modules`, then runs `nuxt prepare`, where Nuxt calls
// the module's `onInstall` once (it records the version in `.nuxtrc`). That
// step is the whole setup `npx nuxt-backend init` does, plus the `convex`
// install, asked at the terminal that ran it.

/** What the install step needs from its surroundings, injectable for tests. */
export interface InstallSurroundings {
  terminal: Pick<NuxtTerminal, 'prompt' | 'withTerminal'>
  /** Whether a person is at the terminal to answer: never in CI or a test run. */
  interactive: boolean
  /** The project's package manager: `npm`, `pnpm`, `yarn` or `bun`. */
  packageManager: () => Promise<string>
  /** Install what the manifest declares; whether it worked. */
  install: (rootDir: string, packageManager: string) => boolean
  log: (line: string) => void
}

/** Whether a person can answer at this terminal: both ends a TTY, outside CI. */
function terminalIsInteractive(terminal: Pick<NuxtTerminal, 'interactive'>): boolean {
  if (isCI) return false
  return terminal.interactive || (process.stdin.isTTY === true && process.stdout.isTTY === true)
}

function defaultSurroundings(nuxt: Nuxt): InstallSurroundings {
  const terminal = useTerminal()
  return {
    terminal,
    interactive: terminalIsInteractive(terminal),
    packageManager: async () => (await getAddDependencyCommand('convex', nuxt.options.rootDir)).split(' ')[0]!,
    install: installDeclaredDependencies,
    log: line => logger.info(line.replace(/^\[nuxt-backend\] /, '')),
  }
}

/**
 * Set the project up on install, at an interactive terminal under
 * `nuxt prepare` or `nuxt dev`. Anywhere else (a build, CI, a test run, an
 * agent without a terminal) it writes nothing and names `init`, which does
 * the same.
 */
export async function installProject(nuxt: Nuxt, given: Partial<InstallSurroundings> = {}): Promise<void> {
  // The apps inside this package's own repository (the website, the
  // examples, the test fixtures) use it from source: there is nothing to set up.
  if (isInside(nuxt.options.rootDir, packageDir)) return
  const surroundings = { ...defaultSurroundings(nuxt), ...given }
  const { terminal, log } = surroundings
  const prepareOrDev = nuxt.options.dev || nuxt.options._prepare
  if (nuxt.options.test || !prepareOrDev || !surroundings.interactive) {
    log('nuxt-backend is installed. Its setup runs at an interactive terminal: run `npx nuxt-backend init` to write the backend files, .env.example and the agent files.')
    return
  }

  const rootDir = nuxt.options.rootDir
  const agents = await terminal.prompt('Write the files your coding agent reads (an AGENTS.md section, the agent skills and the nuxt-backend server in .mcp.json)?', { type: 'confirm', initial: true }) === true
  const setup = setUpProject(rootDir, { agents, print: log })

  let installed = false
  if (addedDependencies(setup)) {
    const packageManager = await surroundings.packageManager()
    log(`Installing the dependencies setup added with ${packageManager}...`)
    installed = await terminal.withTerminal(async () => surroundings.install(rootDir, packageManager))
    if (!installed) log(`Installing did not finish: run \`${packageManager} install\` yourself.`)
  }
  log(formatNextSteps(setup, { installed }))
}

/** Whether `path` is `dir` or below it. */
function isInside(path: string, dir: string): boolean {
  const to = relative(dir, path)
  return !to.startsWith('..') && !isAbsolute(to)
}

/** On a newer version than the one `.nuxtrc` recorded: say what upgrades the app, and change nothing. */
export function announceUpgrade(previousVersion: string, version: string, log: (line: string) => void = line => logger.info(line)): void {
  log(`nuxt-backend ${previousVersion} → ${version}: run \`npx nuxt-backend upgrade\` to repair the scaffold and run the package's data migrations, then \`npx nuxt-backend doctor\`.`)
}
