import type { BackendError } from '../../utils/backend-error'
import type { UseContactFormReturn } from '../../composables/use-contact-form'

/** `<ContactForm>`'s slots. */
export interface ContactFormSlots {
  /** The fields and the send button, in place of the packaged ones; receives the form's values and its `send`. */
  fields: (form: UseContactFormReturn) => unknown
  /** What follows a message that went through. */
  sent: (scope: { another: () => void }) => unknown
  /** Why a message was refused. */
  error: (scope: { error: BackendError }) => unknown
}
