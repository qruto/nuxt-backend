// @ts-check
// TypeDoc plugin: what TypeDoc copies from a dependency — the links inside
// its doc comments, and the runtime's statics on a class it re-exports.
//
// A property typed through an upstream type (`runQuery:
// GenericActionCtx<…>['runQuery']`) is documented with the upstream comment,
// and that comment's `{@link internalQuery}` resolves in the dependency's own
// scope — where the name was never imported — so it fails here and renders as
// a bare word. `externalSymbolLinkMappings` cannot catch it: TypeDoc consults
// that table only for references it resolved to a symbol, or for global
// (`pkg!name`) ones. This resolver reads the same table for exactly the
// unresolved local references in a comment whose source file lives in a
// dependency, keyed by that dependency's package name. The URLs stay in
// typedoc.json; nothing here is specific to a package or a name.
//
// It also keeps Node's own statics off a class that extends `Error`
// (workpool's `NonRetryableError`, re-exported as is): `captureStackTrace`,
// `prepareStackTrace` and `stackTraceLimit` come from @types/node through
// the global `ErrorConstructor`, belong to the runtime rather than to the
// class, and would otherwise fill its page with V8's stack-trace manual.

import { Converter, DeclarationReflection, ReflectionFlag } from 'typedoc'

const PACKAGE_OF = /node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*node_modules\/)/
const NODE_GLOBALS = /node_modules\/@types\/node\//

/** @param {import('typedoc').Application} app */
export function load(app) {
  app.converter.addUnknownSymbolResolver((ref, reflection, _part, symbolId) => {
    if (symbolId || ref.moduleSource || ref.resolutionStart !== 'local' || !ref.symbolReference?.path) return
    const source = reflection.comment?.sourcePath?.split('\\').join('/')
    const pkg = source?.match(PACKAGE_OF)?.[1]
    if (!pkg) return
    const links = /** @type {Record<string, Record<string, string>>} */ (app.options.getValue('externalSymbolLinkMappings'))[pkg]
    return links?.[ref.symbolReference.path.map(part => part.path).join('.')]
  })
  app.converter.on(Converter.EVENT_RESOLVE_BEGIN, (context) => {
    for (const reflection of Object.values(context.project.reflections)) {
      if (!(reflection instanceof DeclarationReflection) || !reflection.flags.hasFlag(ReflectionFlag.Static)) continue
      const files = reflection.sources?.map(source => source.fullFileName.split('\\').join('/')) ?? []
      if (files.length > 0 && files.every(file => NODE_GLOBALS.test(file))) context.project.removeReflection(reflection)
    }
  })
}
