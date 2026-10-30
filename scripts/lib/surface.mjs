/**
 * The package's public surface, read from its TypeScript sources with the
 * TypeScript parser (no type checker, so it stays fast): the import paths
 * and what each exports, with doc comments; what the module registers in an
 * app (src/nuxt/); and what the base module adds beside it. The generators
 * that write docs and agent guidance from the code share it, so they read
 * one surface the same way.
 *
 * Every reader throws when it finds nothing, or a registration it cannot
 * read: a silent empty list would publish a surface with a hole in it.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { BRAND_NAME, PROVIDER_WORDED_COMPONENTS } from '../../src/nuxt/registry.ts'
import { REGISTERED_UI, uiPath } from '../../src/ui/registry.ts'

/** The repository root. */
export const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/** A repository file's text. */
export const readText = file => readFileSync(join(root, file), 'utf8')

const parsed = new Map()

/** A source file, parsed once. `file` is repository-relative. */
export function sourceOf(file) {
  if (!parsed.has(file)) parsed.set(file, ts.createSourceFile(file, file.endsWith('.vue') ? scriptSetupOf(readText(file)) : readText(file), ts.ScriptTarget.Latest, true))
  return parsed.get(file)
}

/** A `.vue` file's `<script setup>` block, the code a single-file component declares itself in. */
export function scriptSetupOf(text) {
  return text.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
}

/** A `.vue` file's `defineOptions({ name })` statement: its doc comment is the component's. */
function componentStatement(file) {
  return sourceOf(file).statements.find(statement => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.getText() === 'defineOptions')
}

/** A relative import of `file` as the repository path of the `.ts` source it names, or `undefined`. */
function resolveImport(file, specifier) {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(join(root, dirname(file)), specifier.replace(/\.js$/, ''))
  const found = [`${base}.ts`, join(base, 'index.ts')].find(candidate => existsSync(candidate))
  return found ? found.slice(root.length + 1).split('\\').join('/') : undefined
}

/** The names a statement declares at the top level, a destructured `const { a, b } = …` included. */
function declaredNames(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap(declaration => ts.isObjectBindingPattern(declaration.name)
      ? declaration.name.elements.map(element => element.name.getText())
      : [declaration.name.getText()])
  }
  return statement.name && ts.isIdentifier(statement.name) ? [statement.name.text] : []
}

/** The import that binds `name` in `file`: its module specifier and the name imported. */
function importOf(file, name) {
  for (const statement of sourceOf(file).statements) {
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : undefined
    const element = bindings && ts.isNamedImports(bindings) ? bindings.elements.find(candidate => candidate.name.text === name) : undefined
    if (element) return { specifier: statement.moduleSpecifier.text, imported: (element.propertyName ?? element.name).text }
  }
  return undefined
}

/** The top-level declaration of `name` in `file` itself, or through the relative import that binds it. */
function localDeclaration(file, name) {
  const statement = sourceOf(file).statements.find(candidate => !ts.isExportDeclaration(candidate) && declaredNames(candidate).includes(name))
  if (statement) return { file, statement }
  const binding = importOf(file, name)
  const target = binding && resolveImport(file, binding.specifier)
  return target ? declarationOf(target, binding.imported) : undefined
}

/** What an `export { … } from` or `export *` statement says about `name`, or `undefined`. */
function throughExport(file, statement, name) {
  const specifier = statement.moduleSpecifier?.text
  const clause = statement.exportClause
  if (!clause) {
    const target = specifier && resolveImport(file, specifier)
    return target ? declarationOf(target, name) : undefined
  }
  if (!ts.isNamedExports(clause)) return undefined
  const element = clause.elements.find(candidate => candidate.name.text === name)
  if (!element) return undefined
  const local = (element.propertyName ?? element.name).text
  if (!specifier) return localDeclaration(file, local)
  const target = resolveImport(file, specifier)
  return target ? declarationOf(target, local) : undefined
}

/**
 * Where `name`, exported from `file`, is declared: `{ file, statement }`,
 * following `export { … } from`, `export *` and imported bindings to the
 * package's own source. `undefined` for a name another package declares.
 */
export function declarationOf(file, name) {
  // A single-file component exports itself by default, under the name its `defineOptions` gives.
  if (file.endsWith('.vue')) {
    const statement = componentStatement(file)
    return statement ? { file, statement } : undefined
  }
  for (const statement of sourceOf(file).statements) {
    if (!ts.isExportDeclaration(statement)) continue
    const found = throughExport(file, statement, name)
    if (found) return found
  }
  return localDeclaration(file, name)
}

// --- Doc comments ------------------------------------------------------------

/** `{@link X}` as code, `{@link url | text}` as a link, `{@link X | text}` as its text. */
function unlink(text) {
  return text.replace(/\{@link(?:code|plain)?\s+([^}|\s]+)(?:\s*\|([^}]+))?\}/g, (_match, target, label) => {
    const words = label?.replace(/\s+/g, ' ').trim()
    if (!words) return `\`${target}\``
    return /^https?:/.test(target) ? `[${words}](${target})` : words
  })
}

/** A node's last doc comment as lines, its `/**` and stars dropped. */
function docLines(node) {
  const doc = (node.jsDoc ?? []).at(-1)
  if (!doc) return []
  return doc.getText().replace(/^\/\*\*\s?/, '').replace(/\s*\*\/$/, '').split('\n').map(line => line.replace(/^\s*\* ?/, ''))
}

/**
 * The doc comment over a node, as written, without its tags, or `''`. Read
 * from the source rather than from TypeScript's JSDoc nodes, which split a
 * `{@link}` that wraps onto a second line.
 */
export function docText(node) {
  const lines = docLines(node)
  const tags = lines.findIndex(line => /^@\w/.test(line))
  return unlink((tags === -1 ? lines : lines.slice(0, tags)).join('\n')).trim()
}

/** The text of one block tag of a node's doc comment (`@guarantee`), up to the next tag, or `undefined`. */
export function tagText(node, tag) {
  const lines = docLines(node)
  const start = lines.findIndex(line => line === `@${tag}` || line.startsWith(`@${tag} `))
  if (start === -1) return undefined
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(line => /^@\w/.test(line))
  return unlink([lines[start].slice(tag.length + 1), ...(end === -1 ? rest : rest.slice(0, end))].join('\n')).trim()
}

/** The doc comment of an export of `file`, or `''`. */
export function docOf(file, name) {
  const found = declarationOf(file, name)
  return found ? docText(found.statement) : ''
}

/** Abbreviations whose period ends no sentence. */
const ABBREVIATIONS = /(?:e\.g|i\.e|vs|etc)\.$/

/**
 * The first sentence of a doc comment, on one line: up to the first period,
 * question or exclamation mark that ends a word outside a code span, or the
 * end of the first paragraph.
 */
export function firstSentence(text) {
  const paragraph = text.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').trim()
  let code = false
  for (let i = 0; i < paragraph.length; i++) {
    const char = paragraph[i]
    if (char === '`') code = !code
    if (code || !'.!?'.includes(char)) continue
    const next = paragraph[i + 1]
    if ((next === undefined || next === ' ') && !ABBREVIATIONS.test(paragraph.slice(Math.max(0, i - 4), i + 1))) return paragraph.slice(0, i + 1)
  }
  return paragraph
}

// --- Exports -----------------------------------------------------------------

/** Whether a declaration is a type (an interface or a type alias) rather than a value. */
const isTypeDeclaration = statement => ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)

/** Whether a statement carries `export` and `export default`. */
function exportModifiers(statement) {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : []
  return {
    exported: modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword),
    isDefault: modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword),
  }
}

/** One export, by the declaration it resolves to: its kind, doc and origin. */
function described(name, found, typeOnly, origin) {
  if (!found) return { name, type: typeOnly, doc: '', origin }
  return { name, type: typeOnly || isTypeDeclaration(found.statement), doc: docText(found.statement), origin: found.file }
}

/** The exports of one `export { … }` list, local or from another module. */
function namedExports(file, statement) {
  const specifier = statement.moduleSpecifier?.text
  return statement.exportClause.elements.map((element) => {
    const local = (element.propertyName ?? element.name).text
    const typeOnly = statement.isTypeOnly || element.isTypeOnly
    if (specifier) {
      const target = resolveImport(file, specifier)
      return described(element.name.text, target && declarationOf(target, local), typeOnly, target ?? specifier)
    }
    return described(element.name.text, localDeclaration(file, local), typeOnly, importOf(file, local)?.specifier ?? file)
  })
}

/** The exports one top-level statement adds. */
function exportsOfStatement(file, statement, seen) {
  if (ts.isExportAssignment(statement)) return [{ name: 'default', type: false, doc: docText(statement), origin: file }]
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause
    if (clause && ts.isNamedExports(clause)) return namedExports(file, statement)
    if (clause) return [{ name: clause.name.text, type: statement.isTypeOnly, doc: '', origin: file }]
    const target = resolveImport(file, statement.moduleSpecifier.text)
    return target ? exportsOf(target, seen).filter(item => item.name !== 'default') : []
  }
  const { exported, isDefault } = exportModifiers(statement)
  if (!exported) return []
  const type = isTypeDeclaration(statement)
  return (isDefault ? ['default'] : declaredNames(statement)).map(name => ({ name, type, doc: docText(statement), origin: file }))
}

/**
 * Everything a module exports, values and types, each with its doc comment
 * and the file that declares it (or the package it comes from), `export *`
 * from the package's own sources followed.
 */
export function exportsOf(file, seen = new Set()) {
  if (seen.has(file)) return []
  seen.add(file)
  // A single-file component exports its component, documented on its `defineOptions`.
  if (file.endsWith('.vue')) return [{ name: 'default', type: false, doc: docOf(file, 'default'), origin: file }]
  const all = sourceOf(file).statements.flatMap(statement => exportsOfStatement(file, statement, seen))
  return [...new Map(all.map(item => [item.name, item])).values()]
}

/** The names a source text exports (a scaffold template, say), in order, without following its imports. */
export function textExports(text) {
  const source = ts.createSourceFile('text.ts', text, ts.ScriptTarget.Latest, true)
  return source.statements.flatMap((statement) => {
    if (ts.isExportAssignment(statement)) return ['default']
    if (ts.isExportDeclaration(statement)) return statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements.map(element => element.name.text) : []
    const { exported, isDefault } = exportModifiers(statement)
    if (!exported) return []
    return isDefault ? ['default'] : declaredNames(statement)
  })
}

/** The value (not type) names a module exports, sorted. */
export function valueExports(file) {
  return exportsOf(file).filter(item => !item.type).map(item => item.name).sort()
}

/**
 * The package's import paths, in the order of the exports map: each with
 * its subpath, the source file behind it, and whether it ships types only.
 * No `./package.json`, and no `.js`-suffixed duplicate of a component entry.
 */
export function entrypoints() {
  const { exports } = JSON.parse(readText('package.json'))
  const entries = Object.entries(exports)
    .filter(([subpath]) => subpath !== './package.json' && !(subpath.endsWith('.js') && Object.hasOwn(exports, subpath.slice(0, -3))))
    .map(([subpath, target]) => {
      const built = typeof target === 'string' ? target : target.default ?? target.types
      const source = subpath === '.'
        ? 'src/module.ts'
        : built.startsWith('./src/') ? built.slice(2) : `src/${built.slice('./dist/'.length).replace(/(?:\.d)?\.m?[jt]s$/, '')}.ts`
      return { subpath, path: subpath === '.' ? 'nuxt-backend' : `nuxt-backend/${subpath.slice(2)}`, source, built, typesOnly: typeof target !== 'string' && !target.default }
    })
  if (entries.length === 0) throw new Error('surface: package.json exports no subpath')
  return entries
}

// --- Type members ------------------------------------------------------------

/** The file an import specifier of `file` names, a package's declaration file included, repository-relative. */
function resolveTypeFile(file, specifier) {
  const options = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: false }
  const resolved = ts.resolveModuleName(specifier, join(root, file), options, ts.sys).resolvedModule?.resolvedFileName
  return resolved ? resolved.slice(root.length + 1).split('\\').join('/') : undefined
}

/** The named import or export element of a statement that binds `name`, or `undefined`. */
function bindingOf(statement, name) {
  const clause = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : ts.isExportDeclaration(statement) ? statement.exportClause : undefined
  const elements = clause && (ts.isNamedImports(clause) || ts.isNamedExports(clause)) ? clause.elements : []
  return elements.find(candidate => candidate.name.text === name)
}

/** Where the type `name` is declared, from `file`: its own declaration, or through an import or a re-export. */
function typeDeclaration(file, name, depth = 0) {
  if (depth > 8) return undefined
  for (const statement of sourceOf(file).statements) {
    if (isTypeDeclaration(statement) && statement.name.text === name) return { file, statement }
    const element = bindingOf(statement, name)
    const target = element && statement.moduleSpecifier && resolveTypeFile(file, statement.moduleSpecifier.text)
    if (target) return typeDeclaration(target, (element.propertyName ?? element.name).text, depth + 1)
  }
  return undefined
}

/** The member names of one type node: a literal's own, a reference's, or every part of an intersection's. */
function membersOfType(file, node, depth) {
  if (ts.isTypeLiteralNode(node)) return node.members.filter(member => member.name).map(member => member.name.getText())
  if (ts.isIntersectionTypeNode(node)) return node.types.flatMap(type => membersOfType(file, type, depth))
  if (ts.isTypeReferenceNode(node)) return typeMembers(file, node.typeName.getText(), depth + 1) ?? []
  return []
}

/**
 * The member names of an interface or object type `name` as `file` sees it,
 * what it `extends` included, followed into other modules and packages.
 * `undefined` when the type cannot be found.
 */
export function typeMembers(file, name, depth = 0) {
  const found = typeDeclaration(file, name, depth)
  if (!found) return undefined
  const { statement } = found
  if (ts.isTypeAliasDeclaration(statement)) return membersOfType(found.file, statement.type, depth)
  const inherited = (statement.heritageClauses ?? []).flatMap(clause => clause.types)
    .flatMap(type => typeMembers(found.file, type.expression.getText(), depth + 1) ?? [])
  return [...new Set([...statement.members.filter(member => member.name).map(member => member.name.getText()), ...inherited])]
}

// --- The module's registrations ----------------------------------------------

/** A property of an object literal, by name. */
const propertyOf = (object, name) => object.properties.find(candidate => ts.isPropertyAssignment(candidate) && candidate.name.getText() === name)?.initializer

/** A string literal's value, or `undefined`. */
const stringOf = node => node && ts.isStringLiteralLike(node) ? node.text : undefined

/** The path a `resolver.resolve('./runtime/…')` names, as its source file, or `undefined`. */
function resolvedFile(node) {
  if (!node || !ts.isCallExpression(node) || node.expression.getText() !== 'resolver.resolve') return undefined
  const path = stringOf(node.arguments[0])
  return path ? `src/${path.replace(/^\.\//, '')}.ts` : undefined
}

/** Every call of a function by name in a file, with its first argument. */
function callsOf(file, name) {
  const calls = []
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === name) calls.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceOf(file))
  return calls
}

/** The object literals an argument holds: one, or each of an array's. */
function objectsIn(node) {
  if (!node) return []
  if (ts.isObjectLiteralExpression(node)) return [node]
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(objectsIn)
  return []
}

/** A registration this reader cannot read, named so the reader can be taught it. */
function unreadable(file, call) {
  const { line } = sourceOf(file).getLineAndCharacterOfPosition(call.getStart())
  return new Error(`surface: cannot read the ${call.expression.getText()} call at ${file}:${line + 1}; update scripts/lib/surface.mjs`)
}

/**
 * One `addComponent` call as the surface reads it: `{ name, exported, file? }`,
 * `file` absent for a neutral name of the base module's component, or
 * `null` for a call that registers none of the surface.
 */
function registration(file, call) {
  // `addComponent(lazily({ … }))` registers a heavy component lazily, from the options it is passed.
  const [argument] = call.arguments
  // The packaged UI's rows, registered in a loop: read from src/ui/registry.ts instead.
  if (argument && ts.isConditionalExpression(argument)) return null
  const options = argument && ts.isCallExpression(argument) && argument.expression.getText() === 'lazily' ? argument.arguments[0] : argument
  const [object] = objectsIn(options)
  if (!object) throw unreadable(file, call)
  // A development-only stand-in for a renamed component, registered under a name it is passed.
  if (propertyOf(object, 'priority')) return null
  const name = stringOf(propertyOf(object, 'name'))
  const exported = stringOf(propertyOf(object, 'export'))
  if (!name || !exported) throw unreadable(file, call)
  return { name, exported, file: resolvedFile(propertyOf(object, 'filePath')) }
}

/** The module's components: its own (with the export they register) and its neutral names for the base module's. */
function componentsOf(file) {
  const read = callsOf(file, 'addComponent').map(call => registration(file, call)).filter(Boolean)
  // The packaged components, from the UI registry (src/ui/registry.ts): each a `.vue` file's default export.
  const packaged = REGISTERED_UI.filter(entry => entry.kind === 'component').map(entry => ({ name: entry.name, exported: 'default', file: `src/runtime/vue/components/${uiPath(entry)}.vue` }))
  return {
    own: [...packaged, ...read.filter(item => item.file)],
    aliases: read.filter(item => !item.file).map(({ name, exported }) => ({ name, exported })),
  }
}

/** The names a list of `{ name, as? }` imports registers. */
function importNames(file, call) {
  const objects = objectsIn(call.arguments[0])
  if (objects.length === 0) throw unreadable(file, call)
  return objects.map((object) => {
    const name = stringOf(propertyOf(object, 'as')) ?? stringOf(propertyOf(object, 'name'))
    if (!name) throw unreadable(file, call)
    return { name, file: resolvedFile(propertyOf(object, 'from')) }
  })
}

/** The composables the module auto-imports: the `addImports` objects, and the list it loops over. */
function composablesOf(file) {
  const direct = callsOf(file, 'addImports').filter(call => objectsIn(call.arguments[0]).length > 0).flatMap(call => importNames(file, call))
  const listed = sourceOf(file).statements.flatMap(statement => ts.isFunctionDeclaration(statement) ? [statement] : [])
    .flatMap((fn) => {
      const lists = []
      const visit = (node) => {
        if (ts.isVariableDeclaration(node) && node.name.getText() === 'composables' && node.initializer) lists.push(node.initializer)
        ts.forEachChild(node, visit)
      }
      visit(fn)
      return lists
    })
    .flatMap(list => objectsIn(list).map(object => ({ name: stringOf(propertyOf(object, 'name')), file: resolvedFile(propertyOf(object, 'from')) })))
  const all = [...direct, ...listed]
  if (all.some(item => !item.name || !item.file)) throw new Error('surface: a composable in src/nuxt/registry.ts has no literal name or resolved file')
  return all
}

/** The `#backend/*` aliases an app imports its functions directory through (src/aliases.ts). */
export function appAliases() {
  const aliases = [...readText('src/aliases.ts').matchAll(/'(#backend(?:\/\w+)?)':/g)].map(([, alias]) => alias)
  if (aliases.length === 0) throw new Error('surface: read no #backend alias from src/aliases.ts')
  return aliases
}

/** A list the registry must not leave empty. */
function nonEmpty(kind, list) {
  if (list.length === 0) throw new Error(`surface: read no ${kind} from src/nuxt/; update scripts/lib/surface.mjs`)
  return list
}

/**
 * What the module registers by name: its composables and components (each
 * with the file that exports it), its neutral names for the base module's
 * components, every Nitro auto-import of src/nuxt/, its route middleware (the
 * global ones, which a page never names, listed again on their own), and the
 * `#backend/*` aliases.
 */
export function moduleRegistry() {
  const files = readdirSync(join(root, 'src/nuxt')).filter(file => file.endsWith('.ts')).sort().map(file => `src/nuxt/${file}`)
  const { own, aliases } = componentsOf('src/nuxt/registry.ts')
  const registered = files.flatMap(file => callsOf(file, 'addRouteMiddleware').map((call) => {
    const options = objectsIn(call.arguments[0])[0] ?? { properties: [] }
    const name = stringOf(propertyOf(options, 'name'))
    if (!name) throw unreadable(file, call)
    return { name, global: propertyOf(options, 'global')?.kind === ts.SyntaxKind.TrueKeyword }
  }))
  const middleware = registered.map(entry => entry.name)
  return {
    composables: nonEmpty('composables', composablesOf('src/nuxt/registry.ts')),
    components: nonEmpty('components', own),
    parts: REGISTERED_UI.filter(entry => entry.kind === 'part').map(entry => ({ name: entry.name, parent: entry.parent, file: `src/runtime/vue/components/${uiPath(entry)}.vue` })),
    aliases: nonEmpty('component aliases', aliases),
    server: nonEmpty('Nitro auto-imports', files.flatMap(file => callsOf(file, 'addServerImports').flatMap(call => importNames(file, call).map(item => item.name)))),
    middleware: nonEmpty('route middleware', middleware),
    globalMiddleware: registered.filter(entry => entry.global).map(entry => entry.name),
    appAliases: appAliases(),
  }
}

// --- The base module ---------------------------------------------------------

/** The base module's groups an app of this package turns on. */
const BASE_GROUPS = new Set(['core', 'betterAuth', 'polar'])

/** The `{ name, type? }` entries of one of the base module's registration tables, by group. */
function baseTable(source, table) {
  const declaration = source.statements.filter(ts.isVariableStatement).flatMap(statement => statement.declarationList.declarations)
    .find(candidate => candidate.name.getText() === table)
  if (!declaration || !ts.isObjectLiteralExpression(declaration.initializer)) throw new Error(`surface: nuxt-convex-module has no ${table} table`)
  const entries = []
  for (const group of declaration.initializer.properties.filter(ts.isPropertyAssignment)) {
    if (!BASE_GROUPS.has(group.name.getText())) continue
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node) && stringOf(propertyOf(node, 'name'))) entries.push({ name: stringOf(propertyOf(node, 'name')), type: propertyOf(node, 'type')?.getText() === 'true' })
      // `["A", "B"].map((name) => ({ name, from }))`
      if (ts.isArrayLiteralExpression(node) && node.elements.every(ts.isStringLiteralLike)) entries.push(...node.elements.map(element => ({ name: element.text, type: false })))
      ts.forEachChild(node, visit)
    }
    visit(group.initializer)
  }
  return entries.filter(entry => !BRAND_NAME.test(entry.name) && !PROVIDER_WORDED_COMPONENTS.has(entry.name))
}

/**
 * The base module's auto-imports an app keeps, by kind: the ones whose names
 * say no brand (src/nuxt/registry.ts hides the rest) of the groups this
 * package turns on.
 */
export function baseModuleSurface() {
  const file = 'node_modules/nuxt-convex-module/dist/module.mjs'
  const source = ts.createSourceFile(file, readText(file), ts.ScriptTarget.Latest, true)
  const imports = baseTable(source, 'APP_IMPORTS')
  const surface = {
    composables: imports.filter(entry => !entry.type).map(entry => entry.name),
    types: imports.filter(entry => entry.type).map(entry => entry.name),
    components: baseTable(source, 'APP_COMPONENTS').map(entry => entry.name),
    server: baseTable(source, 'SERVER_IMPORTS').map(entry => entry.name),
  }
  for (const [kind, names] of Object.entries(surface)) {
    if (names.length === 0) throw new Error(`surface: read no ${kind} from ${file}; update baseModuleSurface()`)
  }
  return surface
}

export { ts }
