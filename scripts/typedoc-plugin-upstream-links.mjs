// @ts-check
// TypeDoc plugin: links inside doc comments that TypeDoc copied from a
// dependency.
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

const PACKAGE_OF = /node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*node_modules\/)/

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
}
