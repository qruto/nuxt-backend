import { setupEmail } from 'nuxt-backend/email'
import { v } from 'convex/values'
import { components } from './_generated/api'
import { internalAction } from './_generated/server'
import { paths } from './paths.generated'

// Transactional + marketing email over the backend component's email module.
// Delivery uses the EMAIL_* env vars (optional — sends no-op until
// EMAIL_API_KEY is set). It also holds the templates of every email the
// package sends (sign-in codes, welcome, invitations, gifts): auth.ts and
// billing.ts send through it. Restyle one, keeping the rest of its body:
//   templates: { welcome: (data, { byDefault }) => ({ ...byDefault(data), subject: 'Hi!' }) }
// React to delivery events with
// `setupEmail(components, { events: { 'email.bounced': async (ctx, event) => { ... } } })`.
// `paths` (paths.generated.ts) is where an email's unsubscribe link opens.
// Panels' brand, colours and topics: the package's own emails, sign-in codes
// and receipts included, use the same layout. The logo is public/email-logo.png.
export const email = setupEmail(components, {
  paths,
  brand: {
    name: 'Panels',
    logo: '/email-logo.png',
    address: 'Panels, 1 Example Street, 10115 Berlin, Germany',
  },
  theme: {
    colors: { background: '#f6f1e7', card: '#ffffff', text: '#1d1b16', accent: '#e4572e', accentText: '#ffffff' },
  },
  topics: {
    productNews: {
      name: 'Product news',
      description: 'New styles and features, about once a month.',
      subscribedByDefault: false,
    },
  },
  // The words of Panels' own notification (notifications.ts), as its email
  // and its push read them: the same labels app.config.ts gives the inbox.
  messages: {
    en: { backend: { notifications: { strip_ready: { title: 'Your strip is ready', body: 'Open it to read and share it.' } } } },
  },
})

// The read behind useEmailStatus, and the DevTools Email tab's previews
// (internal: only the Convex CLI reaches them, on a dev deployment).
export const { getEmailStatus, previewEmails, sendEmailPreview } = email.api

// The sign-in page's list of sent codes on a sandbox deployment, where they reach no real
// inbox: <SandboxInbox> reads it. It answers only with EMAIL_DEV_INBOX=1 on a deployment that is
// not production, and never shows an administrator's or a passkey-only account's mail.
export const { getSandboxInbox } = email.api

// The preference center: the profile's Email section and useEmailPreferences,
// the unsubscribe page, and `npx nuxt-backend email sync` (internal).
export const { getEmailPreferences, setEmailTopic, unsubscribeAllTopics, getEmailLink, unsubscribeByLink, confirmEmailTopic, recordTimeZone, syncEmail } = email.api

// Announcements: the notice <BackendNotices> shows every signed-in person,
// and the admin console's Announcements tab that publishes it and sends its broadcast.
export const { getAnnouncements, dismissAnnouncement, getAnnouncementsConsole, publishAnnouncement, endAnnouncement, previewAnnouncement, sendAnnouncement, cancelAnnouncement } = email.api

// Addresses the provider stopped delivering to (a hard bounce, a complaint),
// mirrored from its webhook: sign-in shows them an undeliverable step instead
// of sending a code, and the admin console's Suppressions tab lifts one.
export const { getSuppressions, liftSuppression } = email.api

// Send a transactional email from your own server code: another action, a
// scheduled function, or `npx convex run email:send`. Internal on purpose —
// a public action that takes the recipient is an open relay on your verified
// domain for anyone who can sign in.
export const send = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => email.send(ctx, args),
})
