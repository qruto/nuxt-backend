import { DEFAULT_SETTINGS_PATH } from '../convex/constants'
import { definePage } from './define'

/** Workspace, plan and credit settings, and the workspace's activity for its owners and admins (private). Default `/settings`. */
export default definePage({ key: 'settings', defaultPath: DEFAULT_SETTINGS_PATH, file: 'settings', auth: true })
