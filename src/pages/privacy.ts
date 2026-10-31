import { DEFAULT_PRIVACY_PATH } from '../convex/constants'
import { definePage } from './define'

/** The privacy policy (public): who runs the app, the data map, the subprocessors, the cookies and how a person exports or deletes their data, filled from `appConfig.backend.legal` and the capabilities the app uses, and marked "not legal advice". Default `/legal/privacy`. */
export default definePage({ key: 'privacy', defaultPath: DEFAULT_PRIVACY_PATH, file: 'privacy', auth: false })
