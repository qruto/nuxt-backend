import { defaultEmailTemplates } from 'nuxt-backend/auth'
import { defaultGiftEmail } from 'nuxt-backend/billing'
import { query } from './_generated/server'

/**
 * Render every packaged default email template with representative sample data
 * for the /playground/platform/email-templates page. Server-side so the page
 * never bundles the auth/billing server modules; ungated because the payload
 * is static sample content — nothing user-specific.
 */

const SAMPLE = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  otp: '493021',
  url: 'https://app.example.com/verify?token=sample',
}

const OTP_PURPOSES = ['sign-in', 'email-verification', 'forget-password', 'change-email'] as const

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
    const templates = defaultEmailTemplates
    const render = (
      key: string,
      label: string,
      note: string,
      message: { to: string, subject: string, text?: string, html?: string },
      purpose?: string,
    ): Preview => ({
      key,
      label,
      purpose,
      note,
      to: message.to,
      subject: message.subject,
      text: message.text ?? '',
      html: message.html ?? '',
    })

    return [
      ...OTP_PURPOSES.map(purpose => render(
        `otp-${purpose}`,
        'otp',
        'One code template covers every OTP purpose — the subject follows it.',
        templates.otp({ email: SAMPLE.email, otp: SAMPLE.otp, type: purpose }),
        purpose,
      )),
      render(
        'welcome',
        'welcome',
        'Sent once, right after the account is created.',
        templates.welcome({ email: SAMPLE.email, name: SAMPLE.name }),
      ),
      render(
        'verify',
        'verify',
        'Email-verification link (when verification is enabled).',
        templates.verify({ email: SAMPLE.email, url: SAMPLE.url }),
      ),
      render(
        'changeEmail',
        'changeEmail',
        'Confirmation sent to the current address before an email change.',
        templates.changeEmail({ email: SAMPLE.email, newEmail: 'ada@newdomain.example', url: SAMPLE.url }),
      ),
      render(
        'deleteAccount',
        'deleteAccount',
        'Confirmation link before permanent account deletion.',
        templates.deleteAccount({ email: SAMPLE.email, url: SAMPLE.url }),
      ),
      render(
        'invite',
        'invite',
        'Workspace invitation with the accept link (organization plugin).',
        templates.invite({
          email: 'teammate@example.com',
          url: 'https://app.example.com/accept-invitation?id=sample',
          inviterName: SAMPLE.name,
          inviterEmail: SAMPLE.email,
          organizationName: 'Demo team',
          role: 'member',
        }),
      ),
      render(
        'gift',
        'gift',
        'Gift notification from setupBilling — override via `giftEmail`.',
        defaultGiftEmail({
          recipientEmail: 'friend@example.com',
          purchaserName: SAMPLE.name,
          purchaserEmail: SAMPLE.email,
          message: 'Enjoy some credits on me!',
          claimUrl: 'https://app.example.com/',
        }),
      ),
    ]
  },
})
