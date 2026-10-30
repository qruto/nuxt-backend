import { DEFAULT_SUBPROCESSORS_PATH } from '../convex/constants'
import { definePage } from './define'

/** The subprocessor list (public): each service that processes personal data for the capabilities the app uses, what it handles, where, and its agreement; marked "not legal advice". Default `/legal/subprocessors`. */
export default definePage({ key: 'subprocessors', defaultPath: DEFAULT_SUBPROCESSORS_PATH, file: 'subprocessors', auth: false })
