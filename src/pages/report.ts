import { DEFAULT_REPORT_PATH } from '../convex/constants'
import { definePage } from './define'

/** The public notice form (DSA Art. 16, the TAKE IT DOWN Act's removal request), open to people without an account, and where a statement of reasons' appeal link lands (`#appeal=<token>`). Default `/report`. */
export default definePage({ key: 'report', defaultPath: DEFAULT_REPORT_PATH, file: 'report', auth: false })
