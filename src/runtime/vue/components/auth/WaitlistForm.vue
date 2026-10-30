<script setup lang="ts">
import { computed, watch } from 'vue'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import { useLabels } from '../../composables/use-labels'
import { useWaitlist, type UseWaitlistReturn, type WaitlistPlace } from '../../composables/use-waitlist'
import { provideWaitlistFormView, type WaitlistFormSlots } from './waitlist-form'

/**
 * Join the waitlist: the address, your questions, the launch-news box
 * (unticked), then the sign-in code that proves the address, then the
 * person's place, a link to share and a way to leave. It runs the steps of
 * `useWaitlist()` and renders one slot per step (`join`, `verify`,
 * `status`), each given that object, around the parts `WaitlistJoin`,
 * `WaitlistCode` and `WaitlistPlace` (which renders `WaitlistShare`), each
 * replaced everywhere by a same-named component of the app's. A friend's
 * link the visitor came through is shown beside the form, and can be
 * dropped.
 *
 * The same steps run on the sign-in page, where a new address in early
 * access lands on `<AuthForm>`'s `waitlisted` step, and on the `/waitlist`
 * page, which follows a place by its status link. Semantic markup with
 * `data-waitlist` attributes for styling.
 *
 * @example
 * ```vue
 * <WaitlistForm v-if="phase === 'early-access'" @joined="place => (position = place.position)" />
 * ```
 */
defineOptions({ name: 'WaitlistForm' })

const props = withDefaults(defineProps<{
  /** Copy for this component, over `appConfig.backend.labels.waitlist` and the translations. */
  labels?: LabelGroupOverrides<'waitlist'>
  /** Where this form is, for the Source column of the Waitlist tab (letters, digits and `. : / - _`). Default `form`. */
  source?: string
  /** What to show for each of your questions: its text, by key. Without one, the key is shown. */
  questionLabels?: Record<string, string>
  /** Where a friend's link points: this form's page. Default: the page it is on. */
  shareTo?: string
}>(), { labels: undefined, source: undefined, questionLabels: undefined, shareTo: undefined })

const emit = defineEmits({
  /** The code checked: the address is on the list, at this place. */
  'joined': (_place: WaitlistPlace) => true,
  /** The code signed the person in instead: they hold a ticket, or the app is no longer in early access. */
  'signed-in': () => true,
  /** A person left the list. */
  'left': () => true,
  /** A step failed; the reason is also on screen. */
  'error': (_message: string) => true,
})

defineSlots<WaitlistFormSlots>()

const waitlist = useWaitlist({ ...(props.source ? { source: props.source } : {}) })
const { errorMessage } = useLabels('waitlist', () => props.labels)
const route = computed(() => (typeof window === 'undefined' ? '/' : window.location.pathname))

// The place part unmounts the moment the entry is gone, so the form says so for it.
watch(() => waitlist.step.value, (step, before) => {
  if (before === 'status' && step === 'join') emit('left')
})

// What a part and a slot drive the steps with: a second press while the
// first is on its way starts nothing, and each step's outcome is the form's
// event too.
const steps: UseWaitlistReturn = {
  ...waitlist,
  join: async () => {
    if (waitlist.isPending.value) return
    await waitlist.join()
    if (waitlist.error.value) emit('error', errorMessage(waitlist.error.value))
  },
  verify: async () => {
    if (waitlist.isPending.value) return null
    const place = await waitlist.verify()
    if (place) emit('joined', place)
    else if (waitlist.signedIn.value) emit('signed-in')
    else if (waitlist.error.value) emit('error', errorMessage(waitlist.error.value))
    return place
  },
}

provideWaitlistFormView({
  labels: () => props.labels,
  questionLabels: () => props.questionLabels,
  shareTo: () => props.shareTo ?? route.value,
})
</script>

<template>
  <div
    data-waitlist="root"
    :data-state="waitlist.step.value"
    :aria-busy="waitlist.isPending.value || undefined"
  >
    <slot
      v-if="waitlist.step.value === 'join'"
      name="join"
      v-bind="steps"
    >
      <WaitlistJoin :waitlist="steps" />
    </slot>
    <slot
      v-else-if="waitlist.step.value === 'verify'"
      name="verify"
      v-bind="steps"
    >
      <WaitlistCode :waitlist="steps" />
    </slot>
    <slot
      v-else
      name="status"
      v-bind="steps"
    >
      <WaitlistPlace :waitlist="steps" />
    </slot>
  </div>
</template>
