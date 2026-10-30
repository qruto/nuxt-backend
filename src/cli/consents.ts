import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { finding, type PreflightFinding } from '../findings'
import type { Node } from '../source-text'

// doctor's consent half: every required consent `backend/account.ts`
// declares links its document. The sign-up form's agreement line and the
// prompt that asks again after a change link each kind to its `url`, so a
// required kind without one points nowhere. The declaration is read from the
// source, not run: a `consents` that is not an object literal in the call to
// `setupAccount` is left alone.

/** A node's children that are nodes. */
function children(node: Node): Node[] {
  return Object.values(node).flatMap(value => (Array.isArray(value) ? value : [value])).filter((child): child is Node => typeof child === 'object' && child !== null && typeof (child as Node).type === 'string')
}

/** The name an object property is keyed by, or `undefined` for a computed or spread one. */
function keyOf(property: Node): string | undefined {
  const key = property.key as Node | undefined
  if (!key || property.computed) return undefined
  return key.type === 'Identifier' ? String(key.name) : key.type === 'StringLiteral' ? String(key.value) : undefined
}

/** The property of an object expression by name. */
function propertyOf(object: Node, name: string): Node | undefined {
  return (object.properties as Node[] | undefined)?.find(property => property.type === 'ObjectProperty' && keyOf(property) === name)
}

/** Every call to `setupAccount` in a tree. */
function* setupAccountCalls(node: Node): Generator<Node> {
  const callee = node.callee as Node | undefined
  if (node.type === 'CallExpression' && callee?.type === 'Identifier' && callee.name === 'setupAccount') yield node
  for (const child of children(node)) yield* setupAccountCalls(child)
}

/** The `consents` object literal of a `setupAccount` call, or `undefined` when it is not one. */
function consentsOf(call: Node): Node | undefined {
  const options = (call.arguments as Node[] | undefined)?.[1]
  const consents = options?.type === 'ObjectExpression' ? propertyOf(options, 'consents')?.value as Node | undefined : undefined
  return consents?.type === 'ObjectExpression' ? consents : undefined
}

/** Whether a declaration is `required: true`. */
function isRequired(declaration: Node): boolean {
  const flag = propertyOf(declaration, 'required')?.value as Node | undefined
  return flag?.type === 'BooleanLiteral' && flag.value === true
}

/** Whether a declaration has no `url`, or an empty one; an expression is a url we can't read, so it counts as present. */
function lacksUrl(declaration: Node): boolean {
  const url = propertyOf(declaration, 'url')?.value as Node | undefined
  return !url || (url.type === 'StringLiteral' && !String(url.value).trim())
}

/**
 * The required kinds a `setupAccount` call declares, and which of them have
 * no `url`; `null` when the declaration can't be read from the source.
 */
export function requiredConsentUrls(program: Node): { required: string[], withoutUrl: string[] } | null {
  for (const call of setupAccountCalls(program)) {
    const consents = consentsOf(call)
    if (!consents) continue
    const declared = (consents.properties as Node[])
      .map(property => ({ kind: property.type === 'ObjectProperty' ? keyOf(property) : undefined, declaration: property.value as Node | undefined }))
      .filter((entry): entry is { kind: string, declaration: Node } => entry.kind !== undefined && entry.declaration?.type === 'ObjectExpression' && isRequired(entry.declaration))
    return { required: declared.map(entry => entry.kind), withoutUrl: declared.filter(entry => lacksUrl(entry.declaration)).map(entry => entry.kind) }
  }
  return null
}

/**
 * Under `--prod`, whether each required consent of `backend/account.ts`
 * links its document. Nothing for an app that declares none.
 */
export async function consentFindings(rootDir: string, { prod }: { prod: boolean }): Promise<PreflightFinding[]> {
  const file = join(rootDir, 'backend', 'account.ts')
  if (!prod || !existsSync(file)) return []
  let read: ReturnType<typeof requiredConsentUrls>
  try {
    const magicast = await import('magicast')
    read = requiredConsentUrls(magicast.parseModule(readFileSync(file, 'utf8')).$ast as unknown as Node)
  }
  catch {
    return []
  }
  if (!read || read.required.length === 0) return []
  if (read.withoutUrl.length === 0) return [finding('consent-urls', 'pass', `Every required consent (${read.required.join(', ')}) links its document.`)]
  return [finding(
    'consent-urls',
    'warn',
    `The required consent${read.withoutUrl.length === 1 ? '' : 's'} ${read.withoutUrl.join(', ')} ${read.withoutUrl.length === 1 ? 'has' : 'have'} no \`url\`, so the agreement line on the sign-up form and the prompt that asks again point nowhere.`,
    'Add the page of the document as the kind\'s `url` in `setupAccount({ consents })` (backend/account.ts), such as `/terms`.',
  )]
}
