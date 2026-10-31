// THE PACKAGE MANAGER A READER RUNS. The docs write every command the way
// npm spells it; the build turns each bash block whose commands all convert
// into a block that carries pnpm, yarn and bun too (shared/pm-blocks.ts),
// and the reader picks one in the header, the drawer or on any block
// (components/PmChoice.vue). What this file holds:
//
// - the converter: an npm-form command line to each package manager's, or
//   null when it cannot say with confidence (`convertLines`);
// - the storage key and the head script that sets `html[data-pm]` from it
//   before the first paint, so a prerendered page shows the reader's pick
//   with no flash (plugins/package-manager.ts);
// - the line the Markdown twins and llms.txt carry, since they stay npm.
//
// No Node imports: the client imports the constants, the build the rest.

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const

export type PackageManager = typeof PACKAGE_MANAGERS[number]

/** A package manager the converter writes for: every one but npm, which the docs are written in. */
export type OtherPackageManager = Exclude<PackageManager, 'npm'>

export const OTHER_PACKAGE_MANAGERS = PACKAGE_MANAGERS.filter((pm): pm is OtherPackageManager => pm !== 'npm')

export const isPackageManager = (value: unknown): value is PackageManager => PACKAGE_MANAGERS.includes(value as PackageManager)

/** Where the reader's pick lives: localStorage only, no cookie, so pages prerender and cache as they are. */
export const PM_STORAGE_KEY = 'nuxt-backend-pm'

/**
 * Runs in the head, before the body paints: `html[data-pm]` from the
 * stored pick. CSS shows the matching variant of every block and presses the
 * matching key; without the attribute, npm. Inline, so it reaches the head
 * through `useHead`, which nuxt-security gives a nonce (or a hash, on a
 * prerendered page).
 */
export const PM_HEAD_SCRIPT = `try{var p=localStorage.getItem(${JSON.stringify(PM_STORAGE_KEY)});if(${JSON.stringify(PACKAGE_MANAGERS)}.indexOf(p)>-1)document.documentElement.setAttribute('data-pm',p)}catch(e){}`

/** The tag a converted block takes (shared/pm-blocks.ts); components/PmCode.vue draws it. */
export const PM_TAG = 'pm-code'

/** What the Markdown twins and llms.txt say once, since their commands stay npm. */
export const PM_NOTE = 'Commands use npm; use your project\'s package manager.'

/**
 * Binaries an app built on the package has installed: `npx` runs the local
 * copy, so the other managers run it too (`pnpm nuxt-backend`, `bunx
 * convex`), never `dlx`, which would download another version.
 */
const LOCAL_BINS = new Set(['nuxt-backend', 'convex', 'nuxi', 'nuxt', 'eslint', 'vitest', 'vue-tsc'])

/**
 * Commands pnpm and yarn answer themselves: a script of one of these names
 * runs as `pnpm run <name>`, never `pnpm <name>`.
 */
const BUILTINS = new Set([
  'add', 'audit', 'autoclean', 'bin', 'cache', 'check', 'ci', 'config', 'constraints', 'create', 'dedupe', 'deploy', 'dlx',
  'docs', 'doctor', 'env', 'exec', 'explain', 'fetch', 'generate-lock-entry', 'global', 'help', 'home', 'i', 'import',
  'info', 'init', 'install', 'install-test', 'it', 'licenses', 'link', 'list', 'ln', 'login', 'logout', 'ls', 'node',
  'npm', 'outdated', 'owner', 'pack', 'patch', 'patch-commit', 'patch-remove', 'plugin', 'prune', 'publish', 'rb',
  'rebuild', 'recursive', 'remove', 'repo', 'rm', 'root', 'run', 'search', 'self-update', 'server', 'set', 'setup',
  'stage', 'store', 'tag', 'team', 'un', 'uninstall', 'unlink', 'unplug', 'up', 'update', 'upgrade',
  'upgrade-interactive', 'version', 'view', 'why', 'workspace', 'workspaces',
])

const INSTALL = new Set(['install', 'i', 'in', 'ins', 'add'])
const UNINSTALL = new Set(['uninstall', 'un', 'remove', 'rm', 'r', 'unlink'])
const RUN = new Set(['run', 'run-script', 'rum', 'urn'])
const CREATE = new Set(['create', 'init', 'innit'])
/** npm's own shorthands for `npm run <name>`. */
const SCRIPT_SHORTHANDS = new Set(['test', 'start'])

/** `npm` or `npx` as a word of its own: not `pnpm`, not `npmjs`. */
const MENTIONS_NPM = /(?<![\w.-])np[mx](?![\w.])/

/** One word of a command line, where it sits in it. */
interface Word {
  text: string
  start: number
  end: number
  /** Whether part of it is quoted: a quoted `npm` is an argument, not a command. */
  quoted: boolean
}

/** A command between two operators (`|`, `&&`, `||`, `;`, `&`), as words. */
type Segment = Word[]

/**
 * A line's code read the way a shell splits it: its commands (each a list of
 * words) and where its comment starts, if it has one.
 */
function lex(line: string): { segments: Segment[], comment: number } {
  const segments: Segment[] = [[]]
  let word: Word | undefined
  let quote: '\'' | '"' | undefined
  const end = (at: number) => {
    if (word) segments.at(-1)!.push({ ...word, end: at })
    word = undefined
  }
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (quote) {
      if (char === quote) quote = undefined
      else if (char === '\\' && quote === '"') i++
      continue
    }
    if (char === '\'' || char === '"') {
      word ??= { text: '', start: i, end: i, quoted: false }
      word.quoted = true
      quote = char
      continue
    }
    if (char === '\\') {
      word ??= { text: '', start: i, end: i, quoted: false }
      i++
      continue
    }
    if (/\s/.test(char)) {
      end(i)
      continue
    }
    if (char === '#' && !word) return { segments: close(), comment: i }
    if (char === '|' || char === '&' || char === ';') {
      end(i)
      if (line[i + 1] === char) i++
      segments.push([])
      continue
    }
    word ??= { text: '', start: i, end: i, quoted: false }
  }
  return { segments: close(), comment: -1 }

  function close(): Segment[] {
    end(line.length)
    for (const segment of segments) for (const w of segment) w.text = line.slice(w.start, w.end)
    return segments
  }
}

/** A leading `NAME=value`, which sets the environment of the command after it. */
const isAssignment = (word: Word) => /^[A-Z_]\w*=/i.test(word.text)

const isFlag = (text: string) => text.startsWith('-')

/** `name@version` or `@scope/name@version`: a package with a version. */
const PACKAGE = /^(?:@[^/@\s]+\/)?[^@\s]+(?:@(.+))?$/

/** The words npm's `install`/`uninstall` take, for `pm`, or null when one of them is not one this knows. */
function packageArguments(args: string[], pm: OtherPackageManager): string[] | null {
  const out: string[] = []
  for (const arg of args) {
    if (arg === '-D' || arg === '--save-dev') out.push(pm === 'bun' ? '-d' : '-D')
    else if (arg === '-E' || arg === '--save-exact') out.push(pm === 'bun' ? '--exact' : '-E')
    else if (isFlag(arg)) return null
    else out.push(arg)
  }
  return out
}

/** `npm run <script> [-- args]` for `pm`, or null when the arguments are not a script and what it is passed. */
function runScript(script: string | undefined, rest: string[], pm: OtherPackageManager): string[] | null {
  if (!script || isFlag(script)) return null
  if (rest.length && rest[0] !== '--') return null
  const args = rest.slice(1)
  if (pm === 'bun') return ['bun', 'run', script, ...args]
  return BUILTINS.has(script) ? [pm, 'run', script, ...args] : [pm, script, ...args]
}

/** An `npm …` command's words for `pm`, or null. */
function convertNpm(args: string[], pm: OtherPackageManager): string[] | null {
  const [command, ...rest] = args
  if (!command) return null
  if (INSTALL.has(command)) {
    const packages = packageArguments(rest, pm)
    if (!packages) return null
    if (!packages.some(arg => !isFlag(arg))) return packages.length ? null : [pm, 'install']
    return [pm, 'add', ...packages]
  }
  if (UNINSTALL.has(command)) {
    if (!rest.length || rest.some(isFlag)) return null
    return [pm, 'remove', ...rest]
  }
  if (RUN.has(command)) return runScript(rest[0], rest.slice(1), pm)
  if (SCRIPT_SHORTHANDS.has(command)) return runScript(command, rest, pm)
  if (CREATE.has(command)) {
    const [initializer, ...more] = rest
    if (!initializer || isFlag(initializer)) return null
    const match = PACKAGE.exec(initializer)
    if (!match) return null
    // npm needs `--` before the initializer's own flags; the others pass
    // everything after it straight through.
    const at = more.indexOf('--')
    const passed = at === -1 ? more : [...more.slice(0, at), ...more.slice(at + 1)]
    if (pm !== 'yarn') return [pm, 'create', initializer, ...passed]
    // `yarn create` takes no version: it always runs the latest.
    const version = match[1]
    if (version && version !== 'latest') return null
    return ['yarn', 'create', version ? initializer.slice(0, -(version.length + 1)) : initializer, ...passed]
  }
  return null
}

/** An `npx …` command's words for `pm`, or null. */
function convertNpx(args: string[], pm: OtherPackageManager): string[] | null {
  const [bin, ...rest] = args
  if (!bin || isFlag(bin) || !PACKAGE.test(bin)) return null
  if (LOCAL_BINS.has(bin)) return pm === 'bun' ? ['bunx', bin, ...rest] : [pm, bin, ...rest]
  // Anything else npx downloads and runs: a version pinned, or a tool the
  // app does not depend on (`npx skills add …`).
  return pm === 'bun' ? ['bunx', bin, ...rest] : [pm, 'dlx', bin, ...rest]
}

/** A line as it reads for `pm`, `changed` when a command in it did; null when it cannot say. */
function convertLine(line: string, pm: OtherPackageManager, continued: boolean): { text: string, changed: boolean } | null {
  const { segments, comment } = lex(line)
  const code = comment === -1 ? line : line.slice(0, comment)
  // A line that continues the one above it is that command's arguments.
  if (continued) return MENTIONS_NPM.test(code) ? null : { text: line, changed: false }
  const edits: Array<{ start: number, end: number, text: string }> = []
  for (const segment of segments) {
    const at = segment.findIndex(word => !isAssignment(word))
    const command = segment[at]
    const runs = command && !command.quoted && (command.text === 'npm' || command.text === 'npx') ? command.text : undefined
    if (!command || !runs) {
      // npm named anywhere else (quoted, after `--`, behind `then`) is a
      // command this cannot see the shape of.
      if (segment.some(word => MENTIONS_NPM.test(word.text))) return null
      continue
    }
    const args = segment.slice(at + 1)
    if (args.some(word => MENTIONS_NPM.test(word.text))) return null
    const words = (runs === 'npm' ? convertNpm : convertNpx)(args.map(word => word.text), pm)
    if (!words) return null
    edits.push({ start: command.start, end: segment.at(-1)!.end, text: words.join(' ') })
  }
  let text = line
  for (const { start, end, text: replacement } of edits.reverse()) text = text.slice(0, start) + replacement + text.slice(end)
  return { text, changed: edits.length > 0 }
}

/** Whether a line's code ends with a backslash, which continues it on the next line. */
const continues = (line: string) => {
  const { comment } = lex(line)
  return comment === -1 && /\\$/.test(line.trimEnd())
}

/**
 * The lines of a bash block as `pm` runs them, one for one: comments, blank
 * lines and commands that are not npm's (`cd my-app`) as they are. Null when
 * a line names npm in a way this cannot convert with confidence, or when no
 * line runs npm at all: such a block is left as written.
 */
export function convertLines(lines: readonly string[], pm: PackageManager): string[] | null {
  if (pm === 'npm') return [...lines]
  const out: string[] = []
  let changed = false
  let continued = false
  for (const line of lines) {
    const converted = convertLine(line, pm, continued)
    if (!converted) return null
    out.push(converted.text)
    changed ||= converted.changed
    continued = continues(line)
  }
  return changed ? out : null
}

/** One npm-form command (or a block of them) for `pm`, or null when it cannot say with confidence. */
export function convertCommand(code: string, pm: PackageManager): string | null {
  return convertLines(code.split('\n'), pm)?.join('\n') ?? null
}

/** A block for every other package manager, or null unless every one of them converts. */
export function convertBlock(lines: readonly string[]): Record<OtherPackageManager, string[]> | null {
  const out = {} as Record<OtherPackageManager, string[]>
  for (const pm of OTHER_PACKAGE_MANAGERS) {
    const converted = convertLines(lines, pm)
    if (!converted) return null
    out[pm] = converted
  }
  return out
}
