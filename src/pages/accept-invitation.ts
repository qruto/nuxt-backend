import { DEFAULT_INVITATION_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where an invited person accepts a workspace invitation (private). Default `/accept-invitation`; keep it equal to the Convex-side `organization.invitationPath`. */
export default definePage({ key: 'acceptInvitation', defaultPath: DEFAULT_INVITATION_PATH, file: 'accept-invitation', auth: true })
