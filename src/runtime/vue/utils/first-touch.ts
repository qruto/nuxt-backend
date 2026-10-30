import type { FunctionReference } from 'convex/server'
import { until } from '@vueuse/core'
import { useMutation } from 'nuxt-convex-module/client'
import type { SourceView } from '../../../convex/integrations/audit'
import type { CampaignTouch } from '../../../convex/funnel-rules'
import { attributionOf } from '../composables/use-campaign'
import { useAuthSession } from './auth-session'
import { useApiNamespace } from './namespace'

/** The function of `audit.api` the first touch is recorded with. */
interface FirstTouchApi {
  recordSource?: FunctionReference<'mutation', 'public', { touch?: CampaignTouch }, SourceView>
}

/** The campaigns this page sent, by account: each once, and the server keeps only the first within a day of the sign-up. */
const claimed = new Set<string>()

/**
 * The growth funnel's first-touch claim: once a signed-in person lands on
 * an address with `utm_*` parameters (the sign-in returns them to the
 * address they left, query included), the campaign is sent to
 * `recordSource`, which keeps it as their first only within a day of their
 * sign-up. Nothing is stored on the device: the campaign travels in the
 * link. An administrator's visit sends nothing. Silent without the
 * function.
 *
 * @internal
 */
export function firstTouchClaim(): (query: Record<string, unknown>) => Promise<void> {
  const api = useApiNamespace<FirstTouchApi>('audit')
  const auth = useAuthSession()
  const record = api?.recordSource ? useMutation(api.recordSource) : null
  return async (query) => {
    const touch = attributionOf(query)
    if (!record || !touch) return
    await until(() => auth.isLoading.value).toBe(false)
    const userId = auth.user.value?.id
    if (!userId || auth.isImpersonating.value) return
    const key = `${userId}:${JSON.stringify(touch)}`
    if (claimed.has(key)) return
    claimed.add(key)
    await record({ touch }).catch(() => claimed.delete(key))
  }
}
