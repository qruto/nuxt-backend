import type { LabelTree } from '../label-format.js'

/** `<WorkspaceSettings>` and the settings page. */
const SETTINGS_LABELS = {
  title: 'Settings',
  // Announced while the plan or the credits load.
  loading: 'Loading…',
  workspaces: 'Workspaces',
  active: 'Active',
  switch: 'Switch',
  switching: 'Switching…',
  workspaceName: 'Workspace name',
  create: 'Create workspace',
  creating: 'Creating…',
  created: 'Workspace “{name}” created.',
  plan: 'Plan',
  free: 'Free',
  unknownPlan: 'Unknown plan',
  planActive: 'Active',
  cancels: 'Cancels at period end',
  renews: 'renews {date}',
  viewPlans: 'View plans',
  cancel: 'Cancel plan',
  canceling: 'Canceling…',
  canceled: 'Subscription set to cancel at period end.',
  // The plan's state, by the subscription's, then when it changes next.
  onTrial: 'On trial',
  trialEnds: 'trial ends {date}',
  pastDue: 'Payment failed',
  pastDueHint: 'The last payment did not go through. Update the payment method to keep the plan.',
  paused: 'Paused',
  resumes: 'resumes {date}',
  ends: 'ends {date}',
  changing: 'Plan change scheduled',
  changesTo: 'switches to {plan} on {date}',
  // What a member who manages none of the workspace's billing reads in place of the plan's buttons.
  managed: 'Your workspace\'s owner and admins manage its plan.',
  // The plan's buttons, what each says while it runs, and how it went.
  portal: 'Manage billing',
  updatePayment: 'Update payment method',
  openingPortal: 'Opening the portal…',
  resume: 'Resume plan',
  resuming: 'Resuming…',
  resumed: 'The plan runs again.',
  keepPlan: 'Keep plan',
  keeping: 'Keeping the plan…',
  kept: 'The plan renews again.',
  // A plan pass: gifted until its end date, with the one offer to keep the plan.
  gifted: 'Gifted',
  giftedUntil: 'gifted until {date}',
  keepGiftedPlan: 'Keep this plan',
  keepingGiftedPlan: 'Opening checkout…',
  cancelChange: 'Cancel the change',
  cancelingChange: 'Canceling the change…',
  changeCanceled: 'The plan change is canceled.',
  // Cancelling takes one step: what ends when, and the one button that cancels.
  confirmTitle: 'Cancel the plan',
  confirmEnds: 'The plan ends on {date}. Everything it includes stays until then.',
  confirmEndsPeriod: 'The plan ends with the current period. Everything it includes stays until then.',
  confirmCancel: 'Confirm cancellation',
  // Switching the plan or its billing period: a picker of the prices on
  // sale, then one confirmation of the price, when the switch happens and
  // how the period settles. {price} is the price with its period.
  changePlan: 'Change plan',
  switchTo: 'Switch to',
  choosePlan: 'Choose a plan',
  billedAt: {
    month: '{plan}, billed monthly',
    year: '{plan}, billed yearly',
  },
  period: {
    month: '/mo',
    year: '/yr',
  },
  changeTitle: 'Switch to {plan}?',
  changeNow: '{price} from now on. The switch happens at once, and the difference for this period is settled now.',
  changeLater: '{price} from {date}. The year you paid for runs out first: the switch happens when it ends.',
  changeLaterPeriod: '{price} once the year you paid for runs out: the switch happens when it ends.',
  // During a trial: the trial carries over to the new plan, or the switch ends it with a first payment, or a switch that waits happens when it ends.
  changeTrial: '{price} from now on. The switch happens at once and your trial carries over: nothing is charged until it ends.',
  changeTrialEnds: '{price} from now on. The switch happens at once and ends your trial, so the first payment is charged now.',
  changeTrialLater: '{price} once your trial ends: the switch happens then.',
  confirmChange: 'Confirm switch',
  switchingPlan: 'Switching the plan…',
  keepCurrent: 'Not now',
  switched: 'The plan is now {plan}.',
  switchScheduled: 'On {date}, the plan switches to {plan}.',
  switchScheduledPeriod: 'The plan switches to {plan} when the year you paid for runs out.',
  // Pausing: from the period's end, for one to three months, then it resumes by itself.
  pause: 'Pause plan',
  pauseTitle: 'Pause the plan',
  pauseFrom: 'The plan pauses when this period ends, on {date}, and resumes by itself after the months you pick. Nothing is charged while it is paused.',
  pauseFromPeriod: 'The plan pauses when this period ends, and resumes by itself after the months you pick. Nothing is charged while it is paused.',
  pauseFor: 'Pause for',
  pauseMonths: '{count} month | {count} months',
  confirmPause: 'Confirm pause',
  pausing: 'Pausing…',
  pauseScheduled: 'The plan pauses when this period ends and resumes {date}.',
  pauseScheduledPeriod: 'The plan pauses when this period ends.',
  // Back from checkout, while the new plan is read.
  finishingPurchase: 'Finishing your purchase…',
  // What the plan includes, by what each benefit gives.
  benefits: 'Included',
  benefitKinds: {
    license_key: 'License key',
    download: 'Downloads',
    community: 'Community access',
    repository: 'Repository access',
    shared_channel: 'Shared channel',
    custom: 'Perk',
    credits: 'Credits',
    feature: 'Feature',
    other: 'Benefit',
  },
  files: '{count} file | {count} files',
  benefitsPortal: 'Whole keys, files and connected accounts are in the billing portal.',
  // The credits section, by the meter's unit as a heading; `{unit}` as the `credits` group says.
  credits: '{unit}',
  balance: '{count} {unit}',
  // While the balance loads.
  balanceUnknown: '— {unit}',
  credited: '{count} credited',
  used: '{count} used',
  // A credit pack's button, by the pack's product name.
  buyPack: 'Buy {pack}',
  toppingUp: 'Opening checkout…',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
} satisfies LabelTree

export default SETTINGS_LABELS
