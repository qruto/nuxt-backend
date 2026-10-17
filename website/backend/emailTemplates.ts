import { query } from './_generated/server'
import { email } from './email'

/**
 * Render every email template in effect with representative sample data for
 * the /playground/platform/email-templates page, as email.ts resolves them
 * (the playground overrides `otp`). Server-side so the page never bundles
 * the server modules; ungated because the payload is static sample content —
 * nothing user-specific.
 */

const SAMPLE = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  otp: '493021',
  url: 'https://app.example.com/verify?token=sample',
}

const OTP_PURPOSES = ['sign-in', 'email-verification', 'change-email'] as const

type Preview = {
  key: string
  label: string
  purpose?: string
  note: string
  to: string
  subject: string
  text: string
  html: string
}

export const previews = query({
  args: {},
  handler: async (): Promise<Preview[]> => {
    // An override may render asynchronously, so each preview awaits its message.
    const preview = async (
      key: string,
      label: string,
      note: string,
      rendering: Promise<{ to: string, subject: string, text?: string, html?: string }>,
      purpose?: string,
    ): Promise<Preview> => {
      const message = await rendering
      return {
        key,
        label,
        purpose,
        note,
        to: message.to,
        subject: message.subject,
        text: message.text ?? '',
        html: message.html ?? '',
      }
    }

    return await Promise.all([
      ...OTP_PURPOSES.map(purpose => preview(
        `otp-${purpose}`,
        'otp',
        'One code template covers sign-in, verification and both codes of an email change — the subject follows the purpose.',
        email.render('otp', { email: SAMPLE.email, otp: SAMPLE.otp, type: purpose }),
        purpose,
      )),
      preview(
        'otp-email-change',
        'otp',
        'The first code of an email change, to the current address: its own words, and a warning for a change nobody asked for.',
        email.render('otp', { email: SAMPLE.email, otp: SAMPLE.otp, type: 'email-verification', reason: 'email-change' }),
        'email-change',
      ),
      preview(
        'emailChanged',
        'emailChanged',
        'Sent to the old address once an email change went through.',
        email.render('emailChanged', { email: SAMPLE.email, newEmail: 'ada.lovelace@example.com' }),
      ),
      preview(
        'welcome',
        'welcome',
        'Sent once, right after the account is created.',
        email.render('welcome', { email: SAMPLE.email, name: SAMPLE.name }),
      ),
      preview(
        'deleteAccount',
        'deleteAccount',
        'Confirmation link before permanent account deletion.',
        email.render('deleteAccount', { email: SAMPLE.email, url: SAMPLE.url }),
      ),
      preview(
        'invite',
        'invite',
        'Workspace invitation with the accept link (organization plugin).',
        email.render('invite', {
          email: 'teammate@example.com',
          url: 'https://app.example.com/accept-invitation?id=sample',
          inviterName: SAMPLE.name,
          inviterEmail: SAMPLE.email,
          organizationName: 'Demo team',
          role: 'member',
        }),
      ),
      preview(
        'gift',
        'gift',
        'Gift notification from setupBilling, restyled through `templates.gift` like the rest.',
        email.render('gift', {
          recipientEmail: 'friend@example.com',
          purchaserName: SAMPLE.name,
          purchaserEmail: SAMPLE.email,
          message: 'Enjoy some credits on me!',
          claimUrl: 'https://app.example.com/',
        }),
      ),
    ])
  },
})
