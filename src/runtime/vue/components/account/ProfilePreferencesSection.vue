<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProfilePreferencesSectionProps } from '../../parts'
import { useLabels } from '../../composables/use-labels'
import type { NotificationChannel } from '../../../../convex/notifications'
import { notificationLabelKey } from '../../../../convex/notifications'
import { useProfileView } from './profile-settings'

/**
 * `<ProfileSettings>`'s Email section: the email topics the app declares,
 * each a checkbox with its description, a note while a double opt-in waits
 * for its confirmation, and "Unsubscribe from all"; then the notification
 * channels, kind by kind, a checkbox for each channel the kind allows (in
 * the app, by email, as push). Shown when the app declares topics
 * (`setupEmail({ topics })`) or re-exports the channels.
 */
defineOptions({ name: 'ProfilePreferencesSection' })
const props = defineProps<ProfilePreferencesSectionProps>()
const view = useProfileView('ProfilePreferencesSection')
const { t, errorMessage } = useLabels('preferences')
const notificationWords = useLabels('notifications')
const channelNames: Record<NotificationChannel, 'channels.app' | 'channels.email' | 'channels.push'> = { app: 'channels.app', email: 'channels.email', push: 'channels.push' }
const headingId = `${view.id}-preferences`
const outcome = ref<string | null>(null)
const failure = computed(() => (props.preferences.error.value ? errorMessage(props.preferences.error.value) : null))
const anySubscribed = computed(() => props.preferences.topics.value.some(topic => topic.subscribed || topic.pending))

async function toggle(key: string, subscribed: boolean) {
  outcome.value = null
  await props.preferences.set(key, subscribed).then(() => {
    outcome.value = t('saved')
  }, () => {})
}

/** A kind's name: the words its notifications open with, with no one and no workspace named. */
function kindName(type: string): string {
  const key = `${notificationLabelKey(type)}.title`
  const text = notificationWords.t(key as never, { actor: notificationWords.t('actorSomeone'), workspace: notificationWords.t('workspaceUnnamed'), amount: '' })
  return text === `notifications.${key}` ? notificationWords.t('fallbackTitle') : text
}

async function choose(kind: string, channel: NotificationChannel, on: boolean) {
  outcome.value = null
  await props.preferences.set({ kind, channel }, on).then(() => {
    outcome.value = t('saved')
  }, () => {})
}

async function leaveAll() {
  if (props.preferences.isPending.value) return
  outcome.value = null
  await props.preferences.unsubscribeAll().then(() => {
    outcome.value = t('unsubscribedAll')
  }, () => {})
}
</script>

<template>
  <section
    v-if="preferences.topics.value.length > 0 || preferences.channels.value.length > 0"
    data-profile="section-preferences"
    :aria-labelledby="headingId"
    :aria-busy="preferences.isPending.value || undefined"
  >
    <h3
      :id="headingId"
      data-preferences="title"
    >
      {{ preferences.topics.value.length > 0 ? t('topicsTitle') : t('channelsTitle') }}
    </h3>
    <ul
      v-if="preferences.topics.value.length > 0"
      data-preferences="topics"
    >
      <li
        v-for="topic in preferences.topics.value"
        :key="topic.key"
        data-preferences="topic"
        :data-state="topic.pending ? 'pending' : topic.subscribed ? 'subscribed' : 'unsubscribed'"
      >
        <label data-preferences="topic-label">
          <input
            type="checkbox"
            data-preferences="topic-input"
            :checked="topic.subscribed || topic.pending"
            :aria-describedby="`${headingId}-${topic.key}`"
            @change="toggle(topic.key, ($event.target as HTMLInputElement).checked)"
          >
          {{ topic.name }}
        </label>
        <p
          :id="`${headingId}-${topic.key}`"
          data-profile="hint"
        >
          {{ topic.description }}<template v-if="topic.pending">
            {{ ' ' }}<span data-preferences="pending">{{ t('pending') }}</span>
          </template>
        </p>
      </li>
    </ul>
    <template v-if="preferences.channels.value.length > 0">
      <h4
        v-if="preferences.topics.value.length > 0"
        :id="`${headingId}-channels`"
        data-preferences="channels-title"
      >
        {{ t('channelsTitle') }}
      </h4>
      <p data-profile="hint">
        {{ t('channelsIntro') }}
      </p>
      <ul
        data-preferences="channels"
        :aria-labelledby="preferences.topics.value.length > 0 ? `${headingId}-channels` : headingId"
      >
        <li
          v-for="kind in preferences.channels.value"
          :key="kind.type"
          data-preferences="kind"
        >
          <span
            :id="`${headingId}-${kind.type}`"
            data-preferences="kind-name"
          >{{ kindName(kind.type) }}</span>
          <span
            role="group"
            data-preferences="kind-channels"
            :aria-labelledby="`${headingId}-${kind.type}`"
          >
            <label
              v-for="choice in kind.channels"
              :key="choice.channel"
              data-preferences="channel"
              :data-channel="choice.channel"
              :data-state="choice.enabled ? 'on' : 'off'"
            >
              <input
                type="checkbox"
                data-preferences="channel-input"
                :checked="choice.enabled"
                @change="choose(kind.type, choice.channel, ($event.target as HTMLInputElement).checked)"
              >
              {{ t(channelNames[choice.channel]) }}
            </label>
          </span>
        </li>
      </ul>
    </template>
    <button
      v-if="anySubscribed"
      type="button"
      data-preferences="unsubscribe-all"
      :aria-disabled="preferences.isPending.value || undefined"
      @click="leaveAll"
    >
      {{ t('unsubscribeAll') }}
    </button>
    <p
      v-if="failure"
      role="alert"
      data-preferences="error"
    >
      {{ failure }}
    </p>
    <span
      role="status"
      aria-live="polite"
      data-preferences="status"
    >{{ failure ? '' : outcome ?? '' }}</span>
  </section>
</template>
