import type { FunctionReference } from 'convex/server'
import { computed, type ComputedRef, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useMutation } from 'nuxt-convex-module/client'
import type { EmailLinkView } from '../../../convex/integrations/email-preferences'
import { useActionState } from '../utils/action-state'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useApiNamespace } from '../utils/namespace'
import { type LabelGroupOverrides, useLabels } from './use-labels'

/** The link functions re-exported from `backend/email.ts`. */
interface EmailLinkApi {
  getEmailLink?: FunctionReference<'query', 'public', { token?: string, confirm?: string }, EmailLinkView | null>
  unsubscribeByLink?: FunctionReference<'mutation', 'public', { token: string, all?: boolean }, boolean>
  confirmEmailTopic?: FunctionReference<'mutation', 'public', { confirm: string }, 'confirmed' | 'nothing'>
}

/** Where the page stands. */
export type EmailLinkState = 'loading' | 'ready' | 'pending' | 'done' | 'done-all' | 'confirmed' | 'nothing' | 'invalid' | 'error' | 'no-token'

/** The link a page opened: an unsubscribe link's `token`, or a confirmation link's `confirm`. */
export interface EmailLinkQuery {
  token?: string
  confirm?: string
}

export interface UseEmailLinkReturn {
  state: ComputedRef<EmailLinkState>
  /** What the link names. */
  link: ComputedRef<EmailLinkView | null>
  /** The topic's name, or `''` for every topic. */
  topicName: ComputedRef<string>
  /** Why the last action failed, in words, or `null`. */
  error: ComputedRef<string | null>
  /** The outcome in words, for a polite status. */
  announcement: ComputedRef<string>
  /** Leave the topic the link names, or every topic. */
  leave: (all?: boolean) => Promise<void>
  /** Confirm the double opt-in the link names. */
  confirm: () => Promise<void>
  labels: ReturnType<typeof useLabels<'preferences'>>
}

/**
 * The unsubscribe page without its markup: what the link names, and one
 * press that leaves the topic (or every topic), or confirms a double
 * opt-in. Opening the page changes nothing, so a mail scanner that follows
 * the link unsubscribes nobody. State, actions and words; `<EmailUnsubscribe>`
 * is this with the package's markup.
 *
 * @internal
 */
export function useEmailLink(query: MaybeRefOrGetter<EmailLinkQuery>, overrides?: MaybeRefOrGetter<LabelGroupOverrides<'preferences'> | undefined>): UseEmailLinkReturn {
  const api = useApiNamespace<EmailLinkApi>('email')
  const labels = useLabels('preferences', () => toValue(overrides))
  const args = computed(() => {
    const { token, confirm } = toValue(query)
    return confirm ? { confirm } : token ? { token } : null
  })
  const read = api?.getEmailLink ? useLiveQuery(api.getEmailLink, () => args.value ?? 'skip') : absentQuery<EmailLinkView | null>()
  const runLeave = api?.unsubscribeByLink ? useMutation(api.unsubscribeByLink) : null
  const runConfirm = api?.confirmEmailTopic ? useMutation(api.confirmEmailTopic) : null
  const { isPending, failure, run } = useActionState()
  const outcome = ref<'done' | 'done-all' | 'confirmed' | 'nothing' | null>(null)

  const link = computed(() => read.data.value ?? null)
  const state = computed<EmailLinkState>(() => {
    if (!args.value) return 'no-token'
    if (isPending.value) return 'pending'
    if (outcome.value) return outcome.value
    if (failure.value) return 'error'
    if (read.data.value === undefined) return read.error.value ? 'error' : 'loading'
    return read.data.value === null ? 'invalid' : 'ready'
  })
  const topicName = computed(() => link.value?.topic?.name ?? '')
  const error = computed(() => (failure.value ? labels.errorMessage(failure.value) : read.error.value ? labels.errorMessage(read.error.value) : null))
  const announcement = computed(() => {
    const topic = topicName.value
    switch (state.value) {
      case 'pending': return labels.t(link.value?.kind === 'confirm' ? 'confirm.confirming' : 'unsubscribe.leaving')
      case 'done': return labels.t('unsubscribe.done', { topic })
      case 'done-all': return labels.t('unsubscribe.doneAll')
      case 'confirmed': return labels.t('confirm.done', { topic })
      case 'nothing': return labels.t('confirm.nothing')
      default: return ''
    }
  })

  async function leave(all = false): Promise<void> {
    const token = toValue(query).token
    if (!token || !runLeave || isPending.value) return
    outcome.value = null
    const left = await run(() => runLeave({ token, all: all || link.value?.topic === null }), { silent: true }).catch(() => null)
    if (left) outcome.value = all || link.value?.topic === null ? 'done-all' : 'done'
  }

  async function confirm(): Promise<void> {
    const value = toValue(query).confirm
    if (!value || !runConfirm || isPending.value) return
    outcome.value = null
    const answer = await run(() => runConfirm({ confirm: value }), { silent: true }).catch(() => null)
    if (answer) outcome.value = answer
  }

  return { state, link, topicName, error, announcement, leave, confirm, labels }
}
