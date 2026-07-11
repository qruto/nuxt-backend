import { defineComponent } from 'vue'
import { useAuth } from '../composables/use-auth'
import { useOrganization } from '../composables/use-organization'

/**
 * Renders its default slot only when the session has an active workspace —
 * the gate for workspace-scoped pages. The `fallback` slot (rendered when the
 * user has no active workspace) is the place for a workspace picker or a
 * create-workspace form; `placeholder` renders while state is loading.
 *
 * With the default `personal` workspace enabled, signed-in users always have
 * an active workspace, so `fallback` only shows for users created before the
 * feature (or when `organization.personal` is disabled).
 *
 * The default slot receives the active workspace: `v-slot="{ workspace }"`.
 */
export const OrganizationBoundary = defineComponent({
  name: 'OrganizationBoundary',
  setup(_, { slots }) {
    const auth = useAuth()
    const { current, isLoading } = useOrganization()
    return () => {
      if (auth.isLoading.value || isLoading.value) return slots.placeholder?.() ?? null
      if (!auth.isAuthenticated.value || !current.value) return slots.fallback?.() ?? null
      return slots.default?.({ workspace: current.value })
    }
  },
})
