import { useId } from 'vue'
import { formatBillingDate } from '../../composables/billing-format'
import { type Suppression, useSuppressionsAdmin } from '../../composables/use-suppressions-admin'
import { useAdminChanges } from '../../utils/admin-changes'
import type { ConfirmFn } from '../../utils/confirmation'

// The Suppressions tab's state and actions, headless:
// `AdminSuppressions.vue` renders it. The addresses the email provider
// stopped delivering to, newest first; each lifts behind a confirmation and
// a recent sign-in, its outcome in the tab's message.

/**
 * The Suppressions tab, as state and actions.
 *
 * @internal
 */
export function useSuppressionsTab(confirm?: () => ConfirmFn | undefined) {
  const admin = useSuppressionsAdmin()
  const changes = useAdminChanges(confirm)
  const { t, errorMessage, locale, message, running, change, busy, confirmation, confirmed } = changes
  const id = useId()

  async function lift(row: Suppression) {
    if (running.value || !await confirmed(t('suppressions.liftConfirm', { email: row.email }))) return
    await change(`lift:${row.email}`, () => admin.lift(row.email), () => t('suppressions.lifted', { email: row.email }))
  }

  return {
    id,
    t,
    errorMessage,
    admin,
    message,
    running,
    busy,
    confirmation,
    lift,
    originName: (row: Suppression) => t(`suppressions.origins.${row.origin}`),
    date: (at: number) => formatBillingDate(at, { dateStyle: 'medium', timeStyle: 'short' }, locale.value),
  }
}
