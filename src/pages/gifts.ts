import { DEFAULT_GIFTS_PATH } from '../convex/constants'
import { definePage } from './define'

/** The gifts a person sent and received, with resend, change, cancel and claim (private). Default `/gifts`. */
export default definePage({ key: 'gifts', defaultPath: DEFAULT_GIFTS_PATH, file: 'gifts', auth: true })
