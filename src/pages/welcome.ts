import { DEFAULT_WELCOME_PATH } from '../convex/constants'
import { definePage } from './define'

/** The first run a new account sees once after its first sign-in: name, workspace, teammates and a plan, with steps of your own (private). Default `/welcome`. */
export default definePage({ key: 'welcome', defaultPath: DEFAULT_WELCOME_PATH, file: 'welcome', auth: true })
