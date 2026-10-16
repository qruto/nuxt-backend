import { DEFAULT_PRICING_PATH } from '../convex/constants'
import { definePage } from './define'

/** The pricing page (public). Default `/pricing`. */
export default definePage({ key: 'pricing', defaultPath: DEFAULT_PRICING_PATH, file: 'pricing', auth: false })
