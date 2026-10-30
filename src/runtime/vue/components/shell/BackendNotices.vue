<script setup lang="ts">
import type { Component } from 'vue'
import { useShownFirst } from '../../utils/shown-first'
import { type BackendNotice, type BackendNoticesSlots, NOTICE_ORDER } from './notices'
import NoticeDeletion from './NoticeDeletion.vue'
import NoticeGift from './NoticeGift.vue'
import NoticeImpersonation from './NoticeImpersonation.vue'
import NoticeLowCredits from './NoticeLowCredits.vue'
import NoticeMaintenance from './NoticeMaintenance.vue'
import NoticeAnnouncement from './NoticeAnnouncement.vue'
import NoticePastDue from './NoticePastDue.vue'

/**
 * One region for every notice that holds for the whole session, on every
 * page: an administrator acting as the account, maintenance, a failed
 * payment, a scheduled deletion, low credits, a gift to claim and announcements. Place it once in your layout; it renders nothing
 * until a notice applies, then shows each one that does, most important
 * first (`NOTICE_ORDER`). Each notice has a named slot that replaces it and
 * receives its state and actions; an empty slot turns it off. Its words are
 * the `impersonation`, `maintenance`, `pastDue`, `deletion`, `credits`, and
 * `announcement` `gift` labels.
 *
 * The packaged pages render it in their frame. A page shows one region
 * however many are mounted: the first one set up (the layout's, before a
 * packaged page's) shows, so each notice shows and is announced once.
 *
 * @example
 * ```vue
 * <BackendNotices :threshold="25">
 *   <template #low-credits="{ balance, topUp, dismiss }">
 *     <p>Only {{ balance }} credits left.</p>
 *     <button type="button" @click="topUp()">Add credits</button>
 *     <button type="button" @click="dismiss()">Not now</button>
 *   </template>
 *   <template #gift />
 * </BackendNotices>
 * ```
 */
defineOptions({ name: 'BackendNotices' })

const props = withDefaults(defineProps<{
  /** The balance under which the low-credits notice shows. Default: `appConfig.backend.billing.lowCreditsThreshold` (10). */
  threshold?: number
}>(), { threshold: undefined })
defineEmits({})
const slots = defineSlots<BackendNoticesSlots>()
const shown = useShownFirst('notices')

/** Each notice's component, shown in the order `NOTICE_ORDER` gives: most important first. */
const NOTICES: Record<BackendNotice, Component> = { 'impersonation': NoticeImpersonation, 'maintenance': NoticeMaintenance, 'past-due': NoticePastDue, 'deletion': NoticeDeletion, 'low-credits': NoticeLowCredits, 'gift': NoticeGift, 'announcement': NoticeAnnouncement }
/** What a notice's component is given: the app's slot, and the threshold for low credits. */
const noticeProps = (notice: BackendNotice) => ({ slotContent: slots[notice], ...(notice === 'low-credits' ? { threshold: props.threshold } : {}) })
</script>

<template>
  <div
    v-if="shown"
    data-notices="region"
  >
    <component
      :is="NOTICES[notice]"
      v-for="notice in NOTICE_ORDER"
      :key="notice"
      v-bind="noticeProps(notice)"
    />
  </div>
</template>
