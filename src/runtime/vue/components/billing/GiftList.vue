<script setup lang="ts">
// The gifts page's body: the gifts a person received, each to claim into a
// workspace they manage, and the gifts they sent, each with what they can
// still do until it is claimed. The logic is useGiftList.
import { useId } from 'vue'
import { useGiftList } from '../../composables/use-gift-list'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import GiftReceived from './GiftReceived.vue'
import GiftSent from './GiftSent.vue'

const props = defineProps<{
  /** Copy for this list, over app config and the translations. */
  labels?: LabelGroupOverrides<'gift'>
}>()

const list = useGiftList(() => props.labels)
const { state, received, sent, workspaces, target, error, announcement, busy } = list
const { t } = list.labels
const uid = useId()
const id = (...parts: string[]) => [uid, ...parts].join('-')
</script>

<template>
  <div
    data-gift="list"
    :data-state="state"
    :aria-busy="state === 'loading' || state === 'pending' || undefined"
  >
    <p
      v-if="state === 'loading'"
      data-gift="loading"
      role="status"
    >
      {{ t('loading') }}
    </p>
    <p
      data-gift="status"
      role="status"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
    <p
      v-if="error"
      data-gift="list-error"
      role="alert"
    >
      {{ error }}
    </p>

    <section
      data-gift="section"
      :aria-labelledby="id('received')"
    >
      <h2
        :id="id('received')"
        data-gift="section-title"
      >
        {{ t('receivedTitle') }}
      </h2>
      <p
        v-if="received.length === 0"
        data-gift="empty"
      >
        {{ state === 'loading' ? '' : t('receivedEmpty') }}
      </p>
      <ul
        data-gift="entries"
      >
        <GiftReceived
          v-for="gift in received"
          :key="gift.id"
          v-model:target="target[gift.id]"
          :gift="gift"
          :workspaces="workspaces"
          :name-id="id(gift.id, 'what')"
          :busy="busy === gift.id"
          :t="t"
          @claim="busy === null && list.claim(gift.id)"
        />
      </ul>
    </section>

    <section
      data-gift="section"
      :aria-labelledby="id('sent')"
    >
      <h2
        :id="id('sent')"
        data-gift="section-title"
      >
        {{ t('sentTitle') }}
      </h2>
      <p
        v-if="sent.length === 0"
        data-gift="empty"
      >
        {{ state === 'loading' ? '' : t('sentEmpty') }}
      </p>
      <ul data-gift="entries">
        <GiftSent
          v-for="gift in sent"
          :key="gift.id"
          :gift="gift"
          :name-id="id(gift.id, 'what')"
          :hint-id="id('cancel-hint')"
          :busy="busy === gift.id"
          :any-busy="busy !== null"
          :change-recipient="email => list.changeRecipient(gift.id, email)"
          :reschedule="date => list.reschedule(gift.id, date)"
          :t="t"
          @resend="busy === null && list.resend(gift.id)"
          @cancel="busy === null && list.cancel(gift.id)"
        />
      </ul>
      <p
        v-if="sent.some(gift => gift.canCancel)"
        :id="id('cancel-hint')"
        data-gift="hint"
      >
        {{ t('cancelHint') }}
      </p>
    </section>
  </div>
</template>
