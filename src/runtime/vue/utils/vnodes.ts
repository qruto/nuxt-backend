import { Comment, Fragment, Text, type FunctionalComponent, type VNode, type VNodeChild } from 'vue'

/**
 * Render nodes made elsewhere, such as a parent's slot called with a row's
 * props, where a template cannot call it: `<VNodes :nodes="slot(row)" />`.
 * A functional component, so it adds nothing to the page around them.
 *
 * @internal
 */
export const VNodes: FunctionalComponent<{ nodes: VNodeChild }> = props => props.nodes as never
VNodes.props = ['nodes']

/** The nodes a person sees in `nodes`, fragments opened: no comments, no empty text. */
function shown(nodes: readonly VNode[]): VNode[] {
  return nodes.flatMap((node) => {
    if (node.type === Comment) return []
    if (node.type === Fragment) return Array.isArray(node.children) ? shown(node.children as VNode[]) : []
    if (node.type === Text && typeof node.children === 'string' && !node.children.trim()) return []
    return [node]
  })
}

/**
 * Its default slot's one node as its own root: a component whose template
 * renders one of several slots (`<Gate>`) wraps them in this, so what the
 * slot rendered is the component's root element, the one an attribute on
 * the component falls through to, rather than a fragment around it.
 * Several nodes stay a fragment; none renders nothing.
 *
 * @internal
 */
export const SingleRoot: FunctionalComponent = (_props, { slots }) => {
  const nodes = shown(slots.default?.() ?? [])
  return nodes.length === 1 ? nodes[0]! : nodes.length ? nodes : null
}
