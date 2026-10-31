import type { FunctionReference } from 'convex/server'
import { computed, inject, type ComputedRef } from 'vue'
import { ConvexAuthStateKey, useMutation } from 'nuxt-convex-module/client'
import type { EmailTopicPreference } from '../../../convex/integrations/email-preferences'
import type { NotificationKindChoice } from '../../../convex/integrations/notifications'
import type { NotificationChannel } from '../../../convex/notifications'
import type { TopicState } from '../../../convex/email-preferences'
import { useActionState } from '../utils/action-state'
import type { BackendError } from '../utils/backend-error'
import { absentQuery, useLiveQuery } from '../utils/live-query'
import { useApiNamespace, useBackendNamespace } from '../utils/namespace'

export type { EmailTopicPreference } from '../../../convex/integrations/email-preferences'
export type { NotificationKindChoice } from '../../../convex/integrations/notifications'

/** The channels functions re-exported from your `backend/notifications.ts` (`notifications.api`). */
export interface NotificationChannelsApiRefs {
  getNotificationChannels?: FunctionReference<'query', 'public', Record<string, never>, NotificationKindChoice[] | null>
  setNotificationChannel?: FunctionReference<'mutation', 'public', { type: string, channel: NotificationChannel, enabled: boolean }, null>
}

/** One channel of one kind of notification, as `set` takes it. */
export interface NotificationChannelTarget {
  /** The kind: an event type, such as `auth.passkey_added` or `app.strip_shared`. */
  kind: string
  channel: NotificationChannel
}

/** The preference functions re-exported from your `backend/email.ts` (`email.api`). */
export interface EmailPreferencesApiRefs {
  getEmailPreferences?: FunctionReference<'query', 'public', Record<string, never>, EmailTopicPreference[] | null>
  setEmailTopic?: FunctionReference<'mutation', 'public', { topic: string, subscribed: boolean }, { state: TopicState }>
  unsubscribeAllTopics?: FunctionReference<'mutation', 'public', Record<string, never>, null>
}

export interface UseEmailPreferencesOptions {
  /** Override the injected `api.email` namespace. */
  api?: EmailPreferencesApiRefs
  /** Override the injected `api.notifications` namespace, for the channels. */
  channelsApi?: NotificationChannelsApiRefs
}

export interface UseEmailPreferencesReturn {
  /** The topics your app declares, each with the person's choice, live. `[]` signed out, and while they load. */
  topics: ComputedRef<EmailTopicPreference[]>
  /**
   * The person's notification channels, kind by kind, live: every kind that
   * notifies them, with each channel it allows (in the app, by email, as
   * push) on or off. `[]` signed out, while they load, and without
   * `getNotificationChannels` re-exported.
   */
  channels: ComputedRef<NotificationKindChoice[]>
  /** `true` while the topics are read. */
  isLoading: ComputedRef<boolean>
  /** `true` while a change runs. */
  isPending: ComputedRef<boolean>
  /** Why the last change failed, else why the read failed, else `null`. */
  error: ComputedRef<BackendError | null>
  /**
   * Join or leave one topic, by its key: joining a topic with double opt-in
   * sends its confirmation email and leaves it `pending` until the person
   * presses the link. Or turn one channel of one kind of notification on or
   * off: `set({ kind: 'auth.passkey_added', channel: 'email' }, false)`.
   * Rejects on failure.
   */
  set: (target: string | NotificationChannelTarget, on: boolean) => Promise<void>
  /** Leave every topic at once. Rejects on failure. */
  unsubscribeAll: () => Promise<void>
}

/**
 * The email topics the signed-in person receives and their notification
 * channels, kind by kind, live, and the actions that change them: the same
 * choices as the profile's Email section, the unsubscribe page and the
 * provider's own page, which all stay in step.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { topics, set, unsubscribeAll } = useEmailPreferences()
 * </script>
 * <template>
 *   <label v-for="topic in topics" :key="topic.key">
 *     <input type="checkbox" :checked="topic.subscribed" @change="set(topic.key, !topic.subscribed)">
 *     {{ topic.name }}
 *     <span v-if="topic.pending">Check your inbox to confirm.</span>
 *   </label>
 *   <button @click="unsubscribeAll">Unsubscribe from all</button>
 * </template>
 * ```
 */
export function useEmailPreferences(options: UseEmailPreferencesOptions = {}): UseEmailPreferencesReturn {
  const api = useBackendNamespace<EmailPreferencesApiRefs>('email', 'useEmailPreferences', options.api)
  const channelsApi = options.channelsApi ?? useApiNamespace<NotificationChannelsApiRefs>('notifications') ?? {}
  const auth = inject(ConvexAuthStateKey, null)
  const signedOut = computed(() => auth == null || !auth.isAuthenticated.value)
  const read = api.getEmailPreferences
    ? useLiveQuery(api.getEmailPreferences, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<EmailTopicPreference[] | null>()
  const channelRead = channelsApi.getNotificationChannels
    ? useLiveQuery(channelsApi.getNotificationChannels, () => (signedOut.value ? 'skip' : {}))
    : absentQuery<NotificationKindChoice[] | null>()
  const runChannel = channelsApi.setNotificationChannel ? useMutation(channelsApi.setNotificationChannel) : null
  const runSet = api.setEmailTopic ? useMutation(api.setEmailTopic) : null
  const runAll = api.unsubscribeAllTopics ? useMutation(api.unsubscribeAllTopics) : null
  const { isPending, failure, run } = useActionState(() => signedOut.value)

  const needs = (name: string): never => {
    throw new Error(`[nuxt-backend] useEmailPreferences() needs \`${name}\` re-exported from setupEmail() in backend/email.ts (\`export const { ${name} } = email.api\`), or pass { api }.`)
  }

  return {
    topics: computed(() => (signedOut.value ? [] : read.data.value ?? [])),
    channels: computed(() => (signedOut.value ? [] : channelRead.data.value ?? [])),
    isLoading: computed(() => (auth != null && auth.isLoading.value) || (!signedOut.value && (read.isLoading.value || channelRead.isLoading.value))),
    isPending,
    error: computed(() => failure.value ?? (signedOut.value ? null : read.error.value ?? channelRead.error.value)),
    set: (target, on) => run(async () => {
      if (typeof target === 'string') {
        if (!runSet) needs('setEmailTopic')
        await runSet!({ topic: target, subscribed: on })
        return
      }
      if (!runChannel) throw new Error('[nuxt-backend] useEmailPreferences() needs `setNotificationChannel` re-exported from setupNotifications() in backend/notifications.ts (`export const { setNotificationChannel } = notifications.api`), or pass { channelsApi }.')
      await runChannel({ type: target.kind, channel: target.channel, enabled: on })
    }),
    unsubscribeAll: () => run(async () => {
      if (!runAll) needs('unsubscribeAllTopics')
      await runAll!({})
    }),
  }
}
