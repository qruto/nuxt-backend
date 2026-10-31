import type { LabelTree } from '../label-format.js'

/** `<PricingTable>` and the pricing page. */
const PRICING_LABELS = {
  // The pricing page's heading and document title.
  title: 'Pricing',
  // The EU soft opt-in under a checkout (a topic with `softOptIn`): the notice, and the box that objects.
  emailNotice: 'We\'ll email you about new features.',
  emailOptOut: 'Don\'t email me',
  // The pricing page's meta description, for search results and link previews.
  description: 'Plans and prices.',
  // After each price, by the interval it is billed at.
  period: {
    month: '/mo',
    year: '/yr',
  },
  // The monthly / yearly switch, and what a yearly price saves.
  interval: 'Billing period',
  intervals: {
    month: 'Monthly',
    year: 'Yearly',
  },
  save: 'Save {percent}%',
  // The currency switch, when the catalog prices more than one.
  currency: 'Currency',
  // While the plans load.
  loading: 'Loading plans…',
  empty: 'No plans are configured yet.',
  // What a plan grants every cycle, by its interval.
  credits: {
    month: '{count} credit / month | {count} credits / month',
    year: '{count} credit / year | {count} credits / year',
  },
  // A retired plan, shown only to the people still on it.
  retired: 'No longer offered',
  // A credit pack: what it holds, and how its credits compare.
  packCredits: '{count} credit | {count} credits',
  perCredit: '{price} per credit',
  lessPerCredit: '{percent}% less per credit',
  bestValue: 'Best value',
  // A promotion on a price (`<PricingTable discount>`): its real terms, then
  // the regular price, and its real end as a date. {off} is a percentage or
  // an amount; {price} the regular price with its period.
  promotion: {
    once: '{off} off the first payment, then {price}',
    months: '{off} off for {count} month, then {price} | {off} off for {count} months, then {price}',
    forever: '{off} off for as long as the subscription lasts',
    pack: '{off} off: {price} at checkout',
    ends: 'Offer ends {date}',
  },
  // The contact card's button, when appConfig.backend.billing.contact names none.
  contact: 'Contact us',
  subscribe: 'Subscribe',
  switch: 'Switch to {plan}',
  upgrade: 'Upgrade to {plan}',
  downgrade: 'Downgrade to {plan}',
  // A subscriber's own plan, billed at the other interval.
  switchInterval: {
    month: 'Switch to monthly billing',
    year: 'Switch to yearly billing',
  },
  // The price a plan change scheduled for the period's end moves the subscription to, and when.
  scheduled: 'Starts on {date}',
  cancel: 'Cancel plan',
  uncancel: 'Keep plan',
  // The free trial the live product offers, by its interval.
  trial: {
    day: '{count}-day free trial',
    week: '{count}-week free trial',
    month: '{count}-month free trial',
    year: '{count}-year free trial',
  },
  current: 'Current',
  signIn: 'Sign in to subscribe',
  // The free plan's card: a visitor's way in, and what a subscriber reads on it.
  signInFree: 'Sign up for free',
  returnsToFree: 'Yours again when your plan ends',
  topUp: 'Top up',
  portal: 'Manage subscription',
  // What a busy button says while its action runs, also announced.
  checkingOut: 'Opening checkout…',
  changing: 'Changing the plan…',
  canceling: 'Canceling…',
  uncanceling: 'Keeping the plan…',
  openingPortal: 'Opening the portal…',
  // What a workspace member who manages none of its billing reads in place of the plan and pack buttons.
  managed: 'Your workspace\'s owner and admins manage its plan and buy its credits.',
  // Back from checkout, while the new plan is read.
  finishingPurchase: 'Finishing your purchase…',
  // Cancelling takes one step: what ends when, and the one button that cancels.
  confirmTitle: 'Cancel the plan',
  confirmEnds: 'The plan ends on {date}. Everything it includes stays until then.',
  confirmEndsPeriod: 'The plan ends with the current period. Everything it includes stays until then.',
  confirmCancel: 'Confirm cancellation',
} satisfies LabelTree

export default PRICING_LABELS
