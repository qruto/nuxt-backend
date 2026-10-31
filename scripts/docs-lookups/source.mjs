/**
 * What the lookups read from the sources beyond the public surface
 * (scripts/lib/surface.mjs, which this re-exports): the fields of an
 * interface with their doc comments and tags, and the named imports of a
 * source text.
 */
import { docText, sourceOf, tagText, ts } from '../lib/surface.mjs'

export { declarationOf, docOf, docText, firstSentence, readText, root, sourceOf, ts, valueExports } from '../lib/surface.mjs'

/**
 * The members of an interface (or of an object type alias) in `file`: name,
 * whether it is optional, its type as written, and its doc comment.
 */
export function interfaceFields(file, name) {
  const statement = sourceOf(file).statements.find(candidate =>
    (ts.isInterfaceDeclaration(candidate) || ts.isTypeAliasDeclaration(candidate)) && candidate.name.text === name)
  if (!statement) throw new Error(`${file}: no interface ${name}`)
  return membersOf(ts.isInterfaceDeclaration(statement) ? statement.members : statement.type.members ?? [])
}

/** The property signatures of a type's members, as `interfaceFields` returns them. */
export function membersOf(members) {
  return members.filter(member => ts.isPropertySignature(member)).map(member => ({
    name: member.name.getText().replace(/^['"]|['"]$/g, ''),
    optional: Boolean(member.questionToken),
    type: member.type ? member.type.getText().replace(/\s+/g, ' ') : 'unknown',
    typeNode: member.type,
    doc: docText(member),
    node: member,
  }))
}

/** The named imports of a source text, by the module each comes from. */
export function namedImports(text) {
  return [...text.matchAll(/^import (?:type )?(?:\w+, )?\{([^}]*)\} from '([^']+)'/gm)].map(([, names, from]) => ({
    from,
    names: names.split(',').map(name => name.trim().replace(/^type /, '').split(' as ')[0]).filter(Boolean),
  }))
}

/** The `- Key: value` items of a block tag's text, by key, wrapped lines joined; `undefined` without the tag. */
export function tagItems(node, tag) {
  const text = tagText(node, tag)
  if (text === undefined) return undefined
  const items = {}
  let key
  for (const line of text.split('\n')) {
    const item = line.match(/^- ([^:]+): (.*)$/)
    if (item) {
      key = item[1].trim()
      items[key] = item[2].trim()
    }
    else if (key && line.trim()) items[key] = `${items[key]} ${line.trim()}`
  }
  return items
}
