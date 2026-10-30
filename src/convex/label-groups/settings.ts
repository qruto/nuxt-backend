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
  credits: 'Credits',
  balance: '{count} credit | {count} credits',
  // While the balance loads.
  balanceUnknown: '— credits',
  credited: '{count} credited',
  used: '{count} used',
  // A credit pack's button, by the pack's product name.
  buyPack: 'Buy {pack}',
  toppingUp: 'Opening checkout…',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
} satisfies LabelTree

export default SETTINGS_LABELS
