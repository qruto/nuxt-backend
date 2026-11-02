import type { ArgsDef, CommandDef } from 'citty'

// The contract a command keeps with whoever runs it, a coding agent above
// all: what it may change, what `--json` prints, and what each exit code
// means. Declared next to the command, shown at the end of its `--help`
// description, and read by the docs and their tests. No command prompts for
// input: every input is a flag, so an agent can run each one unattended.

/** Something running a command can change. */
export type SideEffect
  = | 'reads only'
    | 'writes project files'
    | 'writes the dev deployment'
    | 'writes a preview deployment'
    | 'writes project env defaults'
    | 'writes production'
    | 'writes provider accounts'

export interface CommandContract {
  /** Everything the command may change without the flags in `byFlag`; `reads only` alone when nothing. */
  sideEffects: readonly SideEffect[]
  /**
   * What the command changes instead with a flag, or flags, given: `doctor`
   * reads only, and writes with `--fix`.
   */
  byFlag?: Readonly<Record<string, readonly SideEffect[]>>
  /** What `--json` puts on stdout: one JSON document. Progress goes to stderr. */
  json: string
  /** Each exit code and what it means. */
  exitCodes: Readonly<Record<number, string>>
}

/** Every command declared with a contract, by its path (`billing sync`). */
export const COMMAND_CONTRACTS = new Map<string, CommandContract>()

/** A contract's side effects on one line: `writes the dev deployment; --prod: writes production`. */
export function describeSideEffects(contract: CommandContract): string {
  const byFlag = Object.entries(contract.byFlag ?? {}).map(([flag, effects]) => `${flag}: ${effects.join(', ')}`)
  return [contract.sideEffects.join('; '), ...byFlag].join('; ')
}

/** A command with its contract: registered, and its side effects appended to its description. */
export function withContract<T extends ArgsDef>(path: string, contract: CommandContract, command: CommandDef<T>): CommandDef<T> {
  COMMAND_CONTRACTS.set(path, contract)
  const meta = (command.meta ?? {}) as { description?: string }
  return {
    ...command,
    meta: { ...meta, description: `${meta.description ?? ''} [${describeSideEffects(contract)}]`.trim() },
  }
}

/** End a command: its outcome as the one JSON document stdout holds under `--json`, and its exit code. */
export function finish(json: boolean, { exitCode, output }: { exitCode: number, output?: unknown }): void {
  if (json && output) console.log(JSON.stringify(output, null, 2))
  if (exitCode !== 0) process.exitCode = exitCode
}

/** Where a command's progress lines go: stderr under `--json`, so stdout stays one JSON document. */
export function progress(json: boolean): (line: string) => void {
  return json ? line => console.error(line) : line => console.log(line)
}
