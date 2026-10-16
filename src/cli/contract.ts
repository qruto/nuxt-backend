import type { ArgsDef, CommandDef } from 'citty'

// The contract a command keeps with whoever runs it, a coding agent above
// all: what it may change, what `--json` prints, and what each exit code
// means. Declared next to the command, shown at the end of its `--help`
// description, and read by the docs and their tests.

/** Something running a command can change. */
export type SideEffect
  = | 'reads only'
    | 'writes project files'
    | 'writes the dev deployment'
    | 'writes production'
    | 'writes provider accounts'

export interface CommandContract {
  /** Everything the command may change; `reads only` alone when nothing. */
  sideEffects: readonly SideEffect[]
  /** What `--json` puts on stdout: one JSON document. Progress goes to stderr. */
  json: string
  /** Each exit code and what it means. */
  exitCodes: Readonly<Record<number, string>>
}

/** Every command declared with a contract, by its path (`billing sync`). */
export const COMMAND_CONTRACTS = new Map<string, CommandContract>()

/** A command with its contract: registered, and its side effects appended to its description. */
export function withContract<T extends ArgsDef>(path: string, contract: CommandContract, command: CommandDef<T>): CommandDef<T> {
  COMMAND_CONTRACTS.set(path, contract)
  const meta = (command.meta ?? {}) as { description?: string }
  return {
    ...command,
    meta: { ...meta, description: `${meta.description ?? ''} [${contract.sideEffects.join('; ')}]`.trim() },
  }
}

/** Where a command's progress lines go: stderr under `--json`, so stdout stays one JSON document. */
export function progress(json: boolean): (line: string) => void {
  return json ? line => console.error(line) : line => console.log(line)
}
