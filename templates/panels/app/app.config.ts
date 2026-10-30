export default defineAppConfig({
  backend: {
    // <BackendNotices> in the shell offers more credits below this balance.
    billing: { lowCreditsThreshold: 30 },
    // A notification's words are labels, so they read in each person's language.
    labels: {
      notifications: {
        strip_ready: { title: 'Your strip is ready', body: 'Open it to read and share it.' },
      },
      // Panels' own refusals (backend/strips.ts), each a code and a reason,
      // read as errors.<code>_<reason>.
      errors: {
        forbidden_passkey_required: 'On the public demo, an idea of your own needs a passkey sign-in. Add a passkey on your security page, sign in with it, or start from one of the ideas above.',
        forbidden_hidden: 'An administrator hid this strip after a report. It can no longer be drawn or changed.',
        not_ready_idea_not_drawn: 'The demo has not drawn this idea yet. Start from another one.',
        invalid_input_not_stopped: 'This strip is still drawing, or done. Nothing to try again.',
      },
    },
  },
})
