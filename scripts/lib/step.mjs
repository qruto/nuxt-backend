import { execFileSync } from 'node:child_process'

/**
 * Run one labelled step of a check script. Streams the tool's output and throws
 * on a non-zero exit, so the first failure stops the script with that tool's own
 * message on screen rather than a wrapper's summary of it.
 *
 * Shared by `check-tarball.mjs` and `check-consumer-types.mjs`. Both are a
 * sequence of "print a heading, run a tool, fail loudly", and both are run by
 * ci's pack job and by hand.
 */
export function step(label, file, args, options = {}) {
  console.log(`── ${label} ${'─'.repeat(Math.max(0, 46 - label.length))}`)
  execFileSync(file, args, { stdio: 'inherit', ...options })
  console.log()
}
