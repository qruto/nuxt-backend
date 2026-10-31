<script setup lang="ts">
// The page behind the emailed "keep my account" link: one button cancels the
// scheduled deletion, with no sign-in. The logic is useKeepAccount.
import { ref } from 'vue'
import { useKeepAccount } from '../../composables/use-keep-account'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useOutcomeFocus } from '../../utils/focus-return'

const props = defineProps<{
  /** The token of the link, from its query. */
  token?: string
  /** Copy for this page, over app config and the translations. */
  labels?: LabelGroupOverrides<'deletion'>
}>()

const keeping = useKeepAccount(() => props.token, () => props.labels)
const { state, error, announcement, bind } = keeping
const { t } = keeping.labels

// Once the answer is in, the button is gone: focus moves to the sentence that says it.
const root = ref<HTMLElement | null>(null)
const note = ref<HTMLElement | null>(null)
const { remember } = useOutcomeFocus(root, note, () => state.value === 'kept' || state.value === 'nothing')
</script>

<template>
  <div
    ref="root"
    data-deletion="keep-page"
    :data-state="state"
    :aria-busy="state === 'pending' || undefined"
  >
    <p
      v-if="state === 'no-token'"
      data-deletion="message"
    >
      {{ t('noToken') }}
    </p>
    <template v-else>
      <p
        ref="note"
        tabindex="-1"
        data-deletion="message"
      >
        {{ state === 'kept' ? t('done') : state === 'nothing' ? t('nothing') : t('intro') }}
      </p>
      <button
        v-if="state !== 'kept' && state !== 'nothing'"
        v-bind="bind.keep.value"
        @click.capture="remember"
      >
        {{ state === 'pending' ? t('keeping') : t('keep') }}
      </button>
    </template>
    <p
      v-if="error"
      v-bind="bind.error.value"
    >
      {{ error }}
    </p>
    <span v-bind="bind.status.value">{{ announcement }}</span>
  </div>
</template>
