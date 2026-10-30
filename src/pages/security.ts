import { DEFAULT_SECURITY_PATH } from '../convex/constants'
import { definePage } from './define'

/** Passkeys, sessions, account deletion and the account's recent activity (private). Default `/security`. */
export default definePage({ key: 'security', defaultPath: DEFAULT_SECURITY_PATH, file: 'security', auth: true })
