import { DEFAULT_UNSUBSCRIBE_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where a topic email's unsubscribe link and a double opt-in's confirmation link land (public, kept out of search indexes and caches): one press leaves the topic, or confirms it. Default `/unsubscribe`. */
export default definePage({ key: 'unsubscribe', defaultPath: DEFAULT_UNSUBSCRIBE_PATH, file: 'unsubscribe', auth: false, noindex: true, uncached: true })
