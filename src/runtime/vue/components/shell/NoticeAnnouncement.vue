<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { busyAttributes } from '../../a11y'
import { type LiveAnnouncement, useAnnouncements } from '../../composables/use-announcements'
import { refusalText, useLabels } from '../../composables/use-labels'
import { focusDropped, holdsFocus, returnFocus } from '../../utils/focus-return'
import { useShownFirst } from '../../utils/shown-first'
import { VNodes } from '../../utils/vnodes'
import { type AnnouncementNoticeContext, turnedOff } from './notices'

/**
 * `<BackendNotices>`' announcement notice: what an administrator published
 * from the admin console's Announcements tab, until it expires or the
 * person dismisses it. Read live, so a new one appears without a reload;
 * the words are the administrator's, the controls the `announcement`
 * labels. Nothing while none is live: what stays is an empty live region a
 * new one is announced in.
 *
 * @internal
 */
defineOptions({ name: 'NoticeAnnouncement' })
const props = defineProps<{
  /** The `announcement` slot of `<BackendNotices>`, which replaces the whole notice. */
  slotContent?: (context: AnnouncementNoticeContext) => unknown
}>()

const notices = useAnnouncements()
const labels = useLabels('announcement')
const { t } = labels
const shown = useShownFirst('announcement')
const uid = useId()
const messageId = (id: string) => `${uid}-${id}-message`
const failed = ref<(() => string) | null>(null)

// A dismissed announcement goes with its button: focus moves to the next
// one's button (the one before, when it was the last), never to the top of
// the page. Someone who moved on meanwhile keeps their place.
const region = ref<HTMLElement | null>(null)

async function dismiss(id: string): Promise<void> {
  if (notices.isPending.value) return
  const hadFocus = holdsFocus(region.value)
  const at = Math.max(0, notices.announcements.value.findIndex(item => item.id === id))
  failed.value = null
  try {
    await notices.dismiss(id)
  }
  catch (error) {
    failed.value = () => refusalText(labels, error, t('dismissFailed'))
    return
  }
  await nextTick()
  if (!hadFocus || !focusDropped() || !region.value) return
  const buttons = region.value.querySelectorAll<HTMLElement>('[data-announcement="dismiss"]')
  returnFocus(buttons[Math.min(at, buttons.length - 1)] ?? null)
}

const context = computed<AnnouncementNoticeContext>(() => ({
  announcements: notices.announcements.value,
  dismiss,
  isPending: notices.isPending.value,
}))
const linkOf = (announcement: LiveAnnouncement) => notices.linkOf(announcement)
</script>

<template>
  <template v-if="shown">
    <VNodes
      v-if="props.slotContent && !turnedOff(props.slotContent, context)"
      :nodes="props.slotContent(context) as never"
    />
    <div
      v-else-if="!props.slotContent"
      ref="region"
      data-announcement="region"
    >
      <div
        data-announcement="live"
        role="status"
        aria-live="polite"
      >
        <aside
          v-if="context.announcements.length > 0"
          data-announcement="banner"
          :aria-label="t('label')"
          :aria-busy="context.isPending || undefined"
        >
          <div
            v-for="item in context.announcements"
            :key="item.id"
            data-announcement="item"
            role="group"
            :aria-labelledby="messageId(item.id)"
          >
            <p
              :id="messageId(item.id)"
              data-announcement="message"
            >
              {{ item.message }}
            </p>
            <a
              v-if="linkOf(item)"
              data-announcement="link"
              :href="linkOf(item)!.href"
              :rel="linkOf(item)!.external ? 'noopener' : undefined"
            >{{ item.link?.label || t('link') }}</a>
            <button
              data-announcement="dismiss"
              type="button"
              v-bind="busyAttributes(context.isPending)"
              :aria-describedby="messageId(item.id)"
              @click="dismiss(item.id)"
            >
              {{ t('dismiss') }}
            </button>
          </div>
        </aside>
      </div>
      <p
        v-if="failed"
        data-announcement="error"
        role="alert"
      >
        {{ failed() }}
      </p>
    </div>
  </template>
</template>
