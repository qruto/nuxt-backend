import type { LabelTree } from '../label-format.js'

/**
 * `<AiLabel>`, beside what a model made: the visible label the EU AI Act
 * (Art. 50) asks for, and with a provenance record, the details it opens.
 * Keep the meaning when you reword it: "AI-generated" or "Made with AI".
 */
const AI_LABELS = {
  label: 'AI-generated',
  // The details, opened from the label: what made it, and where to check.
  details: 'How this was made',
  models: 'Made with {models}',
  madeOn: 'Made on {date}',
  verify: 'Check its content credentials',
} satisfies LabelTree

export default AI_LABELS
