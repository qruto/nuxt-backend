import { DEFAULT_ADMIN_PATH } from '../convex/constants'
import { definePage } from './define'

/** The admin console: accounts, workspaces, the activity trail and the app's health (private and hidden: it answers 404 to anyone without the `admin` role). Default `/admin`. */
export default definePage({ key: 'admin', defaultPath: DEFAULT_ADMIN_PATH, file: 'admin', auth: true, access: { role: 'admin', hidden: true } })
