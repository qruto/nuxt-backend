<script setup lang="ts">
import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN } from '../../../../convex/inbound-rules'
import { type UseContactFormReturn, useContactForm } from '../../composables/use-contact-form'
import type { LabelGroupOverrides } from '../../composables/use-labels'
import type { BackendError } from '../../utils/backend-error'
import type { ContactFormSlots } from './contact-form'

/**
 * A contact form for visitors, and a feedback form for signed-in people:
 * the same component. Signed out it asks for a name, an address to answer
 * and a message; signed in it sends as the account and asks for the message
 * alone. The deployment checks the message, a hidden honeypot field and the
 * bot check, limits each sender, and stores the message before anything is
 * sent to your team. The form never emails the address someone typed: the
 * confirmation is the form itself. The logic is `useContactForm`, so markup
 * of your own can do the same with its bindings. Needs
 * `submitContactMessage` re-exported from `email.api` in `backend/email.ts`.
 *
 * @example
 * ```vue
 * <ContactForm @sent="thanks = true" />
 * ```
 */
defineOptions({ name: 'ContactForm' })

const props = defineProps<{
  /** Copy for this form, over app config and the translations. */
  labels?: LabelGroupOverrides<'contact'>
}>()

const emit = defineEmits({
  /** The deployment stored the message. */
  sent: () => true,
  /** The message was refused, or failed to go: the refusal, also on screen. */
  error: (_error: BackendError) => true,
})

defineSlots<ContactFormSlots>()

const form: UseContactFormReturn = useContactForm({
  labels: () => props.labels,
  onSent: () => emit('sent'),
  onError: error => emit('error', error),
})
const { t, errorMessage } = form.labels
</script>

<template>
  <div
    data-contact="root"
    :data-state="form.state.value"
  >
    <div
      v-if="form.state.value === 'sent'"
      data-contact="done"
    >
      <slot
        name="sent"
        :another="form.reset"
      >
        <button
          type="button"
          data-contact="another"
          @click="form.reset"
        >
          {{ t('another') }}
        </button>
      </slot>
    </div>
    <form
      v-else
      v-bind="form.bind.root.value"
    >
      <slot
        name="fields"
        v-bind="form"
      >
        <label
          v-if="!form.signedIn.value"
          data-contact="label-name"
        >
          {{ t('name') }}
          <input v-bind="form.bind.nameInput.value">
        </label>
        <label
          v-if="!form.signedIn.value"
          data-contact="label-email"
        >
          {{ t('email') }}
          <input v-bind="form.bind.emailInput.value">
        </label>
        <label data-contact="label-message">
          {{ t('message') }}
          <textarea
            v-bind="form.bind.messageInput.value"
            rows="6"
          />
        </label>
        <p v-bind="form.bind.hint.value">
          {{ t('hint', { min: CONTACT_MESSAGE_MIN, max: CONTACT_MESSAGE_MAX }) }}
          <span data-contact="count">{{ t('count', { count: form.count.value, max: CONTACT_MESSAGE_MAX }) }}</span>
        </p>
        <div
          hidden
          aria-hidden="true"
          data-contact="trap"
        >
          <input v-bind="form.bind.honeypotInput.value">
        </div>
        <button v-bind="form.bind.submit.value">
          {{ form.isPending.value ? t('sending') : t('send') }}
        </button>
        <p data-contact="disclosure">
          {{ t('disclosure') }}
        </p>
      </slot>
    </form>
    <p v-bind="form.bind.status.value">
      {{ form.announcement.value }}
    </p>
    <p
      v-if="form.error.value"
      v-bind="form.bind.errorText.value"
    >
      <slot
        name="error"
        :error="form.error.value"
      >
        {{ errorMessage(form.error.value) }}
      </slot>
    </p>
  </div>
</template>
