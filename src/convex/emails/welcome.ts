import type { EmailMessage, EmailRenderContext, WelcomeEmailData } from '../email-templates.js'

/** The `welcome` email: sent once, right after an account is created, greeting the person by the name they signed up with. */
export function welcome({ email, name }: WelcomeEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const greeting = name ? t('email.welcome.greetingNamed', { name }) : t('email.welcome.greeting')
  const body = t('email.welcome.body')
  return {
    to: email,
    subject: t('email.welcome.subject'),
    blocks: [{ heading: `${greeting} 🎉` }, { paragraph: body }],
    text: `${greeting} ${body}`,
    preheader: body,
  }
}
