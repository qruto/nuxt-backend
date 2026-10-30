<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { type DeletionNoticeSlotContext, useDeletionNotice } from '../../composables/use-deletion-notice'
import { focusDropped, focusedIn, returnFocus } from '../../utils/focus-return'
import { useShownFirst } from '../../utils/shown-first'
import { VNodes } from '../../utils/vnodes'
import { turnedOff } from './notices'

/**
 * `<BackendNotices>`' deletion notice, while the account's deletion waits
 * out its grace period: the date, and a button that keeps the account. Once
 * kept, it says so as a polite status until the page changes. The logic is
 * `useDeletionNotice`; the app's `deletion` slot replaces the content, and
 * an empty one turns the notice off.
 *
 * @internal
 */
defineOptions({ name: 'NoticeDeletion' })
const props = defineProps<{ slotContent?: (context: DeletionNoticeSlotContext) => unknown }>()
const notice = useDeletionNotice()
const shown = useShownFirst('deletion')
const { deletion, kept, visible, message, isPending, error, announcement, keep, bind } = notice
const { t } = notice.labels

// Once the account is kept, the keep button is gone: focus moves to the sentence that says so,
// unless the person moved on to another control meanwhile.
const root = ref<HTMLElement | null>(null)
const note = ref<HTMLElement | null>(null)
let hadFocus = false
/** Asked as the button is pressed, before anything changes. */
const remember = () => {
  hadFocus = focusedIn(root.value) !== null
}
watch(kept, async (now) => {
  if (!now) return
  await nextTick()
  if (hadFocus && focusDropped()) returnFocus(note.value)
  hadFocus = false
})

const scope = computed<DeletionNoticeSlotContext | null>(() => deletion.value
  ? { deletion: deletion.value, message: message.value, keep, isPending: isPending.value, error: error.value }
  : null)
</script>

<template>
  <aside
    v-if="shown && visible && !(scope && turnedOff(props.slotContent, scope))"
    ref="root"
    v-bind="bind.root.value"
  >
    <VNodes
      v-if="scope && props.slotContent"
      :nodes="props.slotContent(scope) as never"
    />
    <template v-else-if="scope">
      <p v-bind="bind.message.value">
        {{ message }}
      </p>
      <button
        v-bind="bind.keep.value"
        @click.capture="remember"
      >
        {{ isPending ? t('keeping') : t('keep') }}
      </button>
      <p
        v-if="error"
        v-bind="bind.error.value"
      >
        {{ error }}
      </p>
    </template>
    <p
      v-else-if="kept"
      ref="note"
      tabindex="-1"
      v-bind="bind.message.value"
    >
      {{ t('kept') }}
    </p>
    <span v-bind="bind.status.value">{{ announcement }}</span>
  </aside>
</template>
