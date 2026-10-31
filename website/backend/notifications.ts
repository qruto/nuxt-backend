import { setupNotifications } from 'nuxt-backend/notifications'
import { components } from './_generated/api'
import { email } from './email'
import { paths } from './paths.generated'
import { routes } from './routes'

// Notifications: the in-app inbox, email and web push. Every event the
// backend records about a person (a role, a passkey, an invitation, a
// payment, a gift, a bounce) reaches the inbox with nothing set up, live
// and in their language, and the kinds that allow it by email (the
// `email` instance words and sends them) and as a push to each device
// they allowed (PUSH_PUBLIC_KEY and PUSH_PRIVATE_KEY, which env push
// generates). An event of your own joins through notify: record it under
// `app.` with audit.recordBackendEvent, say what it becomes here, and give
// its words as labels (your i18n files, passed to setupEmail as messages):
//   notify: { 'app.project_archived': { channels: ['app', 'email', 'push'], link: event => `/projects/${event.targetId}` } }
export const notifications = setupNotifications(components, {
  email,
  paths,
  // The strip-ready event strips.ts records becomes a notification in the
  // inbox, an email, and a push to each device that allowed them. Each
  // person turns each channel on or off on the notifications page
  // (NotifyChannels.vue). Its words are labels: app.config.ts for the
  // inbox, email.ts's messages for the email and the push.
  notify: {
    'app.strip_ready': {
      channels: ['app', 'email', 'push'],
      link: event => routes.strip(event.targetId ?? ''),
    },
  },
})

// The reads and writes behind useNotifications and <NotificationInbox>.
export const { listNotifications, getUnreadCount, markNotificationsRead } = notifications.api

// Each person's channels, kind by kind (the profile's Email section), the
// devices behind usePushSubscription, and the delivery the backend
// schedules for an email or a push (internal, called by name).
export const { getNotificationChannels, setNotificationChannel, getPushConfig, subscribePush, unsubscribePush, deliverNotification } = notifications.api
