import type { LabelTree } from '../label-format.js'

/**
 * `<ConsentPrompt>`: the consents a person is asked to accept again after a
 * version rises, the age question for an account that never answered it, and
 * the consent manager's question about optional storage. The names of the
 * app's own kinds are the `title` of their declaration; `kinds` holds the
 * ones the package knows.
 */
const CONSENT_LABELS = {
  title: 'Before you continue',
  // The names of the documents the package knows, which an app overrides as `consent.kinds.terms`.
  kinds: {
    terms: 'Terms',
    privacy: 'Privacy policy',
  },
  // One document whose version rose, as the prompt's line says it.
  changed: 'The {title} changed. Read it, then accept it to continue.',
  // One document nobody accepted yet.
  needed: 'Accept the {title} to continue.',
  optional: 'Optional',
  required: 'Required',
  // A link to the document.
  read: 'Read the {title}',
  accept: 'I accept the {title}',
  submit: 'Accept',
  saving: 'Saving…',
  later: 'Not now',
  // The age question for an account that never answered it, or answered under a lower minimum.
  ageIntro: 'To keep using the app, tell us how old you are.',
  ageQuestion: 'How old are you?',
  // The consent manager: asked once per browser, only while the app uses optional storage.
  storageTitle: 'Your choices for optional storage',
  storageIntro: 'Beyond what the app needs to work, it can store more on this device. Each is off until you allow it, and you can change your mind at any time.',
  purposes: {
    preferences: 'Remember how I last signed in, and the prompts I dismissed',
    replay: 'Record my visits to help fix errors',
    analytics: 'Measure how the app is used',
  },
  allow: 'Allow',
  decline: 'Decline',
} satisfies LabelTree

export default CONSENT_LABELS
