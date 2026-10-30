import type { NotificationItem } from '../../composables/use-notifications'

/** `<NotificationInbox>`'s slots. */
export interface NotificationInboxSlots {
  /** One row of the list: an `<li>`. Receives the notification, worded, and the way to mark it read. */
  notification: (scope: { notification: NotificationItem, markRead: () => Promise<void> }) => unknown
  /** The list with nothing in it. */
  empty: () => unknown
}
