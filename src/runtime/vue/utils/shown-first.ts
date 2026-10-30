import { type App, computed, type ComputedRef, getCurrentInstance, onActivated, onDeactivated, onScopeDispose, shallowReactive } from 'vue'

/** Each app's mounted banners, by kind, in the order they were set up. */
const placed = new WeakMap<App, Map<string, symbol[]>>()

/**
 * Whether this banner is the one of its kind the page shows: the first
 * mounted of the app's. An app's own banner in its layout and the one the
 * frame of a ready-made page places would otherwise both show; the first
 * set up (in render order, the same on the server and in the browser)
 * shows, and the next takes over when it goes. A banner kept alive but out
 * of view stands aside while it is. Banners of different kinds never stand
 * aside for each other: the frame's region shows each kind once, in
 * priority order.
 *
 * @internal
 */
export function useShownFirst(kind: string): ComputedRef<boolean> {
  const app = getCurrentInstance()?.appContext.app
  if (!app) return computed(() => true)
  let kinds = placed.get(app)
  if (!kinds) placed.set(app, kinds = new Map())
  let banners = kinds.get(kind)
  if (!banners) kinds.set(kind, banners = shallowReactive<symbol[]>([]))
  const list = banners
  const self = Symbol(kind)
  const leave = () => {
    const at = list.indexOf(self)
    if (at >= 0) list.splice(at, 1)
  }
  list.push(self)
  onDeactivated(leave)
  onActivated(() => {
    if (!list.includes(self)) list.push(self)
  })
  onScopeDispose(leave)
  return computed(() => list[0] === self)
}
