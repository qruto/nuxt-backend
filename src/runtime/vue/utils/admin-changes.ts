import { ref } from 'vue'
import { useLabels } from '../composables/use-labels'
import { useReauthentication } from '../composables/use-reauthentication'
import { type ConfirmFn, useConfirmation } from './confirmation'
import { useSettingsMessage } from './settings-message'

/**
 * What an admin console tab's changes share: they run one at a time behind
 * a recent sign-in, the outcome lands in the tab's message (worded when it
 * is read, so a locale switch rewords it), and a destructive change asks
 * first: through the app's `confirm` (read when asking), else in the tab's
 * own `<ConfirmDialog :confirmation>`.
 *
 * @internal
 */
export function useAdminChanges(confirm?: () => ConfirmFn | undefined) {
  const { withReauthentication } = useReauthentication()
  const { t, errorMessage, locale } = useLabels('admin')
  const { note, message } = useSettingsMessage()
  const running = ref<string | null>(null)
  const confirmation = useConfirmation(confirm)

  /** Run one change at a time; `done` words its outcome. A refusal lands in the message too. */
  async function change<T>(key: string, action: () => Promise<T>, done?: (result: T) => string): Promise<T | undefined> {
    if (running.value) return undefined
    note.value = null
    running.value = key
    try {
      const result = await withReauthentication(action)
      if (done) note.value = { ok: true, text: () => done(result) }
      return result
    }
    catch (cause) {
      note.value = { ok: false, text: () => errorMessage(cause) }
      return undefined
    }
    finally {
      running.value = null
    }
  }

  return {
    t,
    errorMessage,
    locale,
    message,
    running,
    /** What `confirmed` asks through: the tab renders `<ConfirmDialog :confirmation>` for it. */
    confirmation,
    /** Ask before a change; resolves `true` to go ahead. */
    confirmed: confirmation.ask,
    change,
    /** `aria-disabled` for the button of a change while it runs. */
    busy: (key: string) => (running.value === key ? 'true' as const : undefined),
  }
}
