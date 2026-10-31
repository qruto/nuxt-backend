<script setup lang="ts">
import { useWaitlistStep } from '../../composables/use-waitlist-step'
import type { WaitlistCodeProps } from '../../parts'
import { useWaitlistFormView } from './waitlist-form'

/** `<WaitlistForm>`'s second step: the sign-in code that proves the address (the double opt-in), and the way back to another address. */
defineOptions({ name: 'WaitlistCode' })
const props = defineProps<WaitlistCodeProps>()
const view = useWaitlistFormView()

const { t, id, errorText, busy } = useWaitlistStep(props.waitlist, view.labels)
</script>

<template>
  <form
    data-waitlist="verify"
    @submit.prevent="waitlist.verify()"
  >
    <p
      data-waitlist="sent-note"
      role="status"
      aria-live="polite"
    >
      {{ t('codeIntro', { email: waitlist.email.value }) }}
    </p>
    <label data-waitlist="label-code">
      {{ t('code') }}
      <input
        v-bind="waitlist.bind.codeInput"
        data-waitlist="input-code"
        :aria-describedby="errorText ? `${id}-error` : undefined"
      >
    </label>
    <p
      v-if="errorText"
      :id="`${id}-error`"
      data-waitlist="error"
      role="alert"
    >
      {{ errorText }}
    </p>
    <button
      type="submit"
      data-waitlist="submit"
      :aria-disabled="busy"
    >
      {{ waitlist.isPending.value ? t('verifying') : t('verify') }}
    </button>
    <button
      type="button"
      data-waitlist="back"
      @click="waitlist.back"
    >
      {{ t('back') }}
    </button>
  </form>
</template>
