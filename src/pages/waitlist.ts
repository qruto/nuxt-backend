import { DEFAULT_WAITLIST_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where a waitlist status link lands (public, kept out of search indexes): a person's place in the line, read from the signed token in the link's fragment. Default `/waitlist`. */
export default definePage({ key: 'waitlist', defaultPath: DEFAULT_WAITLIST_PATH, file: 'waitlist', auth: false, noindex: true })
