import { ref, watch, onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'
import type { FunctionReference, FunctionArgs, FunctionReturnType } from 'convex/server'
import { ConvexClient } from 'convex/browser'
import { useBackend } from './useBackend'

type QueryReference = FunctionReference<'query'>

/**
 * Reactive query subscription.
 * On the client, subscribes via WebSocket for real-time updates.
 * On the server (SSR), performs a one-shot HTTP fetch.
 */
export function useQuery<Query extends QueryReference>(
  query: Query,
  args: MaybeRefOrGetter<FunctionArgs<Query> | 'skip'>,
) {
  const data = ref<FunctionReturnType<Query> | undefined>(undefined)
  const error = ref<Error | null>(null)
  const isLoading = ref(true)

  const client = useBackend()

  if (client instanceof ConvexClient) {
    let unsubscribe: (() => void) | undefined

    const subscribe = () => {
      unsubscribe?.()
      unsubscribe = undefined

      const currentArgs = toValue(args)
      if (currentArgs === 'skip') {
        isLoading.value = false
        return
      }

      isLoading.value = true
      error.value = null

      unsubscribe = client.onUpdate(
        query,
        currentArgs,
        (result) => {
          data.value = result
          isLoading.value = false
        },
      )
    }

    watch(() => toValue(args), subscribe, { deep: true })
    subscribe()

    onScopeDispose(() => {
      unsubscribe?.()
    })
  }
  else {
    // SSR: one-shot query via ConvexHttpClient
    const currentArgs = toValue(args)
    if (currentArgs !== 'skip') {
      client.query(query, currentArgs).then((result) => {
        data.value = result
        isLoading.value = false
      }).catch((err) => {
        error.value = err
        isLoading.value = false
      })
    }
    else {
      isLoading.value = false
    }
  }

  return { data, error, isLoading }
}
