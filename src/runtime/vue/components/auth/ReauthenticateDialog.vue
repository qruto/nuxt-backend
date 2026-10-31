<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'
import { useLabels, type BackendLabels, type LabelOverrides } from '../../composables/use-labels'
import { type ReauthenticationStep, useDialogTurn, useReauthentication } from '../../composables/use-reauthentication'
import { preloadPasskeyCeremony } from '../../passkey-client'
import { useModalFocus } from '../../utils/focus-return'
import { provideReauthenticateView, type ReauthenticateDialogSlots } from './reauthenticate'

/**
 * "Confirm it's you": the dialog a sensitive action opens when the server
 * refuses it as `reauthentication_required`. The person signs in again
 * with a passkey, or with a code emailed to the account's own address, and
 * the action runs once more (`useReauthentication().withReauthentication`).
 * The code request passes the bot check as the sign-in form's does: when
 * the challenge asks for a click, its widget shows inside this dialog,
 * where the person can reach it.
 *
 * A native modal `<dialog>`: it takes focus on its first control, keeps it
 * inside, closes on Escape or "Cancel" (what waits then rejects with the
 * refusal), and gives focus back to the control that had it. Mount it once
 * in your layout; the packaged pages and settings components carry their
 * own, and of every one on the page only the oldest opens.
 *
 * @example
 * ```vue
 * <!-- app.vue -->
 * <template>
 *   <NuxtPage />
 *   <ReauthenticateDialog />
 * </template>
 * ```
 */
defineOptions({ name: 'ReauthenticateDialog' })

const props = withDefaults(defineProps<{
  /** Copy for this dialog, over `appConfig.backend.labels.reauthenticate` and the translations. */
  labels?: LabelOverrides<BackendLabels['reauthenticate']>
}>(), { labels: undefined })

const emit = defineEmits({
  /** The person signed in again: the waiting action runs once more. */
  reauthenticated: () => true,
  /** The person closed it: the waiting action rejects. */
  cancelled: () => true,
  /** A step failed: the sentence `error.message` holds. */
  error: (_message: string) => true,
  step: (_step: ReauthenticationStep) => true,
})
const slots = defineSlots<ReauthenticateDialogSlots>()

const labels = useLabels('reauthenticate', () => props.labels)
const { t, errorMessage } = labels
const reauth = useReauthentication()
const turn = useDialogTurn()
const open = computed(() => turn.active.value && reauth.isRequired.value)
const id = useId()
const titleId = `${id}-title`
const errorId = `${id}-error`
const dialog = ref<HTMLDialogElement | null>(null)

// Whether this browser can run a passkey ceremony, read after mount so the
// server render and the first client render agree.
const passkeys = ref<boolean | null>(null)
onMounted(() => {
  passkeys.value = typeof window.PublicKeyCredential === 'function'
})

// Opening moves focus to the first step's first control; the dialog leaves
// the page as it closes, and focus goes back where it was (nothing outside
// a modal dialog takes focus while it is open).
const modal = useModalFocus(dialog)
const show = () => modal.show('[data-reauthenticate^="step-"] button, [data-reauthenticate^="step-"] input', preloadPasskeyCeremony)

async function hide(): Promise<void> {
  if (turn.outcome() === 'confirmed') emit('reauthenticated')
  else emit('cancelled')
  await modal.hide()
}

watch(open, (now, before) => {
  if (now) void show()
  else if (before) void hide()
})
onMounted(() => {
  if (open.value) void show()
})

// The state is the app's: only the dialog that is open speaks for it.
// Each step replaces the markup that held focus: move it to the new step's first control.
watch(reauth.step, (step) => {
  if (!open.value) return
  emit('step', step)
  void nextTick(() => {
    dialog.value?.querySelector<HTMLElement>('[data-reauthenticate^="step-"] input, [data-reauthenticate^="step-"] button')?.focus()
  })
})

const errorText = computed(() => (reauth.error.value ? errorMessage(reauth.error.value) : null))
watch(errorText, (value) => {
  if (value && open.value) emit('error', value)
})

provideReauthenticateView({
  labels,
  passkeys,
  byPerson: action => () => {
    if (reauth.isPending.value) return
    void action()
  },
  sentId: `${id}-sent`,
  errorId,
  describesError: () => !slots.error,
  errorText,
})

const cancel = () => reauth.cancel()
</script>

<template>
  <dialog
    v-if="open"
    ref="dialog"
    data-reauthenticate="dialog"
    data-state="open"
    :aria-labelledby="titleId"
    :aria-busy="reauth.isPending.value ? 'true' : undefined"
    :data-loading="reauth.isPending.value ? '' : undefined"
    @cancel.prevent="cancel"
  >
    <h2
      :id="titleId"
      data-reauthenticate="title"
    >
      {{ t('title') }}
    </h2>
    <p data-reauthenticate="intro">
      {{ t('intro') }}
    </p>
    <slot
      v-if="reauth.step.value === 'choose'"
      name="choose"
      v-bind="reauth"
    >
      <ReauthenticatePasskey :flow="reauth" />
    </slot>
    <slot
      v-else
      name="verify-code"
      v-bind="reauth"
    >
      <ReauthenticateCode :flow="reauth" />
    </slot>
    <slot
      v-if="errorText"
      name="error"
      v-bind="reauth"
    >
      <p
        :id="errorId"
        data-reauthenticate="error"
        role="alert"
      >
        {{ errorText }}
      </p>
    </slot>
    <div data-reauthenticate="actions">
      <slot
        name="footer"
        v-bind="reauth"
      />
      <button
        data-reauthenticate="cancel"
        type="button"
        @click="cancel"
      >
        {{ t('cancel') }}
      </button>
    </div>
  </dialog>
</template>
