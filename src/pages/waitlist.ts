import { DEFAULT_WAITLIST_PATH } from '../convex/constants'
import { definePage } from './define'

/** The waitlist (public, kept out of search indexes): the join in early access, and a person's place in the line, read from the signed token in a status link's fragment; it follows the launch phase. Default `/waitlist`. */
export default definePage({ key: 'waitlist', defaultPath: DEFAULT_WAITLIST_PATH, file: 'waitlist', auth: false, noindex: true })
