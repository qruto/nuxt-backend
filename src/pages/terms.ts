import { DEFAULT_TERMS_PATH } from '../convex/constants'
import { definePage } from './define'

/** The terms of service (public): the company and contact, accounts and sign-in, plans and renewal, the merchant of record's role and the content rules, filled from `appConfig.backend.legal` and the capabilities the app uses, and marked "not legal advice". Default `/legal/terms`. */
export default definePage({ key: 'terms', defaultPath: DEFAULT_TERMS_PATH, file: 'terms', auth: false })
