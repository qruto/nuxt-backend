import type { LabelTree } from '../label-format.js'

/**
 * `<Gate quota>`: what someone whose plan has no room left reads, and
 * the way to a plan that has. `{quota}` is what the quota counts, by its
 * name; `{used}` and `{limit}` are counts. `{plans}` and `{plan}` are
 * the plans on sale that allow enough, as `<UpgradePrompt>` names them.
 */
const QUOTA_LABELS = {
  // While the plan's limits load.
  loading: 'Checking your plan\'s limits…',
  unavailable: 'Your plan\'s limits could not be read.',
  reached: 'You have used {used} of {limit} {quota}.',
  // The plan allows none of it.
  notIncluded: 'Your plan includes no {quota}.',
  // More than one is asked for, and fewer are left.
  needs: 'This needs {amount}.',
  // Once the plans that allow enough are known.
  availableOn: 'More on {plans}.',
  upgrade: 'Upgrade to {plan}',
  // Without a plan to name: the plans are loading, or none on sale allows enough.
  seePlans: 'See plans',
  // A workspace member who manages none of its billing gets no action.
  askManager: 'Ask the workspace\'s owner or an admin to upgrade.',
} satisfies LabelTree

export default QUOTA_LABELS
