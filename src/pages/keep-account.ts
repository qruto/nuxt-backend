import { DEFAULT_KEEP_ACCOUNT_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where the "keep my account" link of a scheduled deletion lands (public, kept out of search indexes). Default `/account/keep`; the module writes it into the functions directory's `paths.generated.ts`, which the deletion email links from. */
export default definePage({ key: 'keepAccount', defaultPath: DEFAULT_KEEP_ACCOUNT_PATH, file: 'keep-account', auth: false, noindex: true, uncached: true })
