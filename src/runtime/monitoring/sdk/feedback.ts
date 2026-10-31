// The user feedback widget, in a chunk of its own: ./observe.client.ts
// imports this file only when the app turns it on, so neither the widget nor
// the labels it reads reach a page that does not show it.
import { addIntegration, feedbackIntegration } from '@sentry/nuxt'
import { useLabels } from '../../vue/composables/use-labels'

/**
 * Add the widget, in the words of the `feedback` labels: it asks for no
 * name, address or screenshot. Call it inside the Nuxt app's context.
 */
export function addFeedbackWidget(): void {
  const { t } = useLabels('feedback')
  addIntegration(feedbackIntegration({
    autoInject: true,
    colorScheme: 'system',
    showName: false,
    showEmail: false,
    enableScreenshot: false,
    triggerLabel: t('trigger'),
    triggerAriaLabel: t('trigger'),
    formTitle: t('title'),
    messageLabel: t('message'),
    messagePlaceholder: t('placeholder'),
    isRequiredLabel: t('required'),
    submitButtonLabel: t('submit'),
    cancelButtonLabel: t('cancel'),
    successMessageText: t('sent'),
  }))
}
