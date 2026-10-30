import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'
import { defineCommand } from 'citty'
import { emailTemplateFile, PACKAGED_EMAIL_TEMPLATES, type EmailTemplateName } from '../convex/email-templates'
import { packageDir } from '../dirs'
import { BACKEND_PAGE_DEFS } from '../pages'
import { REGISTERED_UI, uiEntry, uiPath } from '../ui/registry'
import { installedVersion } from '../agents'
import { resolveFunctionsDir } from '../scaffold'
import { withContract } from './contract'

// `nuxt-backend eject <Part|page:<key>|email:<name>>`: the packaged source
// copied into the app, stamped with the version it came from, so the app
// owns it and `upgrade` can show what changed upstream since. A part or a
// component lands in app/components/ under its own name (a same-named app
// component replaces the packaged one everywhere), a page at its path in
// app/pages/, an email in emails/ of the functions directory (backend/,
// or the one convex.json names), added to `setupEmail`'s `templates`.

/** The stamp an ejected file starts with: which packaged source, at which version. */
const STAMP = /nuxt-backend eject: ([^@\s]+)@([\w.+-]+)/

/** One thing `eject` can copy. */
export interface Ejectable {
  /** What `eject` takes: `PricingPlanCard`, `page:pricing`, `email:invite`. */
  target: string
  kind: 'part' | 'component' | 'page' | 'email'
  /** Each file: its packaged source, relative to the package's root, and where it lands, relative to the app's. */
  files: Array<{ source: string, destination: string }>
}

/** Where an app keeps its components and pages: `app/` (Nuxt 4) when it has one. */
function srcDir(rootDir: string): string {
  return existsSync(join(rootDir, 'app')) ? 'app' : '.'
}

/** A packaged `.vue` or `.css` file's source: the shipped source, else the build's copy. */
function packaged(path: string): string | undefined {
  for (const candidate of [join(packageDir, path), join(packageDir, path.replace(/^src\//, 'dist/'))]) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** Everything `eject` can copy, in the order `--list` prints it. */
export function ejectables(rootDir: string): Ejectable[] {
  const app = srcDir(rootDir)
  const components = REGISTERED_UI.map((entry): Ejectable => {
    const base = `src/runtime/vue/components/${uiPath(entry)}`
    const files = [{ source: `${base}.vue`, destination: posix.join(app, 'components', `${entry.name}.vue`) }]
    if (packaged(`${base}.css`)) files.push({ source: `${base}.css`, destination: posix.join(app, 'components', `${entry.name}.css`) })
    return { target: entry.name, kind: entry.kind === 'part' ? 'part' : 'component', files }
  })
  const pages = BACKEND_PAGE_DEFS.map((def): Ejectable => ({
    target: `page:${def.key}`,
    kind: 'page',
    files: [{ source: `src/runtime/vue/pages/${def.file}.vue`, destination: posix.join(app, 'pages', `${def.defaultPath.replace(/^\//, '') || 'index'}.vue`) }],
  }))
  const emails = (Object.keys(PACKAGED_EMAIL_TEMPLATES) as EmailTemplateName[]).map((name): Ejectable => ({
    target: `email:${name}`,
    kind: 'email',
    files: [{ source: `src/convex/emails/${emailTemplateFile(name)}`, destination: posix.join(resolveFunctionsDir(rootDir), 'emails', emailTemplateFile(name)) }],
  }))
  return [...components, ...pages, ...emails]
}

/** The edit distance between two names. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = current
    }
  }
  return row[b.length]!
}

/** The names closest to an unknown one, nearest first: those that contain it or that it contains, and those a few edits away. */
export function closeMatches(target: string, names: readonly string[]): string[] {
  const wanted = target.toLowerCase()
  const bare = (name: string) => name.toLowerCase().replace(/^\w+:/, '')
  const near = (name: string) => bare(name).includes(wanted) || wanted.includes(bare(name)) || distance(wanted, bare(name)) <= Math.ceil(wanted.length / 3)
  return names.filter(near).sort((a, b) => distance(wanted, bare(a)) - distance(wanted, bare(b))).slice(0, 3)
}

/**
 * A packaged `.vue` file's imports as an app's copy reads them: the part
 * types and the accessibility helpers by their aliases (`#backend/parts`,
 * `#backend/a11y`), and every other file of the package's runtime through
 * `#backend/runtime`, which the module points at it.
 */
export function rewriteImports(text: string, source: string): string {
  const from = posix.dirname(source.replace(/^src\/runtime\/vue\//, ''))
  return text.replace(/from '(\.{1,2}\/[^']+)'/g, (match, specifier: string) => {
    const target = posix.normalize(posix.join(from, specifier))
    if (target === 'parts') return 'from \'#backend/parts\''
    if (target === 'a11y') return 'from \'#backend/a11y\''
    return `from '#backend/runtime/${target}'`
  })
}

/** The `definePageMeta` a packaged page's copy needs: the guard the module puts on its own page. */
function pageMeta(key: string): string | null {
  const def = BACKEND_PAGE_DEFS.find(entry => entry.key === key)!
  if (!def.auth) return null
  const rules = def.access ? `{ ${Object.entries(def.access).map(([key, value]) => `${key}: ${JSON.stringify(value).replace(/"/g, '\'')}`).join(', ')} }` : 'true'
  return `definePageMeta({ auth: ${rules} })`
}

/**
 * A packaged email's copy: its own source (src/convex/emails/), the blocks
 * and words as the package writes them, stamped, its imports on
 * `nuxt-backend/email`, which exports every type and helper it reads.
 */
function emailCopy(name: EmailTemplateName, text: string, stamp: string): string {
  const source = text.replace(/from '\.\.\/email-(?:templates|helpers)\.js'/g, 'from \'nuxt-backend/email\'')
  return [
    `// ${stamp}`,
    `// Sent in place of the packaged \`${name}\` email: ../email.ts lists it in \`setupEmail\`'s \`templates\`.`,
    source,
  ].join('\n')
}

/**
 * Add an ejected email to `setupEmail`'s `templates` in the functions directory's email.ts.
 * `false` when the file's call has a shape this cannot edit safely: the
 * caller then names the line to add.
 */
export function addEmailTemplate(text: string, name: string): string | false {
  const file = emailTemplateFile(name as EmailTemplateName).replace(/\.ts$/, '')
  if (text.includes(`from './emails/${file}'`)) return text
  const imported = `import { ${name} } from './emails/${file}'\n`
  const lastImport = [...text.matchAll(/^import .+$/gm)].at(-1)
  const withImport = lastImport ? `${text.slice(0, lastImport.index + lastImport[0].length + 1)}${imported}${text.slice(lastImport.index + lastImport[0].length + 1)}` : `${imported}${text}`
  if (/templates: \{/.test(withImport)) return withImport.replace(/templates: \{/, `templates: { ${name},`)
  if (/setupEmail\(components\)/.test(withImport)) return withImport.replace(/setupEmail\(components\)/, `setupEmail(components, { templates: { ${name} } })`)
  if (/setupEmail\(components, \{/.test(withImport)) return withImport.replace(/setupEmail\(components, \{/, `setupEmail(components, { templates: { ${name} },`)
  return false
}

/** What `eject` wrote, or why it wrote nothing. */
export interface EjectReport {
  target: string
  version: string
  written: string[]
  /** A step left to do by hand: the email template to add when `email.ts` has a shape `eject` does not edit. */
  todo?: string
}

/** Thrown for a target `eject` cannot copy: unknown, or a file in the way. */
export class EjectError extends Error {
  override name = 'EjectError'
}

/** Writes a file of the app's, recording what it wrote. */
type Write = (destination: string, text: string) => void

/** Copy an email template: its override file, and its place in `setupEmail`'s templates; the step left when `email.ts` has a shape this cannot edit. */
function copyEmail(rootDir: string, found: Ejectable, stamp: string, write: Write): string | undefined {
  const name = found.target.slice('email:'.length) as EmailTemplateName
  const file = found.files[0]!
  const source = packaged(file.source)
  if (!source) throw new EjectError(`The installed nuxt-backend ships no ${file.source}: reinstall it, then eject again.`)
  write(file.destination, emailCopy(name, readFileSync(source, 'utf8'), stamp))
  const emailPath = posix.join(resolveFunctionsDir(rootDir), 'email.ts')
  const emailFile = join(rootDir, emailPath)
  const before = existsSync(emailFile) ? readFileSync(emailFile, 'utf8') : undefined
  const edited = before === undefined ? false : addEmailTemplate(before, name)
  if (edited === false) return `Add \`${name}\` to \`setupEmail\`'s \`templates\` in ${emailPath}: \`import { ${name} } from './emails/${emailTemplateFile(name).replace(/\.ts$/, '')}'\`.`
  if (edited !== before) write(emailPath, edited)
  return undefined
}

/** A packaged `.vue` file as the app's copy holds it: stamped, its imports on the package's aliases, a page with its guard, and its stylesheet beside it. */
function vueCopy(found: Ejectable, source: string, text: string, stamp: string): string {
  let copy = `<!-- ${stamp} -->\n${rewriteImports(text, source)}`
  const meta = found.kind === 'page' ? pageMeta(found.target.slice('page:'.length)) : null
  if (meta) copy = copy.replace(/\ndefineOptions\(/, `\n${meta}\ndefineOptions(`)
  const css = found.files.find(other => other.source.endsWith('.css'))
  return css ? `${copy.trimEnd()}\n\n<style src="./${posix.basename(css.destination)}"></style>\n` : copy
}

/** The ejectable a target names, or the error that names the close matches. */
function find(rootDir: string, target: string): Ejectable {
  const all = ejectables(rootDir)
  const found = all.find(entry => entry.target === target) ?? all.find(entry => entry.target.toLowerCase() === target.toLowerCase())
  if (found) return found
  const matches = closeMatches(target, all.map(entry => entry.target))
  throw new EjectError(`\`${target}\` is no part, page or email to eject.${matches.length ? ` Did you mean ${matches.map(name => `\`${name}\``).join(', ')}?` : ''} \`npx nuxt-backend eject --list\` prints them all.`)
}

/** Copy one packaged part, component, page or email into the app at `rootDir`. */
export function eject(rootDir: string, target: string, options: { force?: boolean } = {}): EjectReport {
  const found = find(rootDir, target)
  const version = installedVersion(rootDir)
  const stamp = `nuxt-backend eject: ${found.target}@${version}`
  const taken = found.files.filter(file => existsSync(join(rootDir, file.destination)))
  if (taken.length && !options.force) throw new EjectError(`${taken.map(file => file.destination).join(' and ')} already exists: pass --force to overwrite it.`)

  const written: string[] = []
  const write: Write = (destination, text) => {
    mkdirSync(dirname(join(rootDir, destination)), { recursive: true })
    writeFileSync(join(rootDir, destination), text)
    written.push(destination)
  }
  if (found.kind === 'email') {
    const todo = copyEmail(rootDir, found, stamp, write)
    return { target: found.target, version, written, ...(todo ? { todo } : {}) }
  }
  for (const file of found.files) {
    const source = packaged(file.source)
    if (!source) throw new EjectError(`The installed nuxt-backend ships no ${file.source}: reinstall it, then eject again.`)
    const text = readFileSync(source, 'utf8')
    write(file.destination, file.source.endsWith('.css') ? `/* ${stamp} */\n${text}` : vueCopy(found, file.source, text, stamp))
  }
  return { target: found.target, version, written }
}

/** A file an app ejected: what it was, from which version, and where it is. */
export interface EjectedFile {
  target: string
  version: string
  /** The file, relative to the app's root. */
  file: string
}

/** Every ejected file in the app at `rootDir`, by the stamp it starts with. */
export function ejectedFiles(rootDir: string): EjectedFile[] {
  const app = srcDir(rootDir)
  const dirs = [posix.join(app, 'components'), posix.join(app, 'pages'), posix.join(resolveFunctionsDir(rootDir), 'emails')]
  const found: EjectedFile[] = []
  const walk = (dir: string) => {
    const absolute = join(rootDir, dir)
    if (!existsSync(absolute)) return
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = posix.join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(?:vue|css|ts)$/.test(entry.name)) {
        const head = readFileSync(join(rootDir, path), 'utf8').slice(0, 200)
        const stamp = head.match(STAMP)
        if (stamp) found.push({ target: stamp[1]!, version: stamp[2]!, file: path })
      }
    }
  }
  for (const dir of dirs) walk(dir)
  return found
}

/** The packaged source of one ejected file, as a version shipped it: what `upgrade` diffs. */
export type PackagedSource = (version: string, path: string) => Promise<string | undefined>

/** A packaged file at a version: the installed package's own, else the copy the npm CDN serves. */
export function packagedSource(installed: string, fetcher: typeof fetch = fetch): PackagedSource {
  return async (version, path) => {
    if (version === installed) {
      const local = packaged(path)
      return local ? readFileSync(local, 'utf8') : undefined
    }
    try {
      const response = await fetcher(`https://cdn.jsdelivr.net/npm/nuxt-backend@${encodeURIComponent(version)}/${path}`)
      return response.ok ? await response.text() : undefined
    }
    catch {
      return undefined
    }
  }
}

/** The packaged source an ejected file came from, relative to the package's root; `undefined` for a target this version no longer ships. */
export function sourceOf(rootDir: string, ejected: EjectedFile): string | undefined {
  const entry = ejectables(rootDir).find(candidate => candidate.target === ejected.target)
  if (!entry) return undefined
  const extension = posix.extname(ejected.file)
  return entry.files.find(file => posix.extname(file.source) === extension)?.source
}

/** The part or component an ejected target names, for a message: `undefined` when this version has none by that name. */
export function stillShipped(target: string): boolean {
  if (target.startsWith('page:')) return BACKEND_PAGE_DEFS.some(def => `page:${def.key}` === target)
  if (target.startsWith('email:')) return target.slice('email:'.length) in PACKAGED_EMAIL_TEMPLATES
  return uiEntry(target) !== undefined
}

/** The ejected file's path for a message, relative to the current directory. */
export const shown = (rootDir: string, file: string) => relative(process.cwd(), join(rootDir, file)) || file

export const ejectCommand = withContract('eject', {
  sideEffects: ['writes project files'],
  byFlag: { '--list': ['reads only'] },
  json: 'each file it wrote, with the version stamped in it: `{ target, version, written, todo? }`; with `--list`, `[{ target, kind, ejected }]`',
  exitCodes: {
    0: 'the source was copied',
    1: 'the name is unknown, or a file is in the way and `--force` was not given',
  },
}, defineCommand({
  meta: { name: 'eject', description: 'Copy a part\'s, a page\'s or an email\'s packaged source into the app, stamped with its version, so the app owns it' },
  args: {
    target: { type: 'positional', description: 'A part or a component (`PricingPlanCard`), `page:<key>` or `email:<name>`', required: false },
    cwd: { type: 'string', description: 'Project directory', default: '.' },
    list: { type: 'boolean', description: 'Print every name it can eject, and change nothing', default: false },
    force: { type: 'boolean', description: 'Overwrite a file of that name already in the app', default: false },
    json: { type: 'boolean', description: 'Machine-readable output', default: false },
  },
  run({ args }) {
    const rootDir = resolve(process.cwd(), args.cwd)
    if (args.list || !args.target) {
      const ejected = new Set(ejectedFiles(rootDir).map(file => file.target))
      const list = ejectables(rootDir).map(entry => ({ target: entry.target, kind: entry.kind, ejected: ejected.has(entry.target) }))
      console.log(args.json ? JSON.stringify(list, null, 2) : list.map(entry => `${entry.ejected ? '✓' : ' '} ${entry.target.padEnd(28)} ${entry.kind}`).join('\n'))
      if (!args.list && !args.target) process.exitCode = 1
      return
    }
    try {
      const report = eject(rootDir, args.target, { force: args.force })
      if (args.json) {
        console.log(JSON.stringify(report, null, 2))
        return
      }
      for (const file of report.written) console.log(`✔ ${shown(rootDir, file).padEnd(40)} from nuxt-backend ${report.version}`)
      if (report.todo) console.log(`  ↳ ${report.todo}`)
    }
    catch (error) {
      if (!(error instanceof EjectError)) throw error
      console.error(`[nuxt-backend] eject: ${error.message}`)
      process.exitCode = 1
    }
  },
}))
