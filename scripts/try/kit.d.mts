export declare const root: string
export declare const websiteDir: string
export declare const DEFAULT_NAME: string
export declare function bin(name: string): string
export declare function readEnvFile(path: string): Record<string, string>
export declare function websiteEnv(): Record<string, string>
export declare function deploymentRefusal(env: Record<string, string | undefined>, file?: string): string | null
export declare function childEnv(extra?: Record<string, string | undefined>): NodeJS.ProcessEnv
export declare function scrubDeploymentEnv(): void
export declare function convex(args: string[], options?: { input?: string, timeout?: number, env?: NodeJS.ProcessEnv, cwd?: string }): Promise<string>
export declare function convexRun(fn: string, args?: Record<string, unknown>): Promise<unknown>
export declare function portless(args: string[], env?: NodeJS.ProcessEnv): { status: number, stdout: string, stderr: string }
export declare function localPorts(env: Record<string, string | undefined>): { cloud: number, site: number } | null
export declare const TRY_FLAGS: readonly string[]
export declare function sandboxCatalog(): Promise<{ products?: Record<string, string>, gifts?: Record<string, string> } | undefined>
export declare function proxyDeployment(app: string, name: string, ports: { cloud: number, site: number }, env: NodeJS.ProcessEnv, cleanup: Array<() => unknown>): { api: string, site: string }
export declare function parseTryArgs(argv: string[]): { mode: 'localhost' | 'lan' | 'tailscale', name: string }
export declare function siblingOrigin(origin: string, label: string): string
export declare function waitFor<T>(check: () => Promise<T>, options?: { timeoutMs?: number, intervalMs?: number, what?: string }): Promise<T>
export declare function portHolder(env: Record<string, string | undefined>, adminKey?: string | null): Promise<'ours' | 'foreign' | 'down'>
export declare function foreignPortsMessage(env: Record<string, string | undefined>): string
export declare function deploymentAnswers(siteUrl: string): Promise<boolean>
export declare function createSession(): {
  cleanup: Array<() => unknown>
  end: (code: number) => Promise<never>
  start: (command: string, args: string[], options: import('node:child_process').SpawnOptions) => import('node:child_process').ChildProcess
}
