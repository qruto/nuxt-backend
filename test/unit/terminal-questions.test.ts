import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askOnTerminal } from '../../src/cli/ask'

// The questions `deploy` and `doctor --fix` ask a person at the terminal:
// asked on stderr, so stdout stays the command's own, and a secret's
// keystrokes never echoed. The terminal is a stream the test types into; what
// reaches stderr is everything the person would see.

let input: PassThrough
let screen: string
beforeEach(() => {
  input = new PassThrough()
  screen = ''
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as typeof process.stdin)
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    screen += String(chunk)
    return true
  })
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** Type a line once the question is on the screen. */
async function type(line: string): Promise<void> {
  await vi.waitFor(() => expect(screen).not.toBe(''))
  input.write(`${line}\r`)
}

describe('deploy\'s questions', () => {
  it('asks on stderr, and answers what was typed without the spaces around it', async () => {
    const answer = askOnTerminal('The app\'s public origin (SITE_URL): ')
    await type('  https://app.example.com  ')
    expect(await answer).toBe('https://app.example.com')
    expect(screen).toContain('The app\'s public origin (SITE_URL): ')
    // What is no secret is echoed as it is typed, as a terminal does.
    expect(screen).toContain('https://app.example.com')
  })

  it('never echoes a secret: the question shows, then nothing typed after it', async () => {
    const answer = askOnTerminal('Paste the production billing access token (Enter to skip): ', { secret: true })
    await type('polar_oat_typed-secret')
    expect(await answer).toBe('polar_oat_typed-secret')
    expect(screen).toContain('Paste the production billing access token (Enter to skip): ')
    expect(screen).not.toContain('polar_oat')
    expect(screen).not.toContain('typed-secret')
    // The person's Enter was not echoed either: the line is ended for them.
    expect(screen.endsWith('\n')).toBe(true)
  })

  it('answers an empty string for a bare Enter, which skips the step', async () => {
    const answer = askOnTerminal('Paste the production email API key (Enter to skip): ', { secret: true })
    await type('')
    expect(await answer).toBe('')
  })
})

describe('doctor --fix\'s question', () => {
  it('asks the same way: on stderr, answering the line typed without the spaces around it', async () => {
    const answer = askOnTerminal('Make which account the first administrator? ')
    await vi.waitFor(() => expect(screen).toContain('Make which account the first administrator? '))
    input.write(' Ada@Example.com \n')
    expect(await answer).toBe('Ada@Example.com')
  })
})
