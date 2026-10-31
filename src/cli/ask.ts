import { createInterface } from 'node:readline'

/** One question at the terminal, as `deploy` and `doctor --fix` ask it; `secret` answers are not echoed. An empty answer skips. */
export type DeployAsk = (question: string, options?: { secret?: boolean }) => Promise<string>

/**
 * Ask on the terminal, on stderr so `stdout` stays the command's own. A
 * secret's keystrokes are not echoed: the question is written, the answer is
 * not, so a provider key lands in no scrollback or screen recording.
 */
export function askOnTerminal(question: string, { secret = false }: { secret?: boolean } = {}): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stderr, terminal: true })
  if (secret) {
    // readline echoes through this one method: let the question through, and nothing typed after it.
    const muted = terminal as unknown as { _writeToOutput: (text: string) => void, output: NodeJS.WritableStream }
    let asked = false
    muted._writeToOutput = (text: string) => {
      if (!asked) {
        asked = true
        muted.output.write(text)
      }
    }
  }
  return new Promise((resolve) => {
    terminal.question(question, (answer) => {
      if (secret) process.stderr.write('\n')
      terminal.close()
      resolve(answer.trim())
    })
  })
}
