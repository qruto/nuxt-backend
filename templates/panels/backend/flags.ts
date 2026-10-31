import { defineFlags, setupFlags } from 'nuxt-backend/flags'
import { components } from './_generated/api'
import { audit } from './audit'
import { billing } from './billing'

// Feature flags, read inside your own queries and mutations, and the
// kill switches the package honors: pause sign-ups, checkout or AI, and
// put up a maintenance banner. Flip them from the admin console's Flags
// tab; every change takes a recent sign-in and is recorded on the
// activity trail. Declare yours here, then read one on the server:
//   await flags.requireFlag(ctx, 'newEditor')
// and in a page: const { isEnabled } = useFlag('newEditor')
// A flag with variants is an experiment: read it with useExperiment(key)
// in a page and flags.variant(ctx, key) on the server, and compare the
// variants in the admin console's Analytics tab.
export const flags = setupFlags(components, {
  flags: defineFlags({
    // An experiment: does a row of example ideas under the field lead to more
    // finished strips? The strips page reads it with useExperiment, and the
    // admin console's Analytics tab compares the variants by the goal.
    ideaExamples: {
      default: false,
      description: 'Example ideas under the field for a new strip.',
      variants: ['plain', 'examples'],
      goal: 'app.strip_ready',
    },
  }),
  audit,
  // A flag's plan targets match the plans the caller's billing entity is on.
  billing,
})

// The reads behind useFlag, useExperiment, useFlagAdmin, <BackendNotices>,
// the Flags tab and the Experiments view.
export const { getFlags, listFlags, setFlag, exposeExperiment, getExperiments } = flags.api
