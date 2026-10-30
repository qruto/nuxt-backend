import type { EmailMessage, EmailRenderContext, InviteEmailData } from '../email-templates.js'
import { linkBlocks } from '../email-helpers.js'

/** The `invite` email: who invites the person to which workspace, in which role, and the link that accepts. */
export function invite({ email, url, inviterName, inviterEmail, workspaceName, role }: InviteEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const intro = t('email.invite.intro', { inviter: inviterName || inviterEmail, workspace: workspaceName, role })
  const link = context.link(url)
  return {
    to: email,
    subject: t('email.invite.subject', { workspace: workspaceName }),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.invite.action'), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
