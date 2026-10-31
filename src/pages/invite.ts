import { DEFAULT_INVITE_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where an access link lands (public, kept out of search indexes): it checks the link's token and sends the person on to sign in. Default `/invite`. */
export default definePage({ key: 'invite', defaultPath: DEFAULT_INVITE_PATH, file: 'invite', auth: false, noindex: true })
