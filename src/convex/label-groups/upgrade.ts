import type { LabelTree } from '../label-format.js'

/**
 * `<UpgradePrompt>`: what someone whose plan lacks a feature reads, and the
 * way to a plan that has it. `{plans}` is the names of the plans on sale
 * that include it, joined the reader's way ("Pro or Ultra"); `{plan}` is
 * the first of them, which the action opens on the pricing page.
 */
const UPGRADE_LABELS = {
  message: 'Your plan doesn\'t include this.',
  // Once the plans that include it are known.
  availableOn: 'Available on {plans}.',
  upgrade: 'Upgrade to {plan}',
  // Without a plan to name: the plans are loading, or none on sale includes it.
  seePlans: 'See plans',
  // A workspace member who manages none of its billing gets no action.
  askManager: 'Ask the workspace\'s owner or an admin to upgrade.',
  // With `:cooldown`: hides the prompt for that long.
  dismiss: 'Not now',
} satisfies LabelTree

export default UPGRADE_LABELS
