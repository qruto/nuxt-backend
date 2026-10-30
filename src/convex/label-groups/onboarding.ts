import type { LabelTree } from '../label-format.js'

/**
 * `<OnboardingFlow>`: the first run at `/welcome`, a few short steps a new
 * account sees once.
 */
const ONBOARDING_LABELS = {
  title: 'Welcome',
  // The step list's name, and the progress line above the step.
  steps: 'Setup steps',
  progress: 'Step {current} of {total}',
  next: 'Continue',
  back: 'Back',
  skip: 'Skip this step',
  finish: 'Get started',
  // Ends the whole first run; the person can find everything later.
  skipAll: 'Skip setup',
  saving: 'Saving…',
  done: 'You are all set.',
  stepNames: {
    profile: 'About you',
    workspace: 'Your workspace',
    teammates: 'Your team',
    plan: 'Your plan',
  },
  profile: {
    heading: 'About you',
    intro: 'This is how teammates see you.',
    name: 'Your name',
    image: 'Picture address (optional)',
    imageHint: 'A link to a picture, starting with https://',
    saved: 'Saved.',
  },
  workspace: {
    heading: 'Your workspace',
    intro: 'Everything you make lives in a workspace. Give yours a name.',
    name: 'Workspace name',
    invitedTo: 'You were invited to {workspace}.',
    accept: 'Join {workspace}',
    accepting: 'Joining…',
    joined: 'You joined {workspace}.',
    declined: 'Invitation declined.',
    decline: 'Not now',
  },
  teammates: {
    heading: 'Invite your team',
    intro: 'Teammates get an email with a link to join. You can do this later in Settings.',
    email: 'Email address',
    send: 'Send invitation',
    sending: 'Sending…',
    sent: 'Invitation sent to {email}.',
    list: 'Invited so far',
  },
  plan: {
    heading: 'Choose a plan',
    intro: 'Pick a plan now, or stay on the free one and decide later.',
    later: 'Decide later',
  },
} satisfies LabelTree

export default ONBOARDING_LABELS
