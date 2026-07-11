import { defineComponent, type PropType } from 'vue'
import { useAuth } from '../composables/use-auth'

/**
 * Renders its default slot only when the signed-in user has the required
 * app-wide role (or permission statements). While the session is loading the
 * `placeholder` slot renders; when the check fails, `fallback`.
 *
 * @example
 * ```vue
 * <RoleBoundary role="admin">
 *   <AdminPanel />
 *   <template #fallback><p>Admins only.</p></template>
 * </RoleBoundary>
 *
 * <RoleBoundary :permission="{ user: ['ban'] }">
 *   <BanButton />
 * </RoleBoundary>
 * ```
 */
export const RoleBoundary = defineComponent({
  name: 'RoleBoundary',
  props: {
    /** Required app-wide role(s) — any match passes. */
    role: { type: [String, Array] as PropType<string | string[]>, default: undefined },
    /** Required permission statements (e.g. `{ user: ['ban'] }`) — checked via the role's access control. */
    permission: { type: Object as PropType<Record<string, string[]>>, default: undefined },
  },
  setup(props, { slots }) {
    const auth = useAuth()
    return () => {
      if (auth.isLoading.value) return slots.placeholder?.() ?? null
      const allowed = auth.isAuthenticated.value
        && !auth.banned.value
        && (props.role === undefined || auth.hasRole(props.role))
        && (props.permission === undefined || auth.can(props.permission))
      return allowed ? slots.default?.() : slots.fallback?.() ?? null
    }
  },
})
