import { DEFAULT_ACCESSIBILITY_PATH } from '../convex/constants'
import { definePage } from './define'

/** The accessibility statement (public): the standard the app follows, how it is checked, and where to report a barrier, filled from `appConfig.backend.legal` and marked "not legal advice". Default `/legal/accessibility`. */
export default definePage({ key: 'accessibility', defaultPath: DEFAULT_ACCESSIBILITY_PATH, file: 'accessibility', auth: false })
