import { DEFAULT_REFERRAL_PATH } from '../convex/constants'
import { definePage } from './define'

/** Where a referral link lands (`/r/<code>`; public, kept out of search indexes): it says who invited the visitor and what they get, and signing up there claims the referral. Default `/r/:code`. */
export default definePage({ key: 'referral', defaultPath: DEFAULT_REFERRAL_PATH, file: 'referral', auth: false, noindex: true })
