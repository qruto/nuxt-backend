import { defineComponent, type PropType } from 'vue'
import { useFeatures } from '../composables/use-features'

/**
 * Renders its default slot only when the current billing entity has the
 * required feature (a granted benefit — matched by friendly metadata key,
 * benefit id, or type) or plan (product id). While entitlements are loading
 * the `placeholder` slot renders; when the check fails, `fallback`.
 *
 * The billing counterpart of `RoleBoundary`/`OrganizationBoundary`.
 *
 * @example
 * ```vue
 * <FeatureBoundary feature="premium">
 *   <AdvancedEditor />
 *   <template #fallback><UpgradePrompt /></template>
 * </FeatureBoundary>
 *
 * <FeatureBoundary :plan="proProductId">
 *   <ProDashboard />
 * </FeatureBoundary>
 * ```
 */
export const FeatureBoundary = defineComponent({
  name: 'FeatureBoundary',
  props: {
    /** Required feature(s) — any granted benefit match passes. */
    feature: { type: [String, Array] as PropType<string | string[]>, default: undefined },
    /** Required plan (product id)(s) — any active subscription match passes. */
    plan: { type: [String, Array] as PropType<string | string[]>, default: undefined },
  },
  setup(props, { slots }) {
    const features = useFeatures()
    const anyMatch = (value: string | string[] | undefined, check: (entry: string) => boolean) =>
      value === undefined || (Array.isArray(value) ? value.some(check) : check(value))
    return () => {
      if (features.isLoading.value) return slots.placeholder?.() ?? null
      const allowed = anyMatch(props.feature, feature => features.has(feature))
        && anyMatch(props.plan, plan => features.hasPlan(plan))
      return allowed ? slots.default?.() : slots.fallback?.() ?? null
    }
  },
})
