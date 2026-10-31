import { DEFAULT_INVITATION_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where an invited person accepts a workspace invitation (private). Default `/accept-invitation`; the module writes it into the functions directory's `paths.generated.ts`, which invitation emails link from. */
export default definePage({ key: 'acceptInvitation', defaultPath: DEFAULT_INVITATION_PATH, file: 'accept-invitation', auth: true })
