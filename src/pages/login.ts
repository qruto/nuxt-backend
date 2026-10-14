import { DEFAULT_LOGIN_PATH } from '../convex/constants'
import { definePage } from './define'

/** The sign-in page (public), and where the auth middleware sends a signed-out visitor. Default `/login`. */
export default definePage({ key: 'login', defaultPath: DEFAULT_LOGIN_PATH, file: 'login', auth: false })
