<script setup lang="ts">
// The page behind a topic email's unsubscribe link and a double opt-in's
// confirmation link: one press leaves the topic (or every topic), or joins
// it, with no sign-in. The logic is useEmailLink.
import { ref } from 'vue'
import { type EmailLinkQuery, useEmailLink } from '../../composables/use-email-link'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useOutcomeFocus } from '../../utils/focus-return'

const props = defineProps<{
  /** The link's query: `token` for an unsubscribe link, `confirm` for a confirmation link. */
  link: EmailLinkQuery
  /** Where a signed-in person manages every topic: the profile. */
  manageTo?: string
  /** Copy for this page, over app config and the translations. */
  labels?: LabelGroupOverrides<'preferences'>
}>()

const page = useEmailLink(() => props.link, () => props.labels)
const { state, link: named, topicName, error, announcement, leave, confirm } = page
const { t } = page.labels

// Once the answer is in, the buttons are gone: focus moves to the sentence that says it.
const root = ref<HTMLElement | null>(null)
const note = ref<HTMLElement | null>(null)
const { remember } = useOutcomeFocus(root, note, () => ['done', 'done-all', 'confirmed', 'nothing'].includes(state.value))
</script>

<template>
  <div
    ref="root"
    data-unsubscribe="page"
    :data-state="state"
    :aria-busy="state === 'pending' || state === 'loading' || undefined"
  >
    <p
      v-if="state === 'no-token'"
      data-unsubscribe="message"
    >
      {{ t('unsubscribe.noToken') }}
    </p>
    <p
      v-else-if="state === 'invalid'"
      data-unsubscribe="message"
    >
      {{ t('unsubscribe.invalid') }}
    </p>
    <template v-else-if="named?.kind === 'confirm'">
      <p
        ref="note"
        tabindex="-1"
        data-unsubscribe="message"
      >
        {{ state === 'confirmed' ? t('confirm.done', { topic: topicName }) : state === 'nothing' ? t('confirm.nothing') : t('confirm.intro', { topic: topicName }) }}
      </p>
      <button
        v-if="state === 'ready' || state === 'pending' || state === 'error'"
        type="button"
        data-unsubscribe="confirm"
        :aria-disabled="state === 'pending' || undefined"
        @click.capture="remember"
        @click="confirm()"
      >
        {{ state === 'pending' ? t('confirm.confirming') : t('confirm.action') }}
      </button>
    </template>
    <template v-else-if="named">
      <p
        ref="note"
        tabindex="-1"
        data-unsubscribe="message"
      >
        {{ state === 'done' ? t('unsubscribe.done', { topic: topicName }) : state === 'done-all' ? t('unsubscribe.doneAll') : named.topic ? t('unsubscribe.intro', { topic: topicName }) : t('unsubscribe.introAll') }}
      </p>
      <div
        v-if="state === 'ready' || state === 'pending' || state === 'error'"
        data-unsubscribe="actions"
      >
        <button
          v-if="named.topic"
          type="button"
          data-unsubscribe="leave"
          :aria-disabled="state === 'pending' || undefined"
          @click.capture="remember"
          @click="leave(false)"
        >
          {{ state === 'pending' ? t('unsubscribe.leaving') : t('unsubscribe.leave', { topic: topicName }) }}
        </button>
        <button
          type="button"
          data-unsubscribe="leave-all"
          :aria-disabled="state === 'pending' || undefined"
          @click.capture="remember"
          @click="leave(true)"
        >
          {{ t('unsubscribe.leaveAll') }}
        </button>
      </div>
      <a
        v-if="manageTo && (state === 'done' || state === 'done-all')"
        :href="manageTo"
        data-unsubscribe="manage"
      >{{ t('unsubscribe.manage') }}</a>
    </template>
    <p
      v-if="error"
      role="alert"
      data-unsubscribe="error"
    >
      {{ error }}
    </p>
    <span
      role="status"
      aria-live="polite"
      data-unsubscribe="status"
    >{{ announcement }}</span>
  </div>
</template>
