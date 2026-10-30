import type { EmailMessage, EmailRenderContext, InviteEmailData } from '../email-templates.js'
import { linkBlocks, plainName } from '../email-helpers.js'

/** The longest inviter name the email shows. */
const INVITER_NAME_LENGTH = 40
/** The longest workspace name the email shows. */
const WORKSPACE_NAME_LENGTH = 60

/**
 * The `invite` email: who invites the person to which workspace, in which
 * role, and the link that accepts. Both names are the inviter's own text,
 * mailed from the app's domain: no link or domain they typed goes along. A
 * workspace name that was nothing else leaves the sentences that name none.
 */
export function invite({ email, url, inviterName, inviterEmail, workspaceName, role }: InviteEmailData, context: EmailRenderContext): EmailMessage {
  const { t } = context
  const inviter = plainName(inviterName, INVITER_NAME_LENGTH) ?? inviterEmail
  const workspace = plainName(workspaceName, WORKSPACE_NAME_LENGTH)
  const intro = workspace ? t('email.invite.intro', { inviter, workspace, role }) : t('email.invite.introUnnamed', { inviter, role })
  const link = context.link(url)
  return {
    to: email,
    subject: workspace ? t('email.invite.subject', { workspace }) : t('email.invite.subjectUnnamed'),
    blocks: [{ paragraph: intro }, ...linkBlocks(link, t('email.invite.action'), context)],
    text: `${intro}\n\n${link}`,
    preheader: intro,
  }
}
