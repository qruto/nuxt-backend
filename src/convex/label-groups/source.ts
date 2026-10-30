import type { LabelTree } from '../label-format.js'

/**
 * `<HowDidYouHear>`: one optional question after sign-up. Each answer's text
 * is a label under `options`, by the answer's name in camel case
 * (`ai-assistant` reads `options.aiAssistant`); an answer of the app's own
 * with no label reads as its name.
 */
const SOURCE_LABELS = {
  title: 'How did you hear about us?',
  hint: 'Optional: it helps us know what works.',
  options: {
    friend: 'A friend or colleague',
    search: 'A search engine',
    aiAssistant: 'An AI assistant (ChatGPT, Claude, Perplexity…)',
    social: 'Social media',
    podcast: 'A podcast',
    other: 'Somewhere else',
  },
  // The free-text field shown once "Somewhere else" is picked.
  otherLabel: 'Where?',
  submit: 'Continue',
  saving: 'Saving…',
  skip: 'Skip',
  // Said once the answer (or the skip) is kept.
  thanks: 'Thanks for telling us.',
  // Said in place of the question to someone who answered it already.
  answered: 'You already told us how you found us.',
  // The question needs a sign-in: said to someone signed out.
  signedOut: 'Sign in to answer.',
  loading: 'Loading…',
} satisfies LabelTree

export default SOURCE_LABELS
