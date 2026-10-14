import { DEFAULT_PROFILE_PATH } from '../convex/constants'
import { definePage } from './define'

/** The account profile (private). Default `/profile`. */
export default definePage({ key: 'profile', defaultPath: DEFAULT_PROFILE_PATH, file: 'profile', auth: true })
