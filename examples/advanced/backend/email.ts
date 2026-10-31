import { setupEmail } from 'nuxt-backend/email'
import { v } from 'convex/values'
import fr from '../i18n/locales/fr.json'
import { components } from './_generated/api'
import { internalAction } from './_generated/server'
import { brand } from './brand.generated'
import { paths } from './paths.generated'

// Transactional + marketing email over the backend component's email module.
// Delivery uses the EMAIL_* env vars (optional — sends no-op until
// EMAIL_API_KEY is set). It also holds the templates of every email the
// package sends (sign-in codes, welcome, invitations, gifts): auth.ts and
// billing.ts send through it. Restyle one, keeping the rest of its body:
//   templates: { welcome: (data, { byDefault }) => ({ ...byDefault(data), subject: 'Hi!' }) }
// React to delivery events with
// `setupEmail(components, { events: { 'email.bounced': async (ctx, event) => { ... } } })`.
//
// CUSTOMIZATION: restyled templates — the transport stays the packaged one;
// only the message bodies change. Auth and billing send through them.
// The app's French messages (i18n/locales/fr.json, the same file the pages
// read) word the packaged emails for an account whose language is French, and
// their links open the French pages (/fr/…), as the i18n `strategy` does.
export const email = setupEmail(components, {
  // Where an email's unsubscribe link opens (paths.generated.ts), and the
  // brand app.config declares (brand.generated.ts).
  paths,
  brand,
  messages: { fr },
  localePaths: 'prefix_except_default',
  templates: {
    otp: ({ email, otp, type }) => ({
      to: email,
      subject: `[Advanced example] Your ${type} code`,
      text: `Your code: ${otp}\n\n(Custom template from backend/email.ts.)`,
    }),
    invite: ({ email, url, inviterName, workspaceName, role }) => ({
      to: email,
      subject: `${inviterName} wants you on ${workspaceName}`,
      text: `Join ${workspaceName} as ${role}: ${url}\n\n(Custom template from backend/email.ts.)`,
    }),
    gift: ({ recipientEmail, purchaserName, item, claimUrl }) => ({
      to: recipientEmail,
      subject: `${purchaserName ?? 'Someone'} sent you a gift on Advanced example`,
      text: `${item}. Sign in to receive it: ${claimUrl}\n\n(Custom template from backend/email.ts.)`,
    }),
  },
})

// The read behind useEmailStatus, and the DevTools Email tab's previews
// (internal: only the Convex CLI reaches them, on a dev deployment).
export const { getEmailStatus, previewEmails, sendEmailPreview } = email.api
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
