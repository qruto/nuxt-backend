/**
 * Reference › Cheat sheet: one scannable page, from the same registries as
 * the rest of the reference: every composable with its return shape (its
 * `Use<Name>Return` interface), every setup helper, CLI command and flag,
 * env name and error code. Its Markdown twin is an agent's quick lookup.
 */
import { main } from '../../src/cli/main.ts'
import { COMMAND_CONTRACTS, describeSideEffects } from '../../src/cli/contract.ts'
import { BACKEND_ENV } from '../../src/env-registry.ts'
import { setupHelpers } from './backend.mjs'
import { commandPaths } from './cli.mjs'
import { errorSummary } from './errors.mjs'
import { blocks, code, codes, link, table } from './markdown.mjs'
import { returnShape } from './nuxt.mjs'
import { PAGES } from './paths.mjs'
import { registeredComposables } from './registry.mjs'

/** Every composable with the names it returns. */
function composables() {
  return table(['Composable', 'Returns'], registeredComposables()
    .filter(({ name }) => name.startsWith('use'))
    .map(({ name, file }) => {
      const shape = returnShape(name, file)
      return [code(name), shape ? code(`{ ${shape.join(', ')} }`) : '—']
    }))
}

/** A command's flags as they are typed: `--force`, `--no-agents`, `[address]`, `<event>` (a required positional). */
function flagsOf(path) {
  const command = path.split(' ').reduce((node, name) => node.subCommands[name], main)
  return Object.entries(command.args ?? {})
    .filter(([name]) => name !== 'cwd')
    .map(([name, arg]) => arg.type === 'positional' ? (arg.required ? `<${name}>` : `[${name}]`) : arg.type === 'boolean' && arg.default === true ? `--no-${name}` : `--${name}`)
}

/** Every command with its flags and what it may change. */
function commands() {
  return table(['Command', 'Flags', 'May change'], commandPaths().map(path => [
    link(code(`nuxt-backend ${path}`), `${PAGES.cli}#${path.replace(/ /g, '-')}`),
    codes(flagsOf(path), ''),
    describeSideEffects(COMMAND_CONTRACTS.get(path)),
  ]))
}

/** The whole page body. */
export function cheatSheet() {
  return blocks(
    '## Composables',
    composables(),
    '## Setup helpers',
    table(['Helper', 'Import'], setupHelpers().map(({ name, path }) => [code(name), code(path)])),
    '## CLI',
    commands(),
    '## Environment variables',
    table(['Variable', 'Read on', 'Required'], Object.entries(BACKEND_ENV).map(([name, entry]) => [code(name), entry.side, entry.required ? 'yes' : 'no'])),
    '## Error codes',
    errorSummary(),
  )
}
